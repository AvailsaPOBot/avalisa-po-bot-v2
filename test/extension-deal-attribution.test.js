/**
 * A trade's result must come from ITS OWN deal, never a neighbouring one.
 *
 * Observed live 2026-08-17 (PO demo, Bitcoin OTC):
 *   23:34 $2 ✓   23:35 $1 ✗   23:36 $1 ✗   23:37 $2 ✓
 * The 23:35 LOSS did not double the ladder — 23:36 repeated $1. A previous
 * trade's successcloseOrder can land just after the next trade opens, and
 * readWsTradeResultSince() matched purely on timestamp and took the LAST event,
 * so the new trade inherited the old verdict. A stale WIN "reset" a ladder that
 * was already at $1, silently swallowing a loss.
 *
 * successopenOrder carries the deal id and every closed deal repeats it, so the
 * pairing can be exact.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'extension/tradeResult.js'), 'utf8');

function load(state) {
  const body = src.slice(0, src.indexOf('async function resolveTradeResult'));
  return new Function('state', 'document', 'console',
    body + '\nreturn { readWsTradeResultSince, resultForDealId };',
  )(state, { visibilityState: 'visible' }, { log() {}, warn() {} });
}

const OURS = 'aaaaaaaa-1111-2222-3333-444444444444';
const THEIRS = 'bbbbbbbb-5555-6666-7777-888888888888';
const closeEvent = (ts, deals) => ({ ts, event: 'successcloseOrder', payload: { profit: 0, deals } });

// ── The exact bug: the previous trade's WIN lands after ours opened ─────────
{
  const state = {
    currentDealId: OURS,
    recentCloseEvents: [
      // neighbouring trade's win, timestamped inside our window
      closeEvent(2000, [{ id: THEIRS, amount: 2, profit: 1.84 }]),
    ],
  };
  const { readWsTradeResultSince } = load(state);
  assert.equal(readWsTradeResultSince(1000), null,
    'another deal\'s close must NOT resolve our trade');
}

// ── Our own deal resolves correctly, even when batched with others ──────────
{
  const state = {
    currentDealId: OURS,
    recentCloseEvents: [
      closeEvent(2000, [
        { id: THEIRS, amount: 2, profit: 1.84 },   // someone else's win, listed LAST previously wins
        { id: OURS, amount: 1, profit: -1 },
      ]),
    ],
  };
  const { readWsTradeResultSince } = load(state);
  const r = readWsTradeResultSince(1000);
  assert.ok(r, 'our deal should resolve');
  assert.equal(r.result, 'loss', 'must report OUR deal (-1), not the neighbour\'s win');
}

// ── Order within the batch must not matter ─────────────────────────────────
{
  const state = {
    currentDealId: OURS,
    recentCloseEvents: [
      closeEvent(2000, [
        { id: OURS, amount: 1, profit: 0.92 },
        { id: THEIRS, amount: 8, profit: -8 },     // neighbour's loss listed last
      ]),
    ],
  };
  const { readWsTradeResultSince } = load(state);
  assert.equal(readWsTradeResultSince(1000).result, 'win');
}

// ── A tie on our deal is a tie ──────────────────────────────────────────────
{
  const state = {
    currentDealId: OURS,
    recentCloseEvents: [closeEvent(2000, [{ id: OURS, amount: 1, profit: 0 }])],
  };
  const { readWsTradeResultSince } = load(state);
  assert.equal(readWsTradeResultSince(1000).result, 'tie');
}

// ── No deal id known (open never confirmed via socket) → time fallback ──────
{
  const state = {
    currentDealId: null,
    recentCloseEvents: [closeEvent(2000, [{ id: THEIRS, amount: 2, profit: 1.84 }])],
  };
  const { readWsTradeResultSince } = load(state);
  assert.equal(readWsTradeResultSince(1000).result, 'win',
    'without a known deal id the old time-based behaviour is the fallback');
}

// ── Events older than the trade are ignored ────────────────────────────────
{
  const state = {
    currentDealId: OURS,
    recentCloseEvents: [closeEvent(500, [{ id: OURS, amount: 1, profit: -1 }])],
  };
  const { readWsTradeResultSince } = load(state);
  assert.equal(readWsTradeResultSince(1000), null, 'a pre-trade event must not resolve it');
}

console.log('Extension deal attribution passed.');
