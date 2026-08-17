(async () => {
/**
 * Regression for the martingale double-stake seen live on 2026-08-17:
 *
 *   19:57 $1 ✗  19:58 $2 ✗  19:59 $4 ✗  20:00 $8 ✗  20:01 $16 ✗
 *   20:08 $16 ✗   <- same rung re-fired
 *   20:09 $32 ✗   20:10 $64 ✓ +58.88
 *   20:11 $64 ✓   <- same rung re-fired straight after a WIN
 *
 * waitForTradeOpen() only accepted an ABSOLUTE drop below
 * balanceBefore - amount*0.3. When the previous trade's payout lands inside the
 * window the balance rises, the stake never crosses that level, the order is
 * declared unconfirmed and the cycle re-fires the same rung while the first
 * order is live — doubling real money at risk ($128 on a "$64" rung).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const poDomSrc = fs.readFileSync(path.join(root, 'extension/poDom.js'), 'utf8');

// Pull waitForTradeOpen out and run it against scripted balance/deal readings.
function harness({ balances, dealCounts, wsOpen = null }) {
  const logs = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')) },
    sleep: () => Promise.resolve(),
    getBalance: async () => (balances.length > 1 ? balances.shift() : balances[0]),
    countDealElements: () => (dealCounts.length > 1 ? dealCounts.shift() : dealCounts[0]),
    Date,
  };
  const state = { lastWsOpen: wsOpen };
  const fn = new Function(
    'console', 'sleep', 'getBalance', 'countDealElements', 'Date', 'state',
    poDomSrc.slice(poDomSrc.indexOf('async function waitForTradeOpen'),
                   poDomSrc.indexOf('function parsePayoutPercent')) +
    '\nreturn waitForTradeOpen;',
  )(sandbox.console, sandbox.sleep, sandbox.getBalance, sandbox.countDealElements, sandbox.Date, state);
  return { fn, logs, state };
}

// ── 1. Clean case still works: stake simply deducted ────────────────────────
{
  const { fn } = harness({ balances: [1000, 936], dealCounts: [5, 6] });
  const r = await fn(1000, 64, 3000, 5);
  assert.equal(r.opened, true, 'a plain stake deduction must confirm the open');
}

// ── 2. THE BUG: previous payout lands mid-window and masks the stake ────────
// balanceBefore 1000; the earlier $64 win pays +122.88 while the new $64 stake
// goes out, so the level never drops below 1000-19.2 — it goes UP.
{
  const { fn, logs } = harness({
    balances: [1000, 1122.88, 1058.88, 1058.88],
    dealCounts: [5, 5, 6, 6],
  });
  const r = await fn(1000, 64, 3000, 5);
  assert.equal(r.opened, true,
    'a stake masked by an incoming payout must still confirm — otherwise the same rung is re-fired');
  assert.ok(
    ['balance-step-drop', 'dom-deal-no-balance-drop'].includes(r.method),
    'expected the step-down or deal-list signal, got ' + r.method,
  );
  assert.ok(logs.join(' ').length > 0);
}

// ── 3. PO lists a new deal but the balance is unreadable → assume OPEN ──────
// Calling this closed is what doubles the stake; calling it open at worst
// leaves one trade booked 'unknown', which holds the ladder.
{
  const { fn } = harness({ balances: [1000, 1000], dealCounts: [5, 6] });
  const r = await fn(1000, 64, 3000, 5);
  assert.equal(r.opened, true, 'a new deal in PO\'s list must count as opened');
  assert.equal(r.method, 'dom-deal-no-balance-drop');
}

// ── 4. Nothing happened at all → correctly NOT opened (safe to retry) ───────
{
  const { fn } = harness({ balances: [1000, 1000], dealCounts: [5, 5] });
  const r = await fn(1000, 64, 3000, 5);
  assert.equal(r.opened, false, 'no stake and no deal means the click really did not land');
  assert.equal(r.method, 'timeout-no-balance-drop');
}



// ── 5. PO's socket confirms the open even with a frozen (throttled) balance ──
{
  const { fn } = harness({
    balances: [1000, 1000],
    dealCounts: [5, 5],
    wsOpen: { ts: Date.now() + 50, payload: { asset: 'AUDUSD_otc', amount: 64 } },
  });
  const r = await fn(1000, 64, 3000, 5);
  assert.equal(r.opened, true, 'successopenOrder must confirm the open on its own');
  assert.equal(r.method, 'ws-open', 'the socket signal should win, got ' + r.method);
}

console.log('Extension trade-open confirmation passed.');
})();
