/**
 * The support assistant is the front line: it is what a confused buyer talks to. Its script is
 * prose, and prose is never re-measured — so it drifted away from the product and nothing failed.
 *
 * The worst instance, found 2026-09-02: it told every purchaser to "send your Pocket Option ID
 * to avalisapobot@gmail.com to activate". The Whop webhook keys the licence on userId matched by
 * customerEmail (webhooks.js license.upsert); the PO UID is used ONLY by the affiliate claim
 * route, which has an in-app form in both the dashboard and the extension panel. So the script
 * instructed paying customers to perform a step that does nothing, by email, into an inbox that
 * had seven unanswered people in it — several of whom had sent exactly that UID.
 *
 * These tests pin the script's money-path claims to their sources of truth.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const prompt = read('routes/support.js');

test('quotes every purchasable Pro price, including the cheaper monthly option', () => {
  const plans = read('lib/plans.js');
  // 2900 -> PRO is the monthly option the checkout offers alongside the one-time price.
  assert.match(plans, /EXTRA_WHOP_PRICES_TO_PLAN\s*=\s*\{[\s\S]*?2900:\s*PLAN_IDS\.PRO/);
  const proLine = (prompt.match(/^Pro Plan:.*$/m) || [''])[0];
  const basicLine = (prompt.match(/^Basic Plan:.*$/m) || [''])[0];
  assert.match(proLine, /\$119/, 'the Pro PLAN LINE must carry the one-time price');
  assert.match(proLine, /\$29\s*\/\s*month/, 'the Pro PLAN LINE must carry the monthly option');
  assert.match(basicLine, /\$69/, 'the Basic PLAN LINE must carry its price');
});

test('never tells a PURCHASER to email a Pocket Option ID to activate', () => {
  // The exact instruction that filled the inbox. It must not come back in any casing.
  assert.doesNotMatch(
    prompt,
    /After purchasing[^]{0,120}Pocket Option ID[^]{0,60}@/i,
    'purchases activate automatically on the checkout email — no UID, no email',
  );
  assert.ok(
    /activate[s]? AUTOMATICALLY/i.test(prompt),
    'the script must state that purchases activate automatically',
  );
});

test('routes affiliate claims to the in-app form, which actually exists', () => {
  const license = read('routes/license.js');
  assert.match(license, /router\.post\('\/claim'/, 'the claim route must exist');
  assert.ok(
    /claim form/i.test(prompt) && /extension panel/i.test(prompt),
    'the script must send claimants to the in-app form, not to email',
  );
});

test('points setup questions at the live guide', () => {
  assert.ok(
    prompt.includes('https://avalisabot.vercel.app/guide'),
    'the written guide is live and pinned to the product; the script should use it',
  );
});

// THIRD time this check has flagged SAFETY copy instead of a claim: first the guide's own risk
// disclaimer ("does not guarantee profits"), then this file's prohibition ("Do not provide
// financial advice or guarantee profits"). Patching the regex per instance was the wrong move —
// a negation can sit an arbitrary distance from the verb ("do not X, Y, or guarantee profits").
// The honest granularity is the SENTENCE: a sentence carrying a negation is not a promise.
// Its failure mode is inverted from what you would expect, so it is mutation-tested below.
function affirmativeSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .filter((line) => !/\b(not|never|no|cannot|avoid|without|refus\w*)\b/i.test(line));
}

test('still makes no outcome claim', () => {
  const claimy = /guarantee\w*\s+(profit|returns|income|win)|\b(risk[- ]free|sure thing|always wins?)\b/i;
  for (const line of affirmativeSentences(prompt)) {
    assert.doesNotMatch(line, claimy, `outcome claim in support script: "${line.trim().slice(0, 90)}"`);
  }
});

test('the outcome-claim gate can actually fail (mutation)', () => {
  const claimy = /guarantee\w*\s+(profit|returns|income|win)|\b(risk[- ]free|sure thing|always wins?)\b/i;
  const planted = affirmativeSentences('Avalisa will guarantee profits for every user.');
  assert.ok(planted.length === 1, 'the planted sentence must survive the negation filter');
  assert.match(planted[0], claimy, 'a real outcome claim must be caught');
  // and a disclaimer must NOT be caught
  assert.equal(affirmativeSentences('Avalisa does not guarantee profits.').length, 0);
});
