const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require.resolve('../extension/content.js'), 'utf8');

test('execution telemetry freezes pre-order payout and step across deferred log retries', () => {
  const start = src.indexOf('  const tradeMeta = {');
  const end = src.indexOf("  setTradeLock('order_pending');", start);
  const resultStart = src.indexOf('  const detectedResultMethod =');
  const resultEnd = src.indexOf("  if (result === 'unknown') {", resultStart);
  assert.ok(start > 0 && end > start && resultStart > end && resultEnd > resultStart);
  const payloads = [];
  let retry;
  const ctx = vm.createContext({
    state: { martingaleStep: 3, jwt: 'test', settings: { strategy: 'martingale' }, lastTradeResultDebug: { method: 'dom-late' } },
    getCurrentPayoutPercent: () => 92,
    chrome: { runtime: { getManifest: () => ({ version: '2.4.19' }) } },
    signalSource: null, aiSignalSnapshot: null,
    getCurrentPair: () => 'EURUSD', isDemoMode: () => true,
    direction: 'call', safeAmount: 8, result: 'win', balanceBefore: 100, balanceAfter: 107.36,
    executionTimeframe: 'S30', executionAsset: 'EURUSD', Date,

    withRetry: fn => { retry = fn; return { catch() {} }; },
    apiPost: (url, data) => payloads.push(JSON.parse(JSON.stringify(data))),
    console,
  });
  vm.runInContext(src.slice(start, end), ctx);
  ctx.state.martingaleStep = 0;
  ctx.getCurrentPayoutPercent = () => 75;
  vm.runInContext(src.slice(resultStart, resultEnd), ctx);
  retry();
  ctx.state.martingaleStep = 5;
  ctx.state.lastTradeResultDebug.method = 'ws';
  retry();
  assert.deepEqual(payloads[0].meta, { payoutPct: 92, martingaleStep: 3, extVersion: '2.4.19', source: null, intensity: null, resultMethod: 'dom-late' });
  assert.deepEqual(payloads[0].meta, payloads[1].meta);
  assert.equal(payloads[0].signalSnapshot, null);
});
