const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/content.js'), 'utf8');
const restoreSource = source.slice(
  source.indexOf('async function restoreRuntimeSession'),
  source.indexOf('// Merge-seed the buffer'),
);

function harness(saved) {
  const scheduled = [];
  const statuses = [];
  let cycleRuns = 0;
  let runtimeClears = 0;
  const state = {
    settings: { startAmount: 1 },
    running: false,
    stopRequested: false,
    cycleGeneration: 10,
  };
  const context = vm.createContext({
    state,
    RUNTIME_SESSION_MAX_AGE_MS: 10 * 60 * 1000,
    loadRuntimeSession: async () => saved,
    clearRuntimeSession: async () => { runtimeClears += 1; },
    getDefaultSettings: () => ({ startAmount: 1, martingaleMultiplier: 2, martingaleSteps: 'infinite' }),
    clearTradeLock: () => {
      state.tradeLock = false;
      state.isTradeOpen = false;
    },
    updateUI: () => {},
    updateTradeCounter: () => {},
    updateStatus: (kind, message) => statuses.push({ kind, message }),
    isCycleActive: generation => state.running && !state.stopRequested && generation === state.cycleGeneration,
    runTradeCycle: async () => { cycleRuns += 1; },
    setTimeout: fn => { scheduled.push(fn); return scheduled.length; },
    Date,
    console,
  });
  vm.runInContext(`${restoreSource}\nthis.restoreRuntimeSession = restoreRuntimeSession;`, context);
  return {
    restore: () => context.restoreRuntimeSession(),
    state,
    statuses,
    scheduled,
    cycleRuns: () => cycleRuns,
    runtimeClears: () => runtimeClears,
  };
}

function savedSession(phase) {
  return {
    savedAt: Date.now(),
    phase,
    running: true,
    stopRequested: false,
    currentAmount: 8,
    martingaleStep: 3,
    tradesCount: 12,
    lastDirection: 'put',
    settings: { startAmount: 1, martingaleMultiplier: 2, martingaleSteps: 'infinite' },
  };
}

(async () => {
  for (const phase of [undefined, 'amount_set', 'order_pending', 'trade_open', 'resolving_result', 'safety_timeout', 'unconfirmed_timeout', 'future_phase']) {
    const h = harness(savedSession(phase));
    assert.equal(await h.restore(), false, `${phase} must not auto-resume`);
    assert.equal(h.state.running, false);
    assert.equal(h.state.stopRequested, true);
    assert.equal(h.state.currentAmount, 8, 'recovery amount must remain available for reconciliation');
    assert.equal(h.state.martingaleStep, 3, 'recovery step must remain available for reconciliation');
    assert.equal(h.scheduled.length, 0, `${phase} must not schedule a new cycle`);
    assert.equal(h.runtimeClears(), 0, 'the unresolved runtime record must be preserved');
    assert.match(h.statuses.at(-1).message, /unresolved trade/i);
  }

  for (const phase of [
    'started', 'amount_retry', 'auto_reload_amount', 'cycle_error_retry',
    'auto_reload_error', 'resolved',
  ]) {
    const safe = harness(savedSession(phase));
    assert.equal(await safe.restore(), true, `${phase} should still resume`);
    assert.equal(safe.state.running, true);
    assert.equal(safe.state.stopRequested, false);
    assert.equal(safe.scheduled.length, 1);
    await safe.scheduled[0]();
    assert.equal(safe.cycleRuns(), 1, `${phase} should schedule the recovered cycle`);
  }

  console.log('Extension restore in-flight guard passed.');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
