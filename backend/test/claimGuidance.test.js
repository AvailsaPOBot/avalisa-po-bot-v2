const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLAIM_REJECTION_REASONS,
  FALLBACK_REGISTER_URL,
  PRICING_URL,
  getClaimRejectionMessage,
  normalizeClaimRejectionReason,
} = require('../src/lib/claimGuidance');

// HISTORY, worth keeping: this test used to assert the message verbatim —
// /PO UID not found/, /Register with the Avalisa Pocket Option link/, /make payment/ —
// under the name "uses short in-app activation copy". It was pinning BREVITY and exact
// phrasing, and in doing so it locked in a defect: that copy told its own audience to
// register with our link, when free Pro requires a NEW Pocket Option account and every
// reader already has one. A guard that pins wording rather than intent will happily hold
// a bug in place and fail the fix. The correctness assertions now live in
// claimGuidanceMatchesProduct.test.js, pinned to the postback event and the support
// script rather than to a sentence.
test('claim rejection guidance keeps its structural contract', () => {
  const message = getClaimRejectionMessage(CLAIM_REJECTION_REASONS.NOT_FOUND);

  // Plain language for a user, not our internal vocabulary.
  assert.doesNotMatch(message.toLowerCase(), /affiliate/);
  assert.doesNotMatch(message, /\bUID\b/, 'say "Pocket Option ID", not our column name');
  // Both routes the payload offers alongside the message must still resolve.
  assert.equal(PRICING_URL, 'https://avalisabot.vercel.app/pricing');
  assert.match(FALLBACK_REGISTER_URL, /^https:\/\/u3\.shortink\.io\/register/);
});

test('unknown claim rejection reasons fall back to not_found', () => {
  assert.equal(normalizeClaimRejectionReason('bad-input'), CLAIM_REJECTION_REASONS.NOT_FOUND);
});
