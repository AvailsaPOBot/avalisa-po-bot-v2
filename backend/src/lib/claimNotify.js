const { sendEmail, emailConfigured } = require('./email');

function truncate(value) {
  return String(value || '').slice(0, 500);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function findUserEmail(prisma, details) {
  const suppliedEmail = details.email || '';
  try {
    const user = await prisma?.user?.findUnique?.({
      where: { id: details.userId },
      select: { email: true },
    });
    return user?.email || suppliedEmail;
  } catch (_) {
    return suppliedEmail;
  }
}

function sendClaimEmail(message) {
  try {
    if (emailConfigured()) {
      Promise.resolve().then(() => sendEmail(message)).catch(() => {});
    }
  } catch (_) {
    // Claim notifications are best-effort and must never affect the request.
  }
}

// Callers must not await this in request handlers. The promise is returned only
// to make the fire-and-forget work directly testable.
function notifyBoardOfClaim(prisma, details = {}) {
  const p = (async () => {
    const userId = truncate(details.userId) || 'unknown';
    const poUid = truncate(details.poUid) || 'unknown';
    const userEmail = truncate(await findUserEmail(prisma, details)) || 'unknown';
    const timestamp = new Date().toISOString();
    const text = [
      'Avalisa Pocket Option account claim awaiting review.',
      `User email: ${userEmail}`,
      `User ID: ${userId}`,
      `Claimed PO UID: ${poUid}`,
      `Timestamp (UTC): ${timestamp}`,
    ].join('\n');

    sendClaimEmail({
      to: process.env.SUPPORT_ALERT_EMAIL || 'avalisapobot@gmail.com',
      subject: '[Avalisa] New PO account claim awaiting review',
      text,
      html: `<p><strong>Avalisa Pocket Option account claim awaiting review.</strong></p><p><strong>User email:</strong> ${escapeHtml(userEmail)}<br><strong>User ID:</strong> ${escapeHtml(userId)}<br><strong>Claimed PO UID:</strong> ${escapeHtml(poUid)}<br><strong>Timestamp (UTC):</strong> ${timestamp}</p>`,
    });
  })();
  p.catch(() => {});
  return p;
}

function notifyUserOfClaimOutcome(prisma, details = {}) {
  const p = (async () => {
    const outcome = details.outcome === 'approved' ? 'approved' : 'rejected';
    const userEmail = truncate(await findUserEmail(prisma, details));
    const poUid = truncate(details.poUid) || 'unknown';
    const reason = truncate(details.reason);
    const approved = outcome === 'approved';
    const text = approved
      ? 'Your Pocket Option account is linked to Avalisa. You can now use your Pro access. Need help? Reply to avalisapobot@gmail.com.'
      : [
        'We could not verify your Pocket Option account.',
        `PO UID checked: ${poUid}`,
        ...(reason ? [`Reason: ${reason}`] : []),
        'Please reply to avalisapobot@gmail.com for help.',
      ].join('\n');

    if (!userEmail) return;
    sendClaimEmail({
      to: userEmail,
      subject: approved
        ? '[Avalisa] Your Pocket Option account is linked'
        : '[Avalisa] We could not verify your Pocket Option account',
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    });
  })();
  p.catch(() => {});
  return p;
}

module.exports = { notifyBoardOfClaim, notifyUserOfClaimOutcome };
