const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');

const router = express.Router();

// ─── Whop Webhook ────────────────────────────────────────────────────────────
// POST /api/webhooks/whop
router.post('/whop', express.raw({ type: 'application/json' }), async (req, res) => {
  const signatureHeader = req.headers['whop-signature'];
  const secret = process.env.WHOP_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Whop] WHOP_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Whop sends: whop-signature: sha256=<hex>
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(req.body).digest('hex');

  let signatureValid = false;
  try {
    signatureValid = signatureHeader &&
      signatureHeader.length === digest.length &&
      crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
  } catch (_) {}

  if (!signatureValid) {
    console.warn('[Whop] Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const action = payload.action;
  const data = payload.data;

  console.log(`[Whop] Event: ${action}, ID: ${data?.id}`);

  // membership_activated fires when a purchase completes and the membership activates
  if (action === 'membership_activated' || action === 'membership.went_valid') {
    try {
      await handleWhopMembership(data);
    } catch (err) {
      console.error('[Whop] Error processing membership:', err);
      return res.status(500).json({ error: 'Failed to process membership' });
    }
  }

  res.json({ received: true });
});

async function handleWhopMembership(data) {
  const membershipId = data?.id;
  const planId = data?.plan?.id;
  const customerEmail = data?.user?.email;

  if (!customerEmail) {
    console.warn(`[Whop] No email for membership ${membershipId}`);
    return;
  }

  if (!planId) {
    console.warn(`[Whop] No plan ID for membership ${membershipId}`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: customerEmail } });
  if (!user) {
    console.warn(`[Whop] No user found for email: ${customerEmail}`);
    return;
  }

  let plan = null;
  let tradesLimit = null;

  if (planId === process.env.WHOP_PLAN_ID_BASIC) {
    plan = 'basic';
    tradesLimit = 100;
  } else if (planId === process.env.WHOP_PLAN_ID_LIFETIME) {
    plan = 'lifetime';
    tradesLimit = null;
  } else {
    console.warn(`[Whop] Unknown plan ID: ${planId}`);
    return;
  }

  await prisma.license.upsert({
    where: { userId: user.id },
    update: {
      plan,
      tradesUsed: 0,
      tradesLimit,
      lemonsqueezyOrderId: `whop_${membershipId}`,
      expiresAt: null,
    },
    create: {
      userId: user.id,
      plan,
      tradesUsed: 0,
      tradesLimit,
      lemonsqueezyOrderId: `whop_${membershipId}`,
    },
  });

  console.log(`[Whop] Activated ${plan} plan for user ${user.id} (${customerEmail})`);
}

// ─── Lemon Squeezy Webhook (kept for any existing orders) ────────────────────
// POST /api/webhooks/lemonsqueezy
router.post('/lemonsqueezy', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-signature'];
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!secret) {
    return res.status(200).json({ received: true }); // silently ignore if LS not configured
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(req.body).digest('hex');

  let signatureValid = false;
  try {
    signatureValid = signature &&
      signature.length === digest.length &&
      crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch (_) {}

  if (!signatureValid) {
    console.warn('[LS] Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const eventName = payload.meta?.event_name;
  const orderId = payload.data?.id;
  const orderData = payload.data?.attributes;

  console.log(`[LS] Event: ${eventName}, Order: ${orderId}`);

  if (eventName === 'order_created' && orderData?.status === 'paid') {
    try {
      await handleLSOrder(orderId, orderData);
    } catch (err) {
      console.error('[LS] Error processing order:', err);
      return res.status(500).json({ error: 'Failed to process order' });
    }
  }

  res.json({ received: true });
});

async function handleLSOrder(orderId, orderData) {
  const variantId = String(orderData.first_order_item?.variant_id);
  const customerEmail = orderData.user_email;

  if (!customerEmail) {
    console.warn(`[LS] No customer email for order ${orderId}`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: customerEmail } });
  if (!user) {
    console.warn(`[LS] No user found for email: ${customerEmail}`);
    return;
  }

  let plan = null;
  let tradesLimit = null;

  if (variantId === process.env.LEMONSQUEEZY_VARIANT_ID_BASIC) {
    plan = 'basic';
    tradesLimit = 100;
  } else if (variantId === process.env.LEMONSQUEEZY_VARIANT_ID_LIFETIME) {
    plan = 'lifetime';
    tradesLimit = null;
  } else {
    console.warn(`[LS] Unknown variant ID: ${variantId}`);
    return;
  }

  await prisma.license.upsert({
    where: { userId: user.id },
    update: { plan, tradesUsed: 0, tradesLimit, lemonsqueezyOrderId: String(orderId), expiresAt: null },
    create: { userId: user.id, plan, tradesUsed: 0, tradesLimit, lemonsqueezyOrderId: String(orderId) },
  });

  console.log(`[LS] Activated ${plan} plan for user ${user.id} (${customerEmail})`);
}

module.exports = router;
