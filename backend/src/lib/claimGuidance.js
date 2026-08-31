const { AFFILIATE_LINK } = require('./affiliateLink');
const PRICING_URL = 'https://avalisabot.vercel.app/pricing';

const CLAIM_REJECTION_REASONS = {
  NOT_FOUND: 'not_found',
  UID_MISMATCH: 'uid_mismatch',
};

const CLAIM_REJECTION_MESSAGES = {
  [CLAIM_REJECTION_REASONS.NOT_FOUND]: 'PO UID not found. Register with the Avalisa Pocket Option link, or make payment to activate your account.',
  [CLAIM_REJECTION_REASONS.UID_MISMATCH]: 'PO UID mismatch. Please contact Avalisa support so we can check your account.',
};

function normalizeClaimRejectionReason(reason) {
  if (Object.values(CLAIM_REJECTION_REASONS).includes(reason)) return reason;
  return CLAIM_REJECTION_REASONS.NOT_FOUND;
}

function getClaimRejectionMessage(reason) {
  return CLAIM_REJECTION_MESSAGES[normalizeClaimRejectionReason(reason)];
}

async function getRegisterUrl(prisma) {
  try {
    const row = await prisma.appConfig.findUnique({ where: { key: 'affiliate_link' } });
    return row?.value || AFFILIATE_LINK;
  } catch (err) {
    console.error('[ClaimGuidance] affiliate link lookup failed:', err.message);
    return AFFILIATE_LINK;
  }
}

module.exports = {
  CLAIM_REJECTION_REASONS,
  FALLBACK_REGISTER_URL: AFFILIATE_LINK,
  PRICING_URL,
  getClaimRejectionMessage,
  getRegisterUrl,
  normalizeClaimRejectionReason,
};
