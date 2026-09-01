const { AFFILIATE_LINK } = require('./affiliateLink');
const PRICING_URL = 'https://avalisabot.vercel.app/pricing';

const CLAIM_REJECTION_REASONS = {
  NOT_FOUND: 'not_found',
  UID_MISMATCH: 'uid_mismatch',
};

// Everyone who reads a rejection has ALREADY got a Pocket Option account — they just submitted
// its ID. The old NOT_FOUND text said "Register with the Avalisa Pocket Option link", omitting
// the single word that makes it true: NEW. Free Pro is granted off the PocketPartners postback,
// which fires only on `event === 'Registration'` (routes/pocketpartners.js), so an account that
// already existed can never qualify no matter how it signs in. The reader would follow the link,
// log into the account they already had, see nothing happen, and email support — which is how
// the inbox filled. An instruction that cannot work for its own audience is the same defect
// class as a promise with no mechanism behind it.
//
// These two strings must keep agreeing with the support assistant's stated rule
// (routes/support.js: "Pro access only unlocks if you registered a NEW Pocket Option account").
// supportPromptMatchesProduct-style guard: test/claimGuidanceMatchesProduct.test.js.
const CLAIM_REJECTION_MESSAGES = {
  [CLAIM_REJECTION_REASONS.NOT_FOUND]:
    'This Pocket Option account was not registered through our link, so it does not qualify for '
    + 'free Pro. Free Pro requires a NEW Pocket Option account created with our link — an account '
    + 'you already had cannot be transferred to it. To keep using the account you have, a paid '
    + 'plan unlocks it straight away.',
  [CLAIM_REJECTION_REASONS.UID_MISMATCH]:
    'This Pocket Option ID does not match the one already linked to your Avalisa account. Open '
    + 'your Pocket Option profile, check the numeric ID there, and submit it again. If it still '
    + 'does not match, email avalisapobot@gmail.com with both IDs and we will correct it — this '
    + 'one genuinely needs a human, so there is nothing to self-serve.',
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
