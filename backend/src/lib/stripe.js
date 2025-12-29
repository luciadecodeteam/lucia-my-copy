"use strict";

const Stripe = require("stripe");
const { getSecretValue, parseSecretValue } = require("./secrets");
const { getFirestore, FieldValue, Timestamp } = require("./firebaseAdmin");

let stripeClientPromise = null;
let stripeSecretsPromise = null;
let tierPriceCache = null;
const METADATA_KEY_LIMIT = 40;
const METADATA_VALUE_LIMIT = 500;

const DEFAULT_SUCCESS_URL = "https://www.luciadecode.com/success";
const DEFAULT_CANCEL_URL = "https://www.luciadecode.com/cancel";

const PLAN_ALLOWANCES = {
  basic: 200,
  medium: 400,
  intensive: 2000,
  total: 6000,
};

const TIER_ALIAS_MAP = new Map(
  Object.entries({
    standard: "basic",
    "standard-monthly": "basic",
    standard_monthly: "basic",
    "standardmonthly": "basic",
    "standard-20": "basic",
    "standard20": "basic",
  })
);

function canonicalizeTier(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (TIER_ALIAS_MAP.has(normalized)) return TIER_ALIAS_MAP.get(normalized);
  if (normalized.startsWith("standard")) return "basic";
  if (normalized === "basic-monthly" || normalized === "basic_monthly") return "basic";
  return normalized;
}

function sanitizeStripeMetadata(input = {}) {
  const out = {};
  const entries = Object.entries(input || {});
  for (const [rawKey, rawValue] of entries) {
    if (rawKey == null) continue;
    const key = String(rawKey).trim();
    if (!key) continue;
    if (rawValue == null) continue;

    let value;
    if (typeof rawValue === "string") {
      value = rawValue;
    } else if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      value = String(rawValue);
    } else {
      try {
        value = JSON.stringify(rawValue);
      } catch (_) {
        value = String(rawValue);
      }
    }

    const trimmedKey = key.slice(0, METADATA_KEY_LIMIT);
    const trimmedValue = value.slice(0, METADATA_VALUE_LIMIT);
    out[trimmedKey] = trimmedValue;
  }
  return out;
}

function getUrls() {
  const successUrl = (process.env.STRIPE_SUCCESS_URL || DEFAULT_SUCCESS_URL).trim();
  const cancelUrl = (process.env.STRIPE_CANCEL_URL || DEFAULT_CANCEL_URL).trim();
  const portalReturnUrl = (process.env.STRIPE_PORTAL_RETURN_URL || successUrl).trim();
  return { successUrl, cancelUrl, portalReturnUrl };
}

function buildTierPriceCache() {
  if (tierPriceCache) return tierPriceCache;
  const read = (keys = []) => {
    for (const key of keys) {
      const value = (process.env[key] || "").trim();
      if (value) return value;
    }
    return "";
  };

  tierPriceCache = {
    basic: read(["PRICE_BASIC", "STRIPE_PRICE_BASIC", "VITE_STRIPE_PRICE_BASIC"]),
    medium: read(["PRICE_MEDIUM", "STRIPE_PRICE_MEDIUM", "VITE_STRIPE_PRICE_MEDIUM"]),
    intensive: read(["PRICE_INTENSIVE", "STRIPE_PRICE_INTENSIVE", "VITE_STRIPE_PRICE_INTENSIVE"]),
    total: read(["PRICE_TOTAL", "STRIPE_PRICE_TOTAL", "VITE_STRIPE_PRICE_TOTAL"]),
  };
  return tierPriceCache;
}

function resolveTierPrice(tier) {
  const prices = buildTierPriceCache();
  const value = prices[String(tier || "").toLowerCase()];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.startsWith("price_") ? trimmed : null;
}

function resolveTierFromPrice(priceId) {
  if (!priceId) return null;
  const prices = buildTierPriceCache();
  const entries = Object.entries(prices);
  for (const [tier, configured] of entries) {
    if (configured && configured.trim() === priceId) {
      return tier;
    }
  }
  return null;
}

