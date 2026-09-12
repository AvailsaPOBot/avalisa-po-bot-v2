/**
 * The late-DOM result tier, measured against PO's REAL markup (2026-09-12):
 * rows are `<div class="deals-list__item">` with NO data-id/data-deal-id/
 * data-order-id anywhere, and a losing row renders "$1 $0 $0" — identical to an
 * open one. An id-only tier is therefore dead code in production, and every
 * result the socket and balance tiers miss falls through to quarantine.
 *
 * It must attribute by IDENTITY (new row + same pair + same stake + unique),
 * never by "some row's text changed" — that was the 2026-08-17 stale-verdict bug.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'extension/tradeResult.js'), 'utf8');
const body = src.slice(0, src.indexOf('async function resolveTradeResult'));

// Real row text captured live: "AED/CNY OTC +92% 07:26 $1 $0 $0"
function row(text, { win = false, loss = false, attrs = {} } = {}) {
  const cell = win || loss
    ? { innerText: win ? '+$1.84' : '-$1.00', classList: { contains: c => (win && c === 'price-up') || (loss && c === 'price-down') } }
    : null;
  return { innerText: text, getAttribute: name => attrs[name] ?? null, querySelector: () => cell };
}
function load(rows, state) {
  const document = { querySelectorAll: () => rows };
  const normalizeAssetName = name => String(name).replace(/\s+OTC$/i, '_otc').replace(/\//g, '').trim();
  return new Function('document', 'state', 'console', 'normalizeAssetName',
    body + '\nreturn { findResolvedNewDealResult, parseDealRow };',
  )(document, state, console, normalizeAssetName);
}
const identity = { asset: 'AUDCHF_otc', amount: 2, tradeStartTs: 1000 };
const OPEN = 'AUD/CHF OTC +92% 07:08 $2 $0 $0';
const WON = 'AUD/CHF OTC +92% 07:08 $2 $3.84 +$1.84';

test('resolves a win from a unique new row matching pair and stake', () => {
  const before = ['AUD/NZD OTC +92% 07:04 $1 $0 $0'];
  const { findResolvedNewDealResult } = load([row(WON, { win: true }), row(before[0])], { currentTradeIdentity: identity });
  assert.deepEqual(findResolvedNewDealResult(before, null), { result: 'win', signature: WON });
});

test('two rows of the same pair and stake stay unresolved rather than guessing', () => {
  const { findResolvedNewDealResult } = load([row(WON, { win: true }), row(WON.replace('07:08', '07:11'), { win: true })], { currentTradeIdentity: identity });
  assert.equal(findResolvedNewDealResult([], null), null);
});

test('a row that already existed before this trade is never our result', () => {
  const { findResolvedNewDealResult } = load([row(WON, { win: true })], { currentTradeIdentity: identity });
  assert.equal(findResolvedNewDealResult([WON], null), null);
});

test('another pair or another stake is not our trade', () => {
  const otherPair = load([row('AED/CNY OTC +92% 07:26 $2 $3.84 +$1.84', { win: true })], { currentTradeIdentity: identity });
  assert.equal(otherPair.findResolvedNewDealResult([], null), null);
  const otherStake = load([row('AUD/CHF OTC +92% 07:08 $8 $15.36 +$7.36', { win: true })], { currentTradeIdentity: identity });
  assert.equal(otherStake.findResolvedNewDealResult([], null), null);
});

test('an open row (stake, $0, $0) is not a verdict', () => {
  const { findResolvedNewDealResult } = load([row(OPEN)], { currentTradeIdentity: identity });
  assert.equal(findResolvedNewDealResult([], null), null);
});

test('an explicit deal id in the DOM still wins when PO provides one', () => {
  const { findResolvedNewDealResult } = load([
    row(WON, { win: true, attrs: { 'data-id': 'deal-9' } }),
    row('AUD/CHF OTC +92% 07:09 $2 $3.84 +$1.84', { win: true }),
  ], { currentTradeIdentity: identity });
  assert.equal(findResolvedNewDealResult([], 'deal-9').result, 'win');
});

test('without a known identity nothing is attributed', () => {
  const { findResolvedNewDealResult } = load([row(WON, { win: true })], { currentTradeIdentity: null });
  assert.equal(findResolvedNewDealResult([], null), null);
});

test('parses the live row shape', () => {
  const { parseDealRow } = load([], {});
  assert.deepEqual(parseDealRow(row('AED/CNY OTC +92% 07:26 $1 $0 $0')), { pair: 'AEDCNY_otc', stake: 1 });
  assert.equal(parseDealRow(row('')), null);
});
