const PLAN_IDS = {
  DEMO: 'free',
  BASIC: 'basic',
  PRO: 'lifetime',
};

const PLAN_ENTITLEMENTS = {
  [PLAN_IDS.DEMO]: {
    label: 'Demo',
    priceCents: 0,
    tradesLimit: 10,
    aiTradesAllowance: 0,
    maxStartAmount: null,
    strategies: ['martingale'],
    grantedByAffiliate: false,
  },
  [PLAN_IDS.BASIC]: {
    label: 'Basic',
    priceCents: 6900,
    tradesLimit: null,
    aiTradesAllowance: 10,
    maxStartAmount: null,
    strategies: ['martingale', 'ai'],
    grantedByAffiliate: false,
  },
  [PLAN_IDS.PRO]: {
    label: 'Pro',
    priceCents: 11900,
    tradesLimit: null,
    aiTradesAllowance: null,
    maxStartAmount: null,
    strategies: ['martingale', 'ai'],
    grantedByAffiliate: true,
  },
};

// Should a Whop deactivation revoke this licence?
//
// THE RULE THAT PROTECTS PAYING CUSTOMERS: a licence with expiresAt === null is a
// permanent purchase (one-time Basic $69 / Pro $119, or a manual grant) and must
// NEVER be revoked by a subscription event. Only licences we explicitly marked as
// expiring — created from a recurring plan — may be downgraded when payment stops.
//
// Every licence created before 2026-08-27 has expiresAt === null, so existing
// customers are protected by construction rather than by remembering to check.
function shouldRevokeLicense(license) {
  if (!license) return false;
  return license.expiresAt !== null && license.expiresAt !== undefined;
}

function getPlanEntitlements(plan) {
  return PLAN_ENTITLEMENTS[plan] || null;
}

function getTradeLimitForPlan(plan) {
  return getPlanEntitlements(plan)?.tradesLimit ?? null;
}

function canUseStrategy(plan, strategy) {
  const entitlements = getPlanEntitlements(plan);
  if (!entitlements) return false;
  return entitlements.strategies.includes(strategy);
}

function getAiTradesAllowanceForPlan(plan) {
  const entitlements = getPlanEntitlements(plan);
  if (!entitlements) return 0;
  return entitlements.aiTradesAllowance;
}

function getPaidPlanFromWhop({ planId = '', priceInCents = 0, planName = '' }) {
  const normalizedPlanId = String(planId || '');
  const normalizedName = String(planName || '').toLowerCase();

  if (
    normalizedPlanId === process.env.WHOP_PLAN_ID_BASIC ||
    Number(priceInCents) === PLAN_ENTITLEMENTS[PLAN_IDS.BASIC].priceCents ||
    normalizedName.includes('basic')
  ) {
    return PLAN_IDS.BASIC;
  }

  if (
    normalizedPlanId === process.env.WHOP_PLAN_ID_PRO ||
    normalizedPlanId === process.env.WHOP_PLAN_ID_LIFETIME ||
    Number(priceInCents) === PLAN_ENTITLEMENTS[PLAN_IDS.PRO].priceCents ||
    normalizedName.includes('pro') ||
    normalizedName.includes('lifetime')
  ) {
    return PLAN_IDS.PRO;
  }

  return null;
}

module.exports = {
  shouldRevokeLicense,
  PLAN_IDS,
  PLAN_ENTITLEMENTS,
  getPlanEntitlements,
  getTradeLimitForPlan,
  canUseStrategy,
  getAiTradesAllowanceForPlan,
  getPaidPlanFromWhop,
};
