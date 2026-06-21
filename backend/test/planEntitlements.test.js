const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PLAN_IDS,
  getPlanEntitlements,
  getPaidPlanFromWhop,
  canUseStrategy,
  getAiTradesAllowanceForPlan,
} = require('../src/lib/plans');

test('demo users get 10 martingale trades with no start amount cap', () => {
  const entitlements = getPlanEntitlements(PLAN_IDS.DEMO);

  assert.equal(entitlements.tradesLimit, 10);
  assert.equal(entitlements.aiTradesAllowance, 0);
  assert.equal(entitlements.maxStartAmount, null);
  assert.equal(canUseStrategy(PLAN_IDS.DEMO, 'martingale'), true);
  assert.equal(canUseStrategy(PLAN_IDS.DEMO, 'ai'), false);
});

test('basic users get unlimited martingale and 10 AI trades', () => {
  const entitlements = getPlanEntitlements(PLAN_IDS.BASIC);

  assert.equal(entitlements.priceCents, 6900);
  assert.equal(entitlements.tradesLimit, null);
  assert.equal(entitlements.aiTradesAllowance, 10);
  assert.equal(getAiTradesAllowanceForPlan(PLAN_IDS.BASIC), 10);
  assert.equal(entitlements.maxStartAmount, null);
  assert.equal(canUseStrategy(PLAN_IDS.BASIC, 'martingale'), true);
  assert.equal(canUseStrategy(PLAN_IDS.BASIC, 'ai'), true);
  assert.equal(canUseStrategy(PLAN_IDS.BASIC, 'anti-martingale'), false);
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
