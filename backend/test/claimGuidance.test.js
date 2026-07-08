const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLAIM_REJECTION_REASONS,
  FALLBACK_REGISTER_URL,
  PRICING_URL,
  getClaimRejectionMessage,
  normalizeClaimRejectionReason,
} = require('../src/lib/claimGuidance');

test('claim rejection guidance uses short in-app activation copy', () => {
  const message = getClaimRejectionMessage(CLAIM_REJECTION_REASONS.NOT_FOUND);

  assert.match(message, /PO UID not found/);
  assert.match(message, /Register with the Avalisa Pocket Option link/);
  assert.match(message, /make payment/);
  assert.doesNotMatch(message.toLowerCase(), /affiliate/);
  assert.equal(PRICING_URL, 'https://avalisabot.vercel.app/pricing');
  assert.match(FALLBACK_REGISTER_URL, /^https:\/\/u3\.shortink\.io\/register/);
});

test('unknown claim rejection reasons fall back to not_found', () => {
  assert.equal(normalizeClaimRejectionReason('bad-input'), CLAIM_REJECTION_REASONS.NOT_FOUND);
});