async function loadStripeSecrets() {
  if (!stripeSecretsPromise) {
    stripeSecretsPromise = (async () => {
      const directKey = (process.env.STRIPE_SECRET_KEY || "").trim();
      const directWebhook =
        (process.env.STRIPE_WEBHOOK_SECRET || process.env.WEBHOOK_SIGNING_SECRET || "").trim();

      if (directKey) {
        return { secretKey: directKey, webhookSecret: directWebhook || null };
      }

      const secretId = (process.env.LUCIA_STRIPE_SECRET_ARN || "").trim();
      if (!secretId) {
        throw new Error("Stripe secret key not configured");
      }

      const rawSecret = await getSecretValue(secretId);
      const parsed = parseSecretValue(rawSecret);
      if (!parsed) {
        throw new Error(`Secret ${secretId} returned empty value`);
      }

      if (typeof parsed === "string") {
        return { secretKey: parsed.trim(), webhookSecret: null };
      }

      const secretKey =
        parsed.STRIPE_SECRET_KEY ||
        parsed.secretKey ||
        parsed.key ||
        parsed.STRIPE_API_KEY ||
        "";

      const webhookSecret =
        parsed.WEBHOOK_SIGNING_SECRET ||
        parsed.STRIPE_WEBHOOK_SECRET ||
        parsed.webhookSecret ||
        parsed.webhook ||
        parsed.whsec ||
        null;

      if (!secretKey) {
        throw new Error(`Secret ${secretId} does not contain a STRIPE_SECRET_KEY field`);
      }

      return { secretKey: secretKey.trim(), webhookSecret: webhookSecret ? webhookSecret.trim() : null };
    })();
  }
  return stripeSecretsPromise;
}

async function getStripeClient() {
  if (!stripeClientPromise) {
    stripeClientPromise = (async () => {
      const { secretKey } = await loadStripeSecrets();
      const stripe = new Stripe(secretKey, {
        apiVersion: process.env.STRIPE_API_VERSION || "2024-06-20",
      });
      return stripe;
    })();
  }
  return stripeClientPromise;
}

