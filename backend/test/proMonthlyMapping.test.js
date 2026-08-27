/**
 * A customer who pays must always receive access.
 *
 * Whop plan mapping fell back to the plan NAME, so a $29/month option named
 * anything other than "pro"/"basic" mapped to null — the webhook logged a warning
 * and granted NOTHING while the customer was still charged. Recognising the price
 * itself removes that dependency on how a pricing option happens to be named.
 */
const test = require('node:test');
const assert = require('node:assert');
const { getPaidPlanFromWhop, PLAN_IDS } = require('../src/lib/plans');

test('$29/month grants Pro regardless of what the Whop option is called', () => {
  for (const planName of ['pro', 'pro monthly', 'monthly access', 'avalisa subscription', '']) {
    assert.equal(
      getPaidPlanFromWhop({ planId: 'plan_any', priceInCents: 2900, planName }),
      PLAN_IDS.PRO,
      `$29 named "${planName}" must grant Pro`
    );
  }
});

test('the one-time plans are unaffected', () => {
  assert.equal(getPaidPlanFromWhop({ planId: 'p', priceInCents: 11900, planName: 'pro' }), PLAN_IDS.PRO);
  assert.equal(getPaidPlanFromWhop({ planId: 'p', priceInCents: 6900, planName: 'basic' }), PLAN_IDS.BASIC);
});

test('an unrecognised price still maps to nothing rather than guessing', () => {
  assert.equal(getPaidPlanFromWhop({ planId: 'p', priceInCents: 500, planName: 'random' }), null);
});
