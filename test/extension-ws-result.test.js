/**
 * Results now come from Pocket Option's own socket events, with the balance DOM
 * only as a fallback (2026-08-17, Board-approved).
 *
 * Why: PO sends successopenOrder / successcloseOrder as BINARY frames. The old
 * parser only read text 42[...] frames, so recentCloseEvents was always empty
 * and every verdict fell through to balance heuristics. In a backgrounded tab
 * Chrome throttles timers and PO's balance lags 30s+, so those heuristics booked
 * wins as losses and drove a runaway martingale ladder.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'extension/tradeResult.js'), 'utf8');

function load(visibility) {
  const sandbox = { document: { visibilityState: visibility }, state: { recentCloseEvents: [] }, console };
  const body = src.slice(0, src.indexOf('async function resolveTradeResult'));
  return new Function('document', 'state', 'console',
    body + '\nreturn { extractResultFromCloseEvent, classifyResultFromBalance, isDocumentThrottled };',
  )(sandbox.document, sandbox.state, sandbox.console);
}

// ── The real successcloseOrder shape captured off the wire ──────────────────
// Outer profit is a batch total; the per-deal profit is the actual result.
// Reading the outer field first turned this LOSS into a "tie".
{
  const { extractResultFromCloseEvent } = load('visible');
  const realLoss = { profit: 0, deals: [{ id: 'x', amount: 1, profit: -1, percentProfit: 92 }] };
  assert.equal(extractResultFromCloseEvent(realLoss), 'loss',
    'a deal with profit -1 is a LOSS even though the outer profit field reads 0');

  const realWin = { profit: 0.92, deals: [{ id: 'x', amount: 1, profit: 0.92 }] };
  assert.equal(extractResultFromCloseEvent(realWin), 'win');

  const realTie = { profit: 0, deals: [{ id: 'x', amount: 1, profit: 0 }] };
  assert.equal(extractResultFromCloseEvent(realTie), 'tie');

  // No deals array → fall back to the outer field.
  assert.equal(extractResultFromCloseEvent({ profit: 5 }), 'win');
}

// ── Interim guard: no balance-derived LOSS while the tab is throttled ───────
{
  const visible = load('visible');
  const hidden = load('hidden');

  assert.equal(visible.isDocumentThrottled(), false);
  assert.equal(hidden.isDocumentThrottled(), true);

  // Stake out, payout not yet credited: looks exactly like a loss.
  const args = [1000, 999, 999, 1, 40, 30000]; // before, during, now, amount, iteration, elapsed

  const whenVisible = visible.classifyResultFromBalance(...args);
  assert.ok(whenVisible && whenVisible.result === 'loss',
    'a settled loss must still be callable when the tab is visible');

  const whenHidden = hidden.classifyResultFromBalance(...args);
  assert.equal(whenHidden, null,
    'a hidden tab must NOT book a balance-derived loss — the payout may simply be late');
}

// ── A win is still recognised while hidden (only losses are held) ───────────
{
  const hidden = load('hidden');
  const win = hidden.classifyResultFromBalance(1000, 999, 1000.92, 1, 40, 30000);
  assert.ok(win && win.result === 'win', 'a clear payout must still register while hidden');
}

console.log('Extension WS result + throttle guard passed.');
