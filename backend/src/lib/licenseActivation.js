const prisma = require('./prisma');
const { getPlanEntitlements, getAiTradesAllowanceForPlan } = require('./plans');

async function activatePaidLicense({ userId, plan, paymentProvider, paymentId }) {
  const entitlements = getPlanEntitlements(plan);
  if (!entitlements || entitlements.priceCents <= 0) {
    throw new Error(`Invalid paid plan: ${plan}`);
  }

  const paymentRef = `${paymentProvider}_${paymentId}`;
  const aiTradesAllowance = getAiTradesAllowanceForPlan(plan);

  const existing = await prisma.license.findUnique({ where: { userId } });
  if (existing?.lemonsqueezyOrderId === paymentRef) {
    return existing;
  }

  return prisma.license.upsert({
    where: { userId },
    update: {
      plan,
      tradesUsed: 0,
      tradesLimit: entitlements.tradesLimit,
      ...(aiTradesAllowance !== null && { aiTradesAllowance }),
      lemonsqueezyOrderId: paymentRef,
      expiresAt: null,
    },
    create: {
      userId,
      plan,
      tradesUsed: 0,
      tradesLimit: entitlements.tradesLimit,
      ...(aiTradesAllowance !== null && { aiTradesAllowance }),
      lemonsqueezyOrderId: paymentRef,
      expiresAt: null,
    },
  });
}

module.exports = { activatePaidLicense };
