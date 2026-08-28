const express = require('express');
const prisma = require('../lib/prisma');
const { recordFunnelEvent } = require('../lib/funnel');

const router = express.Router();
const CHECKOUT_PLANS = new Set(['basic', 'pro']);

// POST /api/funnel/checkout-click — public, asynchronous purchase-intent signal.
router.post('/checkout-click', (req, res) => {
  const plan = req.body?.plan;
  if (!CHECKOUT_PLANS.has(plan)) {
    return res.status(400).json({ error: 'Unsupported checkout plan' });
  }

  // Analytics must never affect a buyer's checkout path. recordFunnelEvent
  // already swallows async failures; this also guards against a synchronous one.
  try {
    recordFunnelEvent(prisma, 'checkout_click', { meta: { plan } });
  } catch (err) {
    // Intentionally ignored.
  }

  return res.status(204).end();
});

module.exports = router;
