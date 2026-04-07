const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');

const router = express.Router();

// POST /api/webhooks/lemonsqueezy
// Use raw body for signature verification — mount BEFORE express.json()
router.post('/lemonsqueezy', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-signature'];
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!secret) {
    console.error('LEMONSQUEEZY_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Verify HMAC signature
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(req.body).digest('hex');

  let signatureValid = false;
  try {
    signatureValid = signature && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch (_) {
    // timingSafeEqual throws if buffer lengths differ — treat as invalid
  }
  if (!signatureValid) {
    console.warn('Invalid webhook signature');
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

  console.log(`[Webhook] Event: ${eventName}, Order: ${orderId}`);

  if (eventName === 'order_created' && orderData?.status === 'paid') {
    try {
      await handleOrderPaid(orderId, orderData);
    } catch (err) {
      console.error('Error processing order:', err);
      return res.status(500).json({ error: 'Failed to process order' });
    }
  }

  // Also handle subscription events if needed in the future
  res.json({ received: true });
});

async function handleOrderPaid(orderId, orderData) {
  const variantId = String(orderData.first_order_item?.variant_id);
  const customerEmail = orderData.user_email;

  if (!customerEmail) {
    console.warn(`[Webhook] No customer email for order ${orderId}`);
    return;
  }

  // Find user by email
  const user = await prisma.user.findUnique({ where: { email: customerEmail } });
  if (!user) {
    console.warn(`[Webhook] No user found for email: ${customerEmail}`);
    return;
  }

  // Determine plan from variant ID
  let plan = null;
  let tradesLimit = null;

  if (variantId === process.env.LEMONSQUEEZY_VARIANT_ID_BASIC) {
    plan = 'basic';
    tradesLimit = 100;
  } else if (variantId === process.env.LEMONSQUEEZY_VARIANT_ID_LIFETIME) {
    plan = 'lifetime';
    tradesLimit = null;
  } else {
    console.warn(`[Webhook] Unknown variant ID: ${variantId}`);
    return;
  }

  await prisma.license.upsert({
    where: { userId: user.id },
    update: {
      plan,
      tradesUsed: 0,
      tradesLimit,
      lemonsqueezyOrderId: String(orderId),
      expiresAt: null,
    },
    create: {
      userId: user.id,
      plan,
      tradesUsed: 0,
      tradesLimit,
      lemonsqueezyOrderId: String(orderId),
    },
  });

  console.log(`[Webhook] Activated ${plan} plan for user ${user.id} (${customerEmail})`);
}

module.exports = router;