function escapeSearchTerm(term) {
  return String(term ?? "").replace(/[\"']/g, " ");
}

async function findCustomer(stripe, { uid, email }) {
  const candidates = [];
  if (uid) {
    try {
      const search = await stripe.customers.search({
        query: `metadata['firebase_uid']:'${escapeSearchTerm(uid)}'`,
        limit: 1,
      });
      if (search?.data?.length) {
        candidates.push(...search.data);
      }
    } catch (err) {
      if (err?.statusCode !== 404) {
        console.warn("Stripe customer search failed, falling back to list", err.message);
      }
    }
  }

  if (!candidates.length && email) {
    const list = await stripe.customers.list({ email, limit: 1 });
    if (list?.data?.length) {
      candidates.push(...list.data);
    }
  }

  return candidates[0] || null;
}

async function getOrCreateCustomer(stripe, { uid, email }) {
  const existing = await findCustomer(stripe, { uid, email });
  if (existing) return existing;
  const params = { metadata: {} };
  if (uid) params.metadata.firebase_uid = uid;
  if (email) params.email = email;
  return stripe.customers.create(params);
}

async function createCheckoutSessionForTier({ tier, uid, email, price, quantity, metadata }) {
  const stripe = await getStripeClient();
  const { successUrl, cancelUrl } = getUrls();

  const providedMetadata = metadata && typeof metadata === "object" ? { ...metadata } : {};

  let normalizedTier = canonicalizeTier(tier) || null;
  let normalizedUid = typeof uid === "string" && uid.trim() ? uid.trim() : null;
  if (!normalizedUid) {
    normalizedUid = extractUid(providedMetadata);
  }

  let requestedPriceId = null;
  if (typeof price === "string" && price.trim().startsWith("price_")) {
    requestedPriceId = price.trim();
  }

  let resolvedPriceId = requestedPriceId || null;
  if (!resolvedPriceId && normalizedTier) {
    resolvedPriceId = resolveTierPrice(normalizedTier);
  }
  if (!resolvedPriceId && tier) {
    resolvedPriceId = resolveTierPrice(tier);
  }

  let fetchedPrice = null;
  if (requestedPriceId) {
    try {
      fetchedPrice = await stripe.prices.retrieve(requestedPriceId, { expand: ["product"] });
    } catch (err) {
      const e = new Error("Invalid or unknown Stripe price id");
      e.statusCode = 400;
      e.code = "invalid_price";
      throw e;
    }
    resolvedPriceId = fetchedPrice?.id || resolvedPriceId;
  }

  if (!resolvedPriceId) {
    const err = new Error("Invalid or missing price for tier");
    err.statusCode = 400;
    err.code = "invalid_tier";
    throw err;
  }

  const fetchedProductMetadata =
    fetchedPrice &&
    fetchedPrice.product &&
    typeof fetchedPrice.product === "object" &&
    fetchedPrice.product.metadata
      ? fetchedPrice.product.metadata
      : null;
  const fetchedProductId =
    fetchedPrice && fetchedPrice.product
      ? typeof fetchedPrice.product === "string"
        ? fetchedPrice.product
        : fetchedPrice.product?.id || null
      : null;

  if (!normalizedTier) {
    normalizedTier =
      identifyTier({
        metadata: providedMetadata,
        priceId: resolvedPriceId,
        priceMetadata: fetchedPrice?.metadata,
        productMetadata: fetchedProductMetadata,
      }) || canonicalizeTier(resolveTierFromPrice(resolvedPriceId));
  }

  const mergedMetadata = { ...providedMetadata };
  if (normalizedTier) {
    mergedMetadata.tier = mergedMetadata.tier || normalizedTier;
    mergedMetadata.planTier = mergedMetadata.planTier || normalizedTier;
    mergedMetadata.plan_tier = mergedMetadata.plan_tier || normalizedTier;
  }

  if (normalizedUid) {
    mergedMetadata.firebase_uid = mergedMetadata.firebase_uid || normalizedUid;
    mergedMetadata.uid = mergedMetadata.uid || normalizedUid;
    mergedMetadata.client_reference_id = mergedMetadata.client_reference_id || normalizedUid;
  }

  if (resolvedPriceId && !mergedMetadata.price_id) {
    mergedMetadata.price_id = resolvedPriceId;
  }

  if (fetchedProductId && !mergedMetadata.product_id) {
    mergedMetadata.product_id = fetchedProductId;
  }

  if (email && !mergedMetadata.email) {
    mergedMetadata.email = email;
  }

  const sanitizedMetadata = sanitizeStripeMetadata(mergedMetadata);
  const metadataForStripe = { ...sanitizedMetadata };
  const finalUid =
    (typeof sanitizedMetadata.firebase_uid === "string" && sanitizedMetadata.firebase_uid.trim())
      ? sanitizedMetadata.firebase_uid.trim()
      : normalizedUid;
  if (finalUid && !metadataForStripe.firebase_uid) {
    metadataForStripe.firebase_uid = finalUid;
  }

  const resolvedQuantity = (() => {
    const n = Number(quantity);
    if (Number.isFinite(n) && n > 0) {
      return Math.min(Math.floor(n), 999);
    }
    return 1;
  })();

  const isSubscription = fetchedPrice
    ? Boolean(fetchedPrice?.recurring)
    : normalizedTier !== "total";

  const params = {
    mode: isSubscription ? "subscription" : "payment",
    line_items: [{ price: resolvedPriceId, quantity: resolvedQuantity }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: metadataForStripe,
  };

  if (finalUid) {
    params.client_reference_id = finalUid;
  }

  const nestedMetadata = { ...metadataForStripe };
  if (isSubscription) {
    params.subscription_data = { metadata: nestedMetadata };
  } else {
    params.payment_intent_data = { metadata: nestedMetadata };
  }

  if (finalUid || email) {
    try {
      const customer = await getOrCreateCustomer(stripe, { uid: finalUid, email });
      if (customer?.id) {
        params.customer = customer.id;
      }
    } catch (err) {
      console.warn("Failed to attach existing customer, falling back to email", err.message);
      if (email) {
        params.customer_email = email;
      }
    }
  } else if (email) {
    params.customer_email = email;
  }

  if (!params.customer && email && !params.customer_email) {
    params.customer_email = email;
  }

  const session = await stripe.checkout.sessions.create(params);
  return { id: session.id, url: session.url };
}

async function createPortalSession({ uid, email }) {
  if (!uid && !email) {
    throw Object.assign(new Error("uid or email is required to open the billing portal"), {
      statusCode: 400,
    });
  }
  const stripe = await getStripeClient();
  const customer = await findCustomer(stripe, { uid, email });
  if (!customer) {
    const err = new Error("No Stripe customer found for user");
    err.statusCode = 404;
    err.code = "customer_not_found";
    throw err;
  }
  const { portalReturnUrl } = getUrls();
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: portalReturnUrl,
  });
  return { id: session.id, url: session.url };
}

async function verifyWebhookSignature(rawBody, signatureHeader) {
  const { webhookSecret } = await loadStripeSecrets();
  if (!webhookSecret) {
    throw Object.assign(new Error("Stripe webhook secret not configured"), { statusCode: 500 });
  }
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "", "utf8");
  return Stripe.webhooks.constructEvent(payload, signatureHeader, webhookSecret);
}

