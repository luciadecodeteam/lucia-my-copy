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

const PLAN_ALLOWANCES = {
  basic: 200,
  medium: 400,
  intensive: 2000,
  total: 6000,
};

export function coerceNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return !!value;
}

export function canonicalizeTier(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (TIER_ALIAS_MAP.has(normalized)) return TIER_ALIAS_MAP.get(normalized);
  if (normalized.startsWith("standard")) return "basic";
  if (normalized === "basic-monthly" || normalized === "basic_monthly") return "basic";
  return normalized;
}

function allowanceForTier(tier) {
  const canonical = canonicalizeTier(tier);
  const value = PLAN_ALLOWANCES[canonical];
  return Number.isFinite(value) ? value : null;
}

function extractCandidateAllowance(candidate) {
  const coerced = coerceNumber(candidate);
  return coerced !== null && coerced >= 0 ? coerced : null;
}

export function extractMessageAllowance(profile) {
  if (!profile || typeof profile !== "object") return null;
  const candidates = [
    profile?.billing?.messageAllowance,
    profile?.stripe?.messageAllowance,
    profile?.messageAllowance,
    profile?.billing?.message_allowance,
    profile?.stripe?.message_allowance,
  ];
  for (const candidate of candidates) {
    const value = extractCandidateAllowance(candidate);
    if (value !== null) return value;
  }
  return null;
}

export function resolveTier(profile) {
  const rawCandidates = [
    profile?.tier,
    profile?.planTier,
    profile?.plan_tier,
    profile?.plan,
    profile?.billing?.planTier,
    profile?.billing?.plan_tier,
    profile?.billing?.tier,
    profile?.billing?.plan?.tier,
    profile?.billing?.plan?.key,
    profile?.billing?.currentTier,
    profile?.stripe?.planTier,
    profile?.stripe?.plan_tier,
    profile?.stripe?.tier,
  ];
  for (const raw of rawCandidates) {
    const canonical = canonicalizeTier(raw);
    if (canonical) return canonical;
  }
  return "";
}

export function resolveUsageLimits(profile) {
  const tier = resolveTier(profile);
  const messageAllowance = extractMessageAllowance(profile);
  const courtesyUsed = coerceBoolean(profile?.courtesy_used);

  if (Number.isFinite(messageAllowance) && messageAllowance > 0) {
    return {
      unlimited: false,
      baseAllowance: messageAllowance,
      courtesyAllowance: null,
      courtesyUsed,
      messageAllowance,
    };
  }

  const tierAllowance = allowanceForTier(tier);
  if (Number.isFinite(tierAllowance) && tierAllowance > 0) {
    return {
      unlimited: false,
      baseAllowance: tierAllowance,
      courtesyAllowance: null,
      courtesyUsed: false,
      messageAllowance: tierAllowance,
    };
  }

  if (tier === "pro") {
    return {
      unlimited: true,
      baseAllowance: null,
      courtesyAllowance: null,
      courtesyUsed: false,
      messageAllowance: null,
    };
  }

  return {
    unlimited: false,
    baseAllowance: 10,
    courtesyAllowance: 12,
    courtesyUsed,
    messageAllowance: null,
  };
}
