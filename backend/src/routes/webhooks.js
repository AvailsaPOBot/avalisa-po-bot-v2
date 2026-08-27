const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { PLAN_IDS, getPaidPlanFromWhop, getPlanEntitlements, getAiTradesAllowanceForPlan, shouldRevokeLicense } = require('../lib/plans');
const { activatePaidLicense } = require('../lib/licenseActivation');
const { decodeCustomId, normalizeCheckoutPlan, verifyPayPalWebhook } = require('../lib/paypal');
const { recordUnmappedPurchase } = require('../lib/purchaseAlert');

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

  // Always require valid signature headers. (A previous non-production bypass for
  // Whop's header-less test webhooks was removed — it could grant real Pro access
  // whenever NODE_ENV was unset, which is not guaranteed on Render.)
  if (!signatureHeader || !webhookId || !webhookTimestamp) {
    console.warn('[Whop] Missing required webhook signature headers');
    return res.status(401).json({ error: 'Missing signature headers' });
  }
  if (!verifyWhopSignature({ signatureHeader, webhookId, webhookTimestamp, body: req.body, secret })) {
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

  // A subscription that stops paying MUST stop granting access, or a $29/month
  // customer keeps Pro forever after one payment. Before 2026-08-27 nothing handled
  // this because only one-time plans existed.
  const deactivationEvents = new Set([
    'membership.went_invalid',
    'membership.deactivated',
    'membership.cancelled',
    'membership.canceled',
    'membership_went_invalid',
    'membership_deactivated',
    'membership_cancelled',
  ]);

  if (activationEvents.has(action)) {
    try {
      await handleWhopMembership(data, action);
    } catch (err) {
      console.error('[Whop] Error processing membership:', err);
      return res.status(500).json({ error: 'Failed to process membership' });
    }
  } else if (deactivationEvents.has(action)) {
    try {
      await handleWhopDeactivation(data);
    } catch (err) {
      console.error('[Whop] Error processing deactivation:', err);
      return res.status(500).json({ error: 'Failed to process deactivation' });
    }
  }

  res.json({ received: true });
});

// ─── PayPal Webhook ───────────────────────────────────────────────────────────
// POST /api/webhooks/paypal
router.post('/paypal', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  try {
    await verifyPayPalWebhook({ headers: req.headers, event });
  } catch (err) {
    console.warn('[PayPal] Invalid webhook signature:', err.message);
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
    return res.json({ received: true, ignored: true });
  }

  try {
    await handlePayPalCaptureCompleted(event.resource);
  } catch (err) {
    console.error('[PayPal] Error processing capture:', err);
    return res.status(500).json({ error: 'Failed to process PayPal capture' });
  }

  res.json({ received: true });
});

async function handlePayPalCaptureCompleted(resource) {
  if (resource?.status !== 'COMPLETED') {
    console.warn('[PayPal] Capture not completed:', resource?.id, resource?.status);
    return;
  }

  const custom = decodeCustomId(resource?.custom_id || resource?.supplementary_data?.related_ids?.custom_id);
  if (!custom) {
    recordUnmappedPurchase(prisma, {
      reason: 'paypal_missing_custom_id',
      paypalCaptureId: resource?.id,
      amount: resource?.amount?.value,
      currency: resource?.amount?.currency_code,
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
    });
    console.warn('[PayPal] Capture missing Avalisa custom_id:', resource?.id);
    return;
  }

  const plan = normalizeCheckoutPlan(custom.plan);
  if (!plan) {
    recordUnmappedPurchase(prisma, {
      reason: 'paypal_unsupported_plan',
      userId: custom.userId,
      planId: custom.plan,
      paypalCaptureId: resource?.id,
      amount: resource?.amount?.value,
      currency: resource?.amount?.currency_code,
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
    });
    console.warn('[PayPal] Capture has unsupported plan:', custom.plan);
    return;
  }

  await activatePaidLicense({
    userId: custom.userId,
    plan,
    paymentProvider: 'paypal',
    paymentId: resource.id,
  });

  console.log(`[PayPal] Activated ${plan} plan for user ${custom.userId}`);
}

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

