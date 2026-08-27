// Support escalation capture — fire-and-forget safety records.
//
// Unlike funnel analytics, support escalations are never configuration-gated:
// whenever FunnelEvent is available, an escalation should be recorded.

const { sendEmail, emailConfigured } = require('./email');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Returns a promise (resolving to whether a row was written) for tests, but
// callers should NOT await it in request handlers.
function recordSupportEscalation(prisma, details = {}) {
  const p = (async () => {
    const { userId, reason, excerpt } = details || {};
    const safeExcerpt = String(excerpt || '').slice(0, 500);
    let wrote = false;

    try {
      if (prisma?.funnelEvent?.create) {
        await prisma.funnelEvent.create({
          data: {
            type: 'support_escalation',
            userId: userId || null,
            meta: { reason, excerpt: safeExcerpt },
          },
        });
        wrote = true;
      }
    } catch (err) {
      // Swallow: a missing table or DB hiccup must not affect support replies.
    }

    try {
      if (emailConfigured()) {
        const timestamp = new Date().toISOString();
        const recipient = process.env.SUPPORT_ALERT_EMAIL || 'avalisapobot@gmail.com';
        const displayUserId = userId || 'anonymous';
        const displayReason = reason || 'unknown';
        const text = [
          'Avalisa support escalation',
          `Reason: ${displayReason}`,
          `User ID: ${displayUserId}`,
          `Excerpt: ${safeExcerpt}`,
          `Timestamp (UTC): ${timestamp}`,
        ].join('\n');
        const html = `<p><strong>Avalisa support escalation</strong></p><p><strong>Reason:</strong> ${escapeHtml(displayReason)}<br><strong>User ID:</strong> ${escapeHtml(displayUserId)}<br><strong>Excerpt:</strong> ${escapeHtml(safeExcerpt)}<br><strong>Timestamp (UTC):</strong> ${timestamp}</p>`;

        Promise.resolve()
          .then(() => sendEmail({
            to: recipient,
            subject: `[Avalisa] Support escalation: ${displayReason}`,
            text,
            html,
          }))
          .catch(() => {});
      }
    } catch (err) {
      // Swallow: escalation notifications must never affect chat replies.
    }

    return wrote;
  })();
  p.catch(() => {});
  return p;
}

module.exports = { recordSupportEscalation };