function identifyTier({ metadata, priceId, priceMetadata, productMetadata }) {
  const meta = metadata || {};
  const tierKeys = [
    meta.tier,
    meta.planTier,
    meta.plan_tier,
    meta.plan,
    meta.subscription_tier,
    meta.billing_tier,
  ];
  const priceMeta = priceMetadata || {};
  tierKeys.push(
    priceMeta.tier,
    priceMeta.planTier,
    priceMeta.plan_tier,
    priceMeta.plan,
    priceMeta.subscription_tier,
    priceMeta.billing_tier,
  );
  const productMeta = productMetadata || {};
  tierKeys.push(
    productMeta.tier,
    productMeta.planTier,
    productMeta.plan_tier,
    productMeta.plan,
    productMeta.subscription_tier,
    productMeta.billing_tier,
  );
  for (const value of tierKeys) {
    const canonical = canonicalizeTier(value);
    if (canonical) return canonical;
  }
  const resolved = resolveTierFromPrice(priceId);
  return canonicalizeTier(resolved);
}

function allowanceForTier(tier) {
  const normalized = canonicalizeTier(tier);
  const amount = normalized ? PLAN_ALLOWANCES[normalized] : null;
  return Number.isFinite(amount) ? amount : null;
}

function toTimestamp(seconds) {
  if (!seconds || typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return Timestamp.fromMillis(seconds * 1000);
}

function extractUid(metadata = {}) {
  const candidates = [
    metadata.firebase_uid,
    metadata.uid,
    metadata.user_id,
    metadata.userId,
    metadata.client_reference_id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function determineUserTier({ status, mode }) {
  const normalizedStatus = typeof status === "string" ? status.toLowerCase() : "";
  const normalizedMode = typeof mode === "string" ? mode.toLowerCase() : "";

  if (["canceled", "incomplete", "incomplete_expired", "unpaid"].includes(normalizedStatus)) {
    return "free";
  }

  if (normalizedMode === "payment") {
    return "pro";
  }

  if (["active", "trialing", "past_due"].includes(normalizedStatus)) {
    return "pro";
  }

  if (["paid", "complete", "completed", "succeeded"].includes(normalizedStatus)) {
    return "pro";
  }

  if (!normalizedStatus && normalizedMode === "subscription") {
    return null;
  }

  return null;
}

async function findUserByCustomer(db, customerId) {
  if (!customerId) return null;
  const users = db.collection("users");

  const primarySnap = await users.where("stripe.customerId", "==", customerId).limit(1).get();
  if (!primarySnap.empty) {
    const doc = primarySnap.docs[0];
    return { uid: doc.id, data: doc.data() };
  }

  const billingSnap = await users.where("billing.stripeCustomerId", "==", customerId).limit(1).get();
  if (!billingSnap.empty) {
    const doc = billingSnap.docs[0];
    return { uid: doc.id, data: doc.data() };
  }

  return null;
}

function isAlreadyExistsError(err) {
  return err?.code === 6 || err?.code === "already-exists";
}

async function ensureEventRecord(db, event) {
  const ref = db.collection("stripe_events").doc(event.id);
  try {
    await ref.create({
      type: event?.type || null,
      createdAt: event?.created ? toTimestamp(event.created) : null,
      status: "pending",
      insertedAt: FieldValue.serverTimestamp(),
    });
    return ref;
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      return null;
    }
    throw err;
  }
}

async function applyPlanUpdate(db, {
  uid,
  customerId,
  subscriptionId,
  priceId,
  productId,
  tier,
  mode,
  status,
  currentPeriodEnd,
  messageAllowance,
  resetUsage,
  event,
}) {
  if (!uid) {
    console.warn("Stripe webhook could not resolve user", {
      eventId: event?.id,
      type: event?.type,
      customerId,
      subscriptionId,
    });
    return;
  }

  const ref = db.collection("users").doc(uid);
  const periodEndTs = toTimestamp(currentPeriodEnd);
  const serverTime = FieldValue.serverTimestamp();
  const canonicalTier = canonicalizeTier(tier);
  const normalizedTier = canonicalTier || null;
  const normalizedMode = typeof mode === "string" && mode ? mode.toLowerCase() : null;
  const normalizedStatus = typeof status === "string" && status ? status.toLowerCase() : null;

  const userTier = determineUserTier({ status: normalizedStatus, mode: normalizedMode });

  const stripeState = {
    customerId: customerId || null,
    subscriptionId: subscriptionId || null,
    priceId: priceId || null,
    productId: productId || null,
    planTier: normalizedTier,
    mode: normalizedMode || null,
    status: normalizedStatus || null,
    currentPeriodEnd: periodEndTs,
    messageAllowance: Number.isFinite(messageAllowance) ? messageAllowance : null,
    lastEventId: event?.id || null,
    lastEventType: event?.type || null,
    updatedAt: serverTime,
  };

  const billingState = {
    status: normalizedStatus || null,
    tier: normalizedTier,
    planTier: normalizedTier,
    mode: normalizedMode || null,
    stripeCustomerId: customerId || null,
    stripeSubscriptionId: subscriptionId || null,
    stripePriceId: priceId || null,
    stripeProductId: productId || null,
    messageAllowance: Number.isFinite(messageAllowance) ? messageAllowance : null,
    currentPeriodEnd: periodEndTs,
    lastEventId: event?.id || null,
    lastEventType: event?.type || null,
    updatedAt: serverTime,
  };

  const update = {
    stripe: stripeState,
    billing: billingState,
    updatedAt: serverTime,
  };

  if (userTier) {
    update.tier = userTier;
  }

  if (resetUsage) {
    update.exchanges_used = 0;
    update.courtesy_used = false;
    update.last_billing_reset_at = FieldValue.serverTimestamp();
  }

  await ref.set(update, { merge: true });
}

async function handleCheckoutSessionEvent(db, event) {
  const session = event?.data?.object;
  if (!session?.id) return;
  const stripe = await getStripeClient();

  let expandedSession = session;
  try {
    expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price", "line_items.data.price.product"],
    });
  } catch (err) {
    console.warn("Failed to retrieve checkout session details", { sessionId: session.id, error: err.message });
  }

  const metadata = Object.assign({}, session?.metadata || {}, expandedSession?.metadata || {});
  let uid = extractUid(metadata) || expandedSession?.client_reference_id || session?.client_reference_id || null;
  const customerId = expandedSession?.customer || session?.customer || null;

  let subscription = null;
  if (expandedSession?.subscription) {
    try {
      subscription = await stripe.subscriptions.retrieve(expandedSession.subscription, {
        expand: ["items.data.price", "items.data.price.product"],
      });
      Object.assign(metadata, subscription?.metadata || {});
    } catch (err) {
      console.warn("Failed to retrieve subscription for checkout session", {
        sessionId: session.id,
        subscriptionId: expandedSession.subscription,
        error: err.message,
      });
    }
  }

  if (!uid && customerId) {
    const found = await findUserByCustomer(db, customerId);
    if (found?.uid) uid = found.uid;
  }

  const lineItems = expandedSession?.line_items?.data || [];
  const firstPrice = lineItems[0]?.price || null;
  const subscriptionPrice = subscription?.items?.data?.[0]?.price || null;

  const priceId = subscriptionPrice?.id || firstPrice?.id || null;
  const product = subscriptionPrice?.product || firstPrice?.product || null;
  const productMetadata =
    product && typeof product === "object" && product.metadata ? product.metadata : null;
  const productId = typeof product === "string" ? product : product?.id || null;
  const tier = identifyTier({
    metadata,
    priceId,
    priceMetadata: subscriptionPrice?.metadata || firstPrice?.metadata,
    productMetadata,
  });
  const messageAllowance = allowanceForTier(tier);

  const mode = expandedSession?.mode || session?.mode || (subscription ? "subscription" : "payment");
  const status = subscription?.status || expandedSession?.payment_status || "active";
  const currentPeriodEnd = subscription?.current_period_end || null;

  const resetUsage = mode === "payment" || (status && status.toLowerCase() === "paid") || (status && status.toLowerCase() === "active");

  await applyPlanUpdate(db, {
    uid,
    customerId,
    subscriptionId: subscription?.id || null,
    priceId,
    productId,
    tier,
    mode,
    status,
    currentPeriodEnd,
    messageAllowance,
    resetUsage,
    event,
  });
}

