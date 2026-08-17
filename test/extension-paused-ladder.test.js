/**
 * A preserved ladder must never resurrect a rung that has already resolved.
 *
 * Observed live 2026-08-17 (PO demo, AUD/USD OTC):
 *   22:39 $1 ✗  22:39 $2 ✗  22:40 $4 ✓   <- ladder reached $4/step 2, then WON
 *   22:41 $1 ✓  22:42 $1 ✗  22:43 $2 ✓
 *   ...19 minutes idle, no trades on any asset...
 *   23:02 $4 ✗   <- Start resurrected the stale $4/step-2 snapshot
 *
 * preservePausedLadder() had written {currentAmount: 4, martingaleStep: 2}
 * during that first ladder. clearPausedLadder() only ran on consumption or on
 * manual Stop, never when the ladder actually resolved, and
 * PAUSED_LADDER_MAX_AGE_MS is 30 minutes — so a 22-minute-old, already-won
 * ladder was still "resumable" and the next Start opened at $4 instead of $1.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');

const fn = content.slice(
  content.indexOf('function applyMartingaleLogic'),
  content.indexOf('// ─── UI Overlay'),
);
assert.ok(fn.length > 0, 'applyMartingaleLogic not found');

// The reset branch must drop any preserved snapshot.
assert.ok(
  /if \(state\.martingaleStep === 0\) \{[\s\S]*?clearPausedLadder\(\)/.test(fn),
  'applyMartingaleLogic must clear the preserved ladder once the live ladder is back at step 0',
);

// Behavioural check against the real function.
function run({ result, startStep, startAmount, multiplier = 2, steps = 'infinite' }) {
  let cleared = false;
  const state = {
    settings: { martingaleMultiplier: multiplier, startAmount: 1, martingaleSteps: steps },
    martingaleStep: startStep,
    currentAmount: startAmount,
  };
  const apply = new Function('state', 'clearPausedLadder', 'console',
    fn + '\nreturn applyMartingaleLogic;',
  )(state, () => { cleared = true; return Promise.resolve(); }, { log: () => {} });
  apply(result);
  return { state, cleared };
}

// A win resets AND invalidates the snapshot — this is the reported bug.
{
  const { state, cleared } = run({ result: 'win', startStep: 2, startAmount: 4 });
  assert.equal(state.martingaleStep, 0);
  assert.equal(state.currentAmount, 1);
  assert.equal(cleared, true, 'a winning reset must drop the preserved ladder');
}

// A loss keeps climbing and must NOT drop a genuine mid-ladder snapshot.
{
  const { state, cleared } = run({ result: 'loss', startStep: 1, startAmount: 2 });
  assert.equal(state.martingaleStep, 2);
  assert.equal(state.currentAmount, 4);
  assert.equal(cleared, false, 'a mid-ladder loss must keep the preserved ladder intact');
}

// Max-steps reset also returns to step 0, so it must invalidate too.
{
  const { state, cleared } = run({ result: 'loss', startStep: 2, startAmount: 4, steps: '2' });
  assert.equal(state.martingaleStep, 0, 'max steps reached should reset');
  assert.equal(cleared, true, 'a max-steps reset must also drop the preserved ladder');
}

// TIE/unknown hold the ladder and must not touch the snapshot.
for (const result of ['tie', 'unknown']) {
  const { state, cleared } = run({ result, startStep: 2, startAmount: 4 });
  assert.equal(state.currentAmount, 4, `${result} must hold the amount`);
  assert.equal(state.martingaleStep, 2, `${result} must hold the step`);
  assert.equal(cleared, false, `${result} must not clear the preserved ladder`);
}

console.log('Extension paused-ladder invalidation passed.');
