const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');

const router = express.Router();

// ─── Whop Webhook ────────────────────────────────────────────────────────────
// POST /api/webhooks/whop
router.post('/whop', express.raw({ type: 'application/json' }), async (req, res) => {
  const signatureHeader = req.headers['webhook-signature'];
  const webhookId        = req.headers['webhook-id'];
  const webhookTimestamp = req.headers['webhook-timestamp'];
  const secret = process.env.WHOP_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Whop] WHOP_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Whop dashboard test webhooks don't send signature headers (known bug) —
  // allow through in non-production only.
  if (!signatureHeader || !webhookId || !webhookTimestamp) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Whop] Missing signature headers — bypassing verification (non-production only)');
    } else {
      console.warn('[Whop] Missing required webhook signature headers');
      return res.status(401).json({ error: 'Missing signature headers' });
    }
  } else if (!verifyWhopSignature({ signatureHeader, webhookId, webhookTimestamp, body: req.body, secret })) {
      console.warn('[Whop] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const action = payload.type || payload.action;
  const data = payload.data;

  console.log(`[Whop] Event: ${action}, ID: ${data?.id}`);

  // membership.activated is the current v1 event name. Keep old underscore
  // variants for older/test payloads that Whop has emitted before.
  const activationEvents = new Set([
    'membership.activated',
    'membership.went_valid',
    'membership_activated',
    'membership_went_valid',
    'payment.succeeded',
    'payment_succeeded',
    'invoice.paid',
    'invoice_paid',
  ]);

  if (activationEvents.has(action)) {
    try {
      await handleWhopMembership(data);
    } catch (err) {
      console.error('[Whop] Error processing membership:', err);
      return res.status(500).json({ error: 'Failed to process membership' });
    }
  }

  res.json({ received: true });
});

function verifyWhopSignature({ signatureHeader, webhookId, webhookTimestamp, body, secret }) {
  const signedContent = Buffer.concat([
    Buffer.from(`${webhookId}.${webhookTimestamp}.`, 'utf8'),
    Buffer.isBuffer(body) ? body : Buffer.from(String(body)),
  ]);

  const submittedSignatures = signatureHeader
    .split(' ')
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^v\d[=,]/, ''))
    .filter((part) => !/^v\d$/.test(part));

  const secretCandidates = [Buffer.from(secret, 'utf8')];
  if (secret.startsWith('whsec_')) {
    const encoded = secret.slice('whsec_'.length);
    try {
      secretCandidates.push(Buffer.from(encoded, 'base64'));
    } catch (_) {}
  }

  const expectedSignatures = secretCandidates.flatMap((key) => {
    const digest = crypto.createHmac('sha256', key).update(signedContent).digest();
    return [
      digest.toString('base64'),
      `sha256=${digest.toString('hex')}`,
      digest.toString('hex'),
    ];
  });

  return submittedSignatures.some((submitted) =>
    expectedSignatures.some((expected) => safeCompare(submitted, expected))
  );
}

function safeCompare(left, right) {
  try {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length &&
      crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch (_) {
    return false;
  }
}

async function handleWhopMembership(data) {
  const membershipId = data?.membership?.id || data?.membership_id || data?.id || data?.payment_id;
  const customerEmail =
    data?.user?.email ||
    data?.customer?.email ||
    data?.member?.email ||
    data?.membership?.user?.email ||
    data?.metadata?.email ||
    data?.user_email ||
    data?.email;

  // Log full payload on first receipt so we can verify structure
  console.log('[Whop] Membership payload:', JSON.stringify(data, null, 2));

  if (!customerEmail) {
    console.warn(`[Whop] No email for membership ${membershipId}`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: customerEmail }, include: { license: true } });
  if (!user) {
    console.warn(`[Whop] No user found for email: ${customerEmail}`);
    return;
  }

  const whopOrderId = `whop_${membershipId}`;

  // Replay protection: if license already exists with this orderId, skip reset
  if (user.license && user.license.lemonsqueezyOrderId === whopOrderId) {
    console.log(`[Whop] Membership ${membershipId} already processed for user ${user.id}. Skipping reset.`);
    return;
  }

  // Match by price (in cents): $50 = basic, $120 = Pro (stored as lifetime internally)
  // Also check plan name as fallback
  const priceInCents = Number(
    data?.plan?.price_cents ??
    data?.checkout?.plan?.price_cents ??
    data?.line_item?.price_cents ??
    data?.amount_cents ??
    data?.price_cents ??
    data?.amount ??
    0
  );
  const planId = String(
    data?.plan?.id ||
    data?.plan_id ||
    data?.checkout?.plan?.id ||
    data?.product?.plan_id ||
    ''
  );
  const planName = String(
    data?.plan?.name ||
    data?.checkout?.plan?.name ||
    data?.product?.name ||
    data?.membership?.plan?.name ||
    ''
  ).toLowerCase();

  let plan = null;
  let tradesLimit = null;

  if (
    planId === process.env.WHOP_PLAN_ID_BASIC ||
    priceInCents === 5000 ||
    planName.includes('basic')
  ) {
    plan = 'basic';
    tradesLimit = 100;
  } else if (
    planId === process.env.WHOP_PLAN_ID_PRO ||
    planId === process.env.WHOP_PLAN_ID_LIFETIME ||
    priceInCents === 12000 ||
    planName.includes('pro') ||
    planName.includes('lifetime')
  ) {
    plan = 'lifetime';
    tradesLimit = null;
  } else {
    console.warn(`[Whop] Cannot determine plan. Price: ${priceInCents}, Name: ${planName}`);
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

module.exports = router;
