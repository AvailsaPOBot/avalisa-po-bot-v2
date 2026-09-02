/**
 * Rejection copy is the least-read prose in the product and it goes to a user we are refusing —
 * a warm lead, mid-decision. It reaches them twice: in the app (license/claim/status) and by
 * email (claimNotify.notifyUserOfClaimOutcome).
 *
 * The defect it was written for: NOT_FOUND said "Register with the Avalisa Pocket Option link",
 * omitting NEW. Free Pro is granted off the PocketPartners postback, which fires only on
 * event === 'Registration', so an account that already existed can never qualify — and every
 * reader of this message has an account already, because they just submitted its ID.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const {
  CLAIM_REJECTION_REASONS,
  getClaimRejectionMessage,
  normalizeClaimRejectionReason,
} = require('../src/lib/claimGuidance');

const notFound = getClaimRejectionMessage(CLAIM_REJECTION_REASONS.NOT_FOUND);
const mismatch = getClaimRejectionMessage(CLAIM_REJECTION_REASONS.UID_MISMATCH);

test('every reason has a message, and the fallback resolves to a real one', () => {
  for (const reason of Object.values(CLAIM_REJECTION_REASONS)) {
    const msg = getClaimRejectionMessage(reason);
    assert.ok(msg && msg.length > 20, `reason "${reason}" has no usable message`);
  }
  // Anything unrecognised is coerced — the coercion target must itself be a real reason.
  const coerced = normalizeClaimRejectionReason('something-an-admin-typed');
  assert.ok(Object.values(CLAIM_REJECTION_REASONS).includes(coerced));
  assert.ok(getClaimRejectionMessage(coerced));
});

test('NOT_FOUND states the NEW-account condition — the word that makes it true', () => {
  assert.match(notFound, /\bNEW\b/,
    'without "NEW" the instruction is impossible for its own audience: they already have an account');
});

test('NOT_FOUND agrees with the rule the support assistant states', () => {
  const support = read('routes/support.js');
  assert.match(support, /registered a NEW Pocket Option account/i,
    'the support script is the stated rule; if it changes, this message must change with it');
  assert.match(notFound, /cannot be transferred|already had/i,
    'must tell an existing-account holder that their account cannot qualify');
});

test('NOT_FOUND still offers the paid route, since that is what its audience CAN do', () => {
  assert.match(notFound, /paid plan|purchase|pricing/i);
});

test('the postback really is registration-only — the premise of all of the above', () => {
  // I first wrote this as assert.match(postback, /event === 'Registration'/) — pinned to the
  // SOURCE TEXT. Two cycles later it failed a correct fix: PocketPartners sends both casings,
  // so the comparison had to become case-insensitive, and this guard blocked it. That is #117
  // exactly, committed by the person who wrote #117. Pin the INTENT: the grant happens on a
  // registration event and on nothing else. pocketpartners.test.js proves the behaviour;
  // this asserts only the premise the NEW-account rule depends on.
  const postback = read('routes/pocketpartners.js');
  assert.match(postback, /=== 'registration'|=== 'Registration'/i,
    'the grant must still be keyed on a registration event');
  assert.doesNotMatch(postback, /=== '(Deposit|FTD|Trade)'/i,
    'granting on any non-registration event would break the NEW-account rule');
});

test('UID_MISMATCH sends them to a human only because there is no self-serve path', () => {
  // #111's lesson is not "never mention email" — it is "never mention email INSTEAD of a
  // mechanism that exists". Changing a locked UID is admin-only, so email is correct here.
  assert.match(mismatch, /avalisapobot@gmail\.com/);
  assert.match(mismatch, /profile/i, 'it must first tell them how to check the ID themselves');
});