async function handleInvoicePaymentSucceeded(db, event) {
  const invoice = event?.data?.object;
  if (!invoice) return;
  const stripe = await getStripeClient();

  const metadata = Object.assign({}, invoice?.metadata || {});
  let subscription = null;
  if (invoice?.subscription) {
    try {
      subscription = await stripe.subscriptions.retrieve(invoice.subscription, {
        expand: ["items.data.price", "items.data.price.product"],
      });
      Object.assign(metadata, subscription?.metadata || {});
    } catch (err) {
      console.warn("Failed to retrieve subscription for invoice", {
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription,
        error: err.message,
      });
    }
  }

  let uid = extractUid(metadata);
  if (!uid && invoice?.customer) {
    const found = await findUserByCustomer(db, invoice.customer);
    if (found?.uid) uid = found.uid;
  }

  const lineItems = invoice?.lines?.data || [];
  const firstPrice = lineItems[0]?.price || null;
  const subscriptionPrice = subscription?.items?.data?.[0]?.price || null;

  const priceId = subscriptionPrice?.id || firstPrice?.id || null;
  const product = subscriptionPrice?.product || firstPrice?.product || null;
  const productMetadata =
    product && typeof product === "object" && product.metadata ? product.metadata : null;
  const productId = typeof product === "string" ? product : product?.id || null;

  const tier = identifyTier({
    metadata,
    priceId,
    priceMetadata: subscriptionPrice?.metadata || firstPrice?.metadata,
    productMetadata,
  });
  const messageAllowance = allowanceForTier(tier);

  const status = subscription?.status || invoice?.status || "paid";
  const currentPeriodEnd = subscription?.current_period_end || invoice?.period_end || null;

  await applyPlanUpdate(db, {
    uid,
    customerId: invoice?.customer || null,
    subscriptionId: subscription?.id || invoice?.subscription || null,
    priceId,
    productId,
    tier,
    mode: subscription ? "subscription" : "payment",
    status,
    currentPeriodEnd,
    messageAllowance,
    resetUsage: true,
    event,
  });
}