// Revoke access when a RECURRING Whop membership stops paying.
//
// SAFETY INVARIANT: a licence with expiresAt === null is permanent and is NEVER
// touched here. Every licence created before 2026-08-27 has null, so one-time
// Basic ($69) and Pro ($119) buyers — the Board's existing paying customers —
// cannot lose access through this path no matter what Whop sends. Only licences
// we explicitly marked as expiring (i.e. created from a recurring plan) are
// revocable. We downgrade to the demo plan rather than deleting, so the account
// and its history survive and a re-subscribe simply upgrades it again.
async function handleWhopDeactivation(data) {
  const membershipId = data?.id || data?.membership?.id;
  if (!membershipId) {
    console.warn('[Whop] Deactivation event with no membership id — ignoring.');
    return;
  }

  const whopOrderId = `whop_${membershipId}`;
  const license = await prisma.license.findFirst({ where: { lemonsqueezyOrderId: whopOrderId } });
  if (!license) {
    console.log(`[Whop] Deactivation for unknown membership ${membershipId} — nothing to revoke.`);
    return;
  }

  if (!shouldRevokeLicense(license)) {
    console.log(
      `[Whop] Membership ${membershipId} deactivated, but licence ${license.id} is PERMANENT ` +
      `(expiresAt null — one-time/lifetime purchase). Leaving access untouched.`
    );
    return;
  }

  const demo = getPlanEntitlements(PLAN_IDS.DEMO);
  await prisma.license.update({
    where: { id: license.id },
    data: {
      plan: PLAN_IDS.DEMO,
      tradesLimit: demo.tradesLimit,
      tradesUsed: 0,
      expiresAt: new Date(),
    },
  });
  console.log(`[Whop] Recurring membership ${membershipId} ended — licence ${license.id} downgraded to demo.`);
}

async function handleWhopMembership(data, eventType) {
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

  // These raw purchase identifiers are available even when the customer cannot
  // be identified. Keep their extraction above the early returns so every paid
  // but unactivated outcome can be surfaced for manual action.
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
  );

  if (!customerEmail) {
    console.warn(`[Whop] No email for membership ${membershipId}`);
    recordUnmappedPurchase(prisma, {
      reason: 'no_customer_email',
      membershipId,
      priceInCents,
      planName,
      planId,
      eventType,
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: customerEmail }, include: { license: true } });
  if (!user) {
    console.warn(`[Whop] No user found for email: ${customerEmail}`);
    recordUnmappedPurchase(prisma, {
      reason: 'no_matching_account',
      userId: null,
      customerEmail,
      membershipId,
      priceInCents,
      planName,
      planId,
      eventType,
    });
    return;
  }

  const whopOrderId = `whop_${membershipId}`;

  // Replay protection: if license already exists with this orderId, skip reset
  if (user.license && user.license.lemonsqueezyOrderId === whopOrderId) {
    console.log(`[Whop] Membership ${membershipId} already processed for user ${user.id}. Skipping reset.`);
    return;
  }

  // Match by configured Whop plan ID, current price, or plan name fallback.
  const plan = getPaidPlanFromWhop({ planId, priceInCents, planName });
  if (!plan) {
    console.warn(`[Whop] Cannot determine plan. Price: ${priceInCents}, Name: ${planName}`);
    recordUnmappedPurchase(prisma, {
      reason: 'no_plan_match',
      userId: user.id,
      customerEmail,
      priceInCents,
      planName,
      planId,
      membershipId,
      eventType,
    });
    return;
  }
  const tradesLimit = getPlanEntitlements(plan).tradesLimit;
  const aiTradesAllowance = getAiTradesAllowanceForPlan(plan);

  // Recurring vs one-time. THE INVARIANT: expiresAt === null means "permanent, never
  // revoke". Every licence created before 2026-08-27 has null, so one-time and lifetime
  // buyers are protected by construction — a cancellation event can never take their
  // access away. Only a licence we explicitly marked as expiring is revocable.
  const renewalEnd =
    data?.renewal_period_end ?? data?.plan?.renewal_period_end ?? data?.current_period_end ?? null;
  const isRecurring = Boolean(
    data?.plan?.billing_period ||
    data?.plan?.plan_type === 'renewal' ||
    data?.billing_period ||
    renewalEnd
  );
  const expiresAt = isRecurring && renewalEnd ? new Date(Number(renewalEnd) * 1000 || renewalEnd) : null;
  if (isRecurring) {
    console.log(`[Whop] Recurring membership ${membershipId} -> expiresAt ${expiresAt ? expiresAt.toISOString() : 'unknown'}`);
  }

  await prisma.license.upsert({
    where: { userId: user.id },
    update: {
      plan,
      tradesUsed: 0,
      tradesLimit,
      ...(aiTradesAllowance !== null && { aiTradesAllowance }),
      lemonsqueezyOrderId: `whop_${membershipId}`,
      expiresAt,
    },
    create: {
      userId: user.id,
      plan,
      tradesUsed: 0,
      tradesLimit,
      ...(aiTradesAllowance !== null && { aiTradesAllowance }),
      lemonsqueezyOrderId: `whop_${membershipId}`,
      expiresAt,
    },
  });

  console.log(`[Whop] Activated ${plan} plan for user ${user.id} (${customerEmail})`);
}

module.exports = router;
