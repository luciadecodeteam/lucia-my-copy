import * as functions from "firebase-functions/v1";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = initializeApp();
const auth = getAuth(app);
const db = getFirestore(app);

// ----- Config -----
const REGION = process.env.FUNCTIONS_REGION || "europe-west3";
const MAIL_COLLECTION = process.env.MAIL_COLLECTION || "mail";

const BRAND = {
  from: "Lucía <hello@luciadecode.com>",
  replyTo: "lucia.decode@proton.me",
  appName: "Lucía",
  continueUrl: process.env.APP_CONTINUE_URL || "https://app.luciadecode.com",
  helpUrl: "https://luciadecode.com",
  supportEmail: "lucia.decode@proton.me",
};

// ----- Utils -----
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ----- Renderers (UPDATED copy) -----
function renderEmail({ displayName, hasVerificationLink, verifyUrl }) {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi,";
  const styles = `
    .container{max-width:560px;margin:0 auto;background:#0b1623;color:#eaf2ff;border-radius:16px;overflow:hidden;font-family:Inter,Segoe UI,Arial,sans-serif}
    .header{padding:28px 28px 0}
    .brand{font-weight:700;font-size:22px;letter-spacing:.3px}
    .card{background:#111c2b;margin:16px;border-radius:12px;padding:20px}
    .btn{display:inline-block;text-decoration:none;padding:12px 18px;border-radius:10px;background:#3a7afe;color:#fff;font-weight:600}
    .muted{color:#a7b6cc;font-size:13px}
    .footer{padding:20px 28px 28px}
    a{color:#8fc1ff}
    h2{margin:16px 0 6px}
    p{line-height:1.55}
  `;

  const confirmBlock = hasVerificationLink
    ? `
      <div class="card" style="text-align:center">
        <p>Please confirm your account by clicking the button below:</p>
        <p style="margin:18px 0">
          <a class="btn" href="${verifyUrl}">Confirm Account</a>
        </p>
        <p class="muted">This link expires after a short time. If it’s expired, sign in and request a new one.</p>
      </div>`
    : `
      <div class="card">
        <p>Your email is already verified, or you can request a new link from the sign-in page if needed.</p>
      </div>`;

  const billingBlock = `
    <div class="card">
      <p><strong>Billing statement:</strong> If you upgrade mid-month, the new plan starts right away with the full number of messages. Your billing date switches to that day (e.g., upgrade on the 18th → renew on the 18th next month). The previous plan is treated as fully used—no proration or refunds—and your conversation history stays intact.</p>
      <p>Full details: see our Terms of Service.</p>
      <p class="muted">Example: Basic on the 1st → upgrade to Medium on the 18th; Medium starts on the 18th with full messages; next renewal is the 18th next month.</p>
    </div>`;

  return `
  <div class="container">
    <div class="header">
      <div class="brand">${escapeHtml(BRAND.appName)}</div>
      <h2>Welcome — Your Conversations Are Private</h2>
    </div>
    <div style="padding:0 28px 12px">
      <p>${greeting}</p>
      <p>Thank you for registering with ${escapeHtml(BRAND.appName)}.</p>
    </div>
    ${confirmBlock}
    <div style="padding:0 28px">
      <p><strong>Privacy you can trust:</strong> All your conversations are encrypted before leaving your device. We cannot read them. Only you control your content.</p>
      <p>${escapeHtml(BRAND.appName)} helps you find context and perspective through what we call <em>Digital Intuition</em>. She sometimes infers a lot from very little — designed to see patterns you might not be consciously aware of.</p>
      <p>There’s also a random, statistical component to her reasoning. Sometimes it feels magical when she nails it; other times she may add a little noise. The underlying AI never gives the same answer twice — that’s why we say: she’s context, not absolute truth.</p>
      <p>Think of her like GPS: she guides you, but you remain the driver. You don’t drive off a cliff just because the map says the road continues, and you don’t enter a path too narrow for cars only because it looks shorter. You always keep your own judgment.</p>
      <div class="card">
        <p><strong>Your rights:</strong> You can request deletion of your email and account data at any time. Write to <a href="mailto:${BRAND.supportEmail}">${BRAND.supportEmail}</a> and we’ll remove it.</p>
      </div>
      ${billingBlock}
    </div>
    <div style="padding:0 28px 8px"><p class="muted">Need help? Email <a href="mailto:${BRAND.supportEmail}">${BRAND.supportEmail}</a> or visit <a href="${BRAND.helpUrl}">${BRAND.helpUrl}</a>.</p></div>
    <div class="footer"><p class="muted">Sent by ${escapeHtml(BRAND.appName)}. If this wasn’t you, you can ignore this message.</p></div>
  </div>
  <style>${styles}</style>`;
}

function renderText({ hasVerificationLink, verifyUrl }) {
  const lines = [];
  lines.push(
    "Subject: Welcome to Lucía – Your Conversations Are Private",
    "",
    "Hi,",
    ""
  );
  if (hasVerificationLink) {
    lines.push("Confirm your account:", verifyUrl, "");
  } else {
    lines.push("Your email is already verified, or you can request a new link from the sign-in page.", "");
  }
  lines.push(
    "Privacy you can trust: Your conversations are encrypted before leaving your device. We cannot read them. Only you control your content.",
    "",
    "Lucía gives context through Digital Intuition — she sometimes infers a lot from very little, with a random component that can feel magical at times (and off at others). The underlying AI never gives the same answer twice. She is context, not absolute truth.",
    "",
    "Think of her like GPS: she guides you, but you remain the driver.",
    "",
    "If you upgrade mid-month, the new plan starts immediately with full messages. Your billing date changes to that day (e.g., upgrade on the 18th → renew on the 18th next month). No proration/refund for the previous plan. Threads are preserved.",
    "",
    `You can request deletion of your email and account data anytime by writing to ${BRAND.supportEmail}.`,
    "",
    `Need help? ${BRAND.supportEmail}`
  );
  return lines.join("\n");
}

// ----- Trigger (same name/signature) -----
export const sendWelcomeOnSignup = functions
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    try {
      const { uid, email, displayName, emailVerified } = user || {};
      if (!email) {
        functions.logger.warn(`onCreate skip: uid=${uid} has no email`);
        return;
      }

      // Optional verification link (same API you used)
      let verifyUrl = null;
      if (!emailVerified) {
        const actionCodeSettings = { url: BRAND.continueUrl, handleCodeInApp: false };
        verifyUrl = await auth.generateEmailVerificationLink(email, actionCodeSettings);
      }

      const subject = "Welcome to Lucía – Your Conversations Are Private";
      const html = renderEmail({ displayName, hasVerificationLink: !!verifyUrl, verifyUrl });
      const text = renderText({ hasVerificationLink: !!verifyUrl, verifyUrl });

      const ref = await db.collection(MAIL_COLLECTION).add({
        to: [email],
        from: BRAND.from,
        replyTo: BRAND.replyTo,
        message: { subject, text, html },
        meta: {
          uid,
          createdAt: FieldValue.serverTimestamp(),
          emailVerifiedAtSignup: !!emailVerified,
          source: "sendWelcomeOnSignup",
        },
      });

      functions.logger.info(`Queued welcome email doc ${ref.id} in /${MAIL_COLLECTION} for ${email} (uid=${uid})`);
    } catch (err) {
      functions.logger.error("Failed to queue welcome email", { err: String(err) });
      throw err;
    }
  });