async function handleInvoicePaymentFailed(db, event) {
  const invoice = event?.data?.object;
  if (!invoice) return;

  const dbUser = invoice?.customer ? await findUserByCustomer(db, invoice.customer) : null;
  const uid = extractUid(invoice?.metadata || {}) || dbUser?.uid || null;
  if (!uid) {
    console.warn("Stripe invoice.payment_failed without mapped user", {
      eventId: event?.id,
      customer: invoice?.customer || null,
    });
    return;
  }

  const existingData = dbUser?.data || {};
  const lastStripe = existingData?.stripe || {};

  await applyPlanUpdate(db, {
    uid,
    customerId: invoice?.customer || lastStripe.customerId || null,
    subscriptionId: invoice?.subscription || lastStripe.subscriptionId || null,
    priceId: lastStripe.priceId || null,
    productId: lastStripe.productId || null,
    tier: lastStripe.planTier || existingData?.billing?.planTier || null,
    mode: "subscription",
    status: "past_due",
    currentPeriodEnd: lastStripe.currentPeriodEnd ? Math.floor(lastStripe.currentPeriodEnd.toMillis() / 1000) : null,
    messageAllowance: lastStripe.messageAllowance ?? existingData?.billing?.messageAllowance ?? null,
    resetUsage: false,
    event,
  });
}

