const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decodeCustomId,
  getCaptureFromOrder,
  normalizeCheckoutPlan,
  paypalConfigured,
} = require('../src/lib/paypal');
const { PLAN_IDS } = require('../src/lib/plans');

test('paypal checkout plans normalize to Avalisa license plans', () => {
  assert.equal(normalizeCheckoutPlan('basic'), PLAN_IDS.BASIC);
  assert.equal(normalizeCheckoutPlan('pro'), PLAN_IDS.PRO);
  assert.equal(normalizeCheckoutPlan('lifetime'), PLAN_IDS.PRO);
  assert.equal(normalizeCheckoutPlan('demo'), null);
});

test('paypal custom id decodes only Avalisa metadata', () => {
  assert.deepEqual(decodeCustomId('avalisa:user_123:basic'), { userId: 'user_123', plan: 'basic' });
  assert.equal(decodeCustomId('other:user_123:basic'), null);
  assert.equal(decodeCustomId('avalisa:user_123'), null);
});

test('paypal capture helper returns the completed capture', () => {
  const order = {
    purchase_units: [{
      payments: {
        captures: [
          { id: 'pending_capture', status: 'PENDING' },
          { id: 'completed_capture', status: 'COMPLETED' },
        ],
      },
    }],
  };

  assert.equal(getCaptureFromOrder(order).id, 'completed_capture');
  assert.equal(getCaptureFromOrder({ purchase_units: [] }), undefined);
});

test('paypal configured requires both client id and secret', () => {
  const originalClientId = process.env.PAYPAL_CLIENT_ID;
  const originalSecret = process.env.PAYPAL_CLIENT_SECRET;

  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  assert.equal(paypalConfigured(), false);

  process.env.PAYPAL_CLIENT_ID = 'client';
  assert.equal(paypalConfigured(), false);

  process.env.PAYPAL_CLIENT_SECRET = 'secret';
  assert.equal(paypalConfigured(), true);

  if (originalClientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
  else process.env.PAYPAL_CLIENT_ID = originalClientId;

  if (originalSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
  else process.env.PAYPAL_CLIENT_SECRET = originalSecret;
});
