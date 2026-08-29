const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PLAN_IDS,
  getPlanEntitlements,
  getPaidPlanFromWhop,
  canUseStrategy,
  canUseStrategyForLicense,
  getAiTradesAllowanceForPlan,
  getAiTradesAllowanceForLicense,
} = require('../src/lib/plans');

test('demo users get 10 martingale trades with no start amount cap', () => {
  const entitlements = getPlanEntitlements(PLAN_IDS.DEMO);

  assert.equal(entitlements.tradesLimit, 10);
  assert.equal(entitlements.aiTradesAllowance, 0);
  assert.equal(entitlements.maxStartAmount, null);
  assert.equal(canUseStrategy(PLAN_IDS.DEMO, 'martingale'), true);
  assert.equal(canUseStrategy(PLAN_IDS.DEMO, 'ai'), false);
});

test('new basic users get unlimited martingale with no AI trades', () => {
  const entitlements = getPlanEntitlements(PLAN_IDS.BASIC);

  assert.equal(entitlements.priceCents, 6900);
  assert.equal(entitlements.tradesLimit, null);
  assert.equal(entitlements.aiTradesAllowance, 0);
  assert.equal(getAiTradesAllowanceForPlan(PLAN_IDS.BASIC), 0);
  assert.equal(entitlements.maxStartAmount, null);
  assert.equal(canUseStrategy(PLAN_IDS.BASIC, 'martingale'), true);
  assert.equal(canUseStrategy(PLAN_IDS.BASIC, 'ai'), false);
  assert.equal(canUseStrategy(PLAN_IDS.BASIC, 'anti-martingale'), false);
});

test('legacy basic licences retain AI access and allowance', () => {
  const license = { plan: PLAN_IDS.BASIC, createdAt: '2026-08-29T23:59:59.999Z' };

  assert.equal(canUseStrategyForLicense(license, 'ai'), true);
  assert.equal(getAiTradesAllowanceForLicense(license), 10);
});

test('new basic licences keep martingale but lose AI access and allowance', () => {
  const license = { plan: PLAN_IDS.BASIC, createdAt: '2026-08-30T00:00:00.000Z' };

  assert.equal(canUseStrategyForLicense(license, 'martingale'), true);
  assert.equal(canUseStrategyForLicense(license, 'ai'), false);
  assert.equal(getAiTradesAllowanceForLicense(license), 0);
});

test('pro and demo licence entitlements are unaffected by the Basic cutoff', () => {
  for (const createdAt of ['2026-08-29T23:59:59.999Z', '2026-08-30T00:00:00.000Z']) {
    assert.equal(canUseStrategyForLicense({ plan: PLAN_IDS.PRO, createdAt }, 'ai'), true);
    assert.equal(getAiTradesAllowanceForLicense({ plan: PLAN_IDS.PRO, createdAt }), null);
    assert.equal(canUseStrategyForLicense({ plan: PLAN_IDS.DEMO, createdAt }, 'ai'), false);
    assert.equal(getAiTradesAllowanceForLicense({ plan: PLAN_IDS.DEMO, createdAt }), 0);
  }
});

test('missing licences use the existing plan-only fallback without throwing', () => {
  assert.equal(canUseStrategyForLicense(null, 'ai'), canUseStrategy(undefined, 'ai'));
  assert.equal(canUseStrategyForLicense(undefined, 'martingale'), canUseStrategy(undefined, 'martingale'));
  assert.equal(getAiTradesAllowanceForLicense(null), getAiTradesAllowanceForPlan(undefined));
  assert.equal(getAiTradesAllowanceForLicense(undefined), getAiTradesAllowanceForPlan(undefined));
});

test('pro users and affiliate users get everything unlocked for current modes', () => {
  const entitlements = getPlanEntitlements(PLAN_IDS.PRO);

  assert.equal(entitlements.priceCents, 11900);
  assert.equal(entitlements.tradesLimit, null);
  assert.equal(entitlements.aiTradesAllowance, null);
  assert.equal(canUseStrategy(PLAN_IDS.PRO, 'martingale'), true);
  assert.equal(canUseStrategy(PLAN_IDS.PRO, 'ai'), true);
  assert.equal(entitlements.grantedByAffiliate, true);
});

test('whop prices map to the new paid plans', () => {
  assert.equal(getPaidPlanFromWhop({ priceInCents: 6900, planName: '' }), PLAN_IDS.BASIC);
  assert.equal(getPaidPlanFromWhop({ priceInCents: 11900, planName: '' }), PLAN_IDS.PRO);
  assert.equal(getPaidPlanFromWhop({ priceInCents: 5000, planName: '' }), null);
  assert.equal(getPaidPlanFromWhop({ priceInCents: 12000, planName: '' }), null);
});