async function handleSubscriptionUpdated(db, event) {
  const subscription = event?.data?.object;
  if (!subscription) return;

  const metadata = Object.assign({}, subscription?.metadata || {});
  const item = subscription?.items?.data?.[0];
  const price = item?.price || null;

  let uid = extractUid(metadata);
  if (!uid && subscription?.customer) {
    const found = await findUserByCustomer(db, subscription.customer);
    if (found?.uid) uid = found.uid;
  }

  const product = price?.product || null;
  const productMetadata = product && typeof product === "object" && product.metadata ? product.metadata : null;
  const productId = typeof product === "string" ? product : product?.id || null;
  const tier = identifyTier({ metadata, priceId: price?.id, priceMetadata: price?.metadata, productMetadata });
  const messageAllowance = allowanceForTier(tier);

  await applyPlanUpdate(db, {
    uid,
    customerId: subscription?.customer || null,
    subscriptionId: subscription?.id || null,
    priceId: price?.id || null,
    productId,
    tier,
    mode: "subscription",
    status: subscription?.status || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    messageAllowance,
    resetUsage: false,
    event,
  });
}

async function handleSubscriptionDeleted(db, event) {
  const subscription = event?.data?.object;
  if (!subscription) return;

  const metadata = Object.assign({}, subscription?.metadata || {});
  let uid = extractUid(metadata);
  if (!uid && subscription?.customer) {
    const found = await findUserByCustomer(db, subscription.customer);
    if (found?.uid) uid = found.uid;
  }

  const item = subscription?.items?.data?.[0];
  const price = item?.price || null;
  const product = price?.product || null;
  const productMetadata = product && typeof product === "object" && product.metadata ? product.metadata : null;
  const productId = typeof product === "string" ? product : product?.id || null;
  const tier = identifyTier({ metadata, priceId: price?.id, priceMetadata: price?.metadata, productMetadata });

  await applyPlanUpdate(db, {
    uid,
    customerId: subscription?.customer || null,
    subscriptionId: subscription?.id || null,
    priceId: price?.id || null,
    productId,
    tier,
    mode: "subscription",
    status: "canceled",
    currentPeriodEnd: subscription?.current_period_end || null,
    messageAllowance: null,
    resetUsage: false,
    event,
  });
}

async function processStripeEvent(db, event) {
  switch (event?.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutSessionEvent(db, event);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(db, event);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(db, event);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(db, event);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(db, event);
      break;
    default:
      console.debug("Stripe webhook ignored", { id: event?.id, type: event?.type });
      break;
  }
}

async function handleWebhookEvent(event) {
  const loggable = {
    id: event?.id,
    type: event?.type,
  };

  const db = getFirestore();
  let eventRef = null;
  try {
    eventRef = await ensureEventRecord(db, event);
    if (!eventRef) {
      console.info("Stripe webhook duplicate", loggable);
      return;
    }

    await processStripeEvent(db, event);

    await eventRef.update({
      status: "processed",
      processedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (eventRef) {
      await eventRef
        .update({
          status: "failed",
          error: err?.message || String(err),
          failedAt: FieldValue.serverTimestamp(),
        })
        .catch(() => {});
    }
    console.error("Stripe webhook handler error", { ...loggable, error: err?.message || String(err) });
    throw err;
  }
}

module.exports = {
  createCheckoutSessionForTier,
  createPortalSession,
  verifyWebhookSignature,
  handleWebhookEvent,
};
