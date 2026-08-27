// Unmapped paid-purchase capture — fire-and-forget safety records.
//
// A product/price rename must never silently acknowledge a payment without
// giving the support team the information needed to grant access manually.

const { sendEmail, emailConfigured } = require('./email');

const UNMAPPED_PURCHASE_REASONS = new Set([
  'no_customer_email',
  'no_matching_account',
  'no_plan_match',
]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value) {
  return String(value || '').slice(0, 500);
}

function formatDollars(priceInCents) {
  const cents = Number(priceInCents);
  return `$${((Number.isFinite(cents) ? cents : 0) / 100).toFixed(2)}`;
}

// Returns a promise (resolving to whether a row was written) for tests, but
// callers should NOT await it in request handlers.
function recordUnmappedPurchase(prisma, details = {}) {
  if (!UNMAPPED_PURCHASE_REASONS.has(details?.reason)) {
    throw new TypeError('recordUnmappedPurchase requires a valid reason');
  }

  const p = (async () => {
    const safeDetails = Object.fromEntries(
      Object.entries(details || {}).map(([key, value]) => [
        key,
        typeof value === 'string' ? truncate(value) : value,
      ])
    );
    const {
      userId,
      customerEmail,
      priceInCents,
      planName,
      planId,
      membershipId,
      eventType,
      reason,
    } = safeDetails;
    let wrote = false;

    try {
      if (prisma?.funnelEvent?.create) {
        await prisma.funnelEvent.create({
          data: {
            type: 'unmapped_purchase',
            userId: userId || null,
            meta: safeDetails,
          },
        });
        wrote = true;
      }
    } catch (err) {
      // Swallow: missing analytics must not affect paid webhook handling.
    }

    try {
      if (emailConfigured()) {
        const timestamp = new Date().toISOString();
        const recipient = process.env.SUPPORT_ALERT_EMAIL || 'avalisapobot@gmail.com';
        const displayPriceInCents = Number.isFinite(Number(priceInCents)) ? Number(priceInCents) : 0;
        const displayPlanName = planName || 'unknown';
        const displayPlanId = planId || 'unknown';
        const displayMembershipId = membershipId || 'unknown';
        const displayCustomerEmail = customerEmail || 'unknown';
        const displayUserId = userId || 'unknown';
        const displayEventType = eventType || 'unknown';
        const displayReason = reason;
        const text = [
          'Avalisa paid purchase was not activated — manual grant needed.',
          `Reason: ${displayReason}`,
          `Price: ${displayPriceInCents} cents (${formatDollars(displayPriceInCents)})`,
          `Plan Name: ${displayPlanName}`,
          `Plan ID: ${displayPlanId}`,
          `Membership ID: ${displayMembershipId}`,
          `Customer Email: ${displayCustomerEmail}`,
          `User ID: ${displayUserId}`,
          `Whop Event Type: ${displayEventType}`,
          `Timestamp (UTC): ${timestamp}`,
        ].join('\n');
        const html = `<p><strong>Avalisa paid purchase was not activated — manual grant needed.</strong></p><p><strong>Reason:</strong> ${escapeHtml(displayReason)}<br><strong>Price:</strong> ${displayPriceInCents} cents (${formatDollars(displayPriceInCents)})<br><strong>Plan Name:</strong> ${escapeHtml(displayPlanName)}<br><strong>Plan ID:</strong> ${escapeHtml(displayPlanId)}<br><strong>Membership ID:</strong> ${escapeHtml(displayMembershipId)}<br><strong>Customer Email:</strong> ${escapeHtml(displayCustomerEmail)}<br><strong>User ID:</strong> ${escapeHtml(displayUserId)}<br><strong>Whop Event Type:</strong> ${escapeHtml(displayEventType)}<br><strong>Timestamp (UTC):</strong> ${timestamp}</p>`;

        Promise.resolve()
          .then(() => sendEmail({
            to: recipient,
            subject: `[Avalisa] PAID BUT NOT ACTIVATED (${displayReason}) - manual grant needed`,
            text,
            html,
          }))
          .catch(() => {});
      }
    } catch (err) {
      // Swallow: alert notifications must never affect paid webhook handling.
    }

    return wrote;
  })();
  p.catch(() => {});
  return p;
}

module.exports = { recordUnmappedPurchase };
