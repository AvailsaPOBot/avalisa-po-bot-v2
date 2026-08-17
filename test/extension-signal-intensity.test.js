/**
 * Signal engine v3 (2.4.9) — intensity means exactly one thing:
 * how many of the four rules must agree. Low 2, Mid 3, High 4.
 *
 * Guards the two Board-directed changes:
 *   - High must trade OTC pairs (it used to skip them outright, which meant it
 *     refused most of Pocket Option's always-on catalogue).
 *   - The bands must be identical at every intensity, so a "3 of 4" readout
 *     means the same thing at Low as it does at High and the panel checklist is
 *     comparable between levels.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'extension/signalEngine.js'), 'utf8');
const sandbox = { globalThis: {} };
sandbox.globalThis = sandbox;
new Function('globalThis', src)(sandbox);
const engine = sandbox.AvalisaSignalEngine;

assert.ok(engine, 'signal engine did not register');
assert.deepStrictEqual(engine.RULES_REQUIRED, { low: 2, mid: 3, high: 4 },
  'intensity must map to rules-required 2/3/4');
assert.strictEqual(engine.TOTAL_RULES, 4);

// Check the code, not the prose: the header comment legitimately mentions the
// old skipOTC/THRESHOLDS names while explaining why they went away.
const code = src
  .split('\n')
  .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n');

// No intensity may filter OTC any more.
assert.ok(!/skipOTC/.test(code), 'skipOTC must be gone — High now trades OTC');

// Bands must not be defined per intensity.
assert.ok(!/THRESHOLDS\s*=/.test(code), 'per-intensity THRESHOLDS table must be gone');
assert.ok(/const BANDS = \{/.test(src), 'a single shared BANDS block is expected');

// Realistic quiet-market fixture: price ~100, stdev 0.1 -> volRatio ~0.001,
// inside the chaos ceiling (0.0025). Flat slope -> ranging -> mean-revert rules.
// Lower Bollinger band = 100 - 2*0.1 = 99.8.
const base = {
  pair: 'AUDCAD_otc',
  sma20: 100,
  volatility: 0.1,
  slope10: 0.01,      // slopeScore 0.1 < 0.3 -> ranging
};

// All four CALL rules met: oversold, below the band, momentum up, green candle.
const strongCall = { ...base, rsi14: 18, price: 99.5, momentum5: 0.4, lastCandle: 'green' };
for (const intensity of ['low', 'mid', 'high']) {
  const r = engine.evaluateSignal(strongCall, intensity);
  assert.strictEqual(r.action, 'CALL',
    `${intensity} should fire CALL on a 4/4 OTC setup, got ${r.action} (${r.reason})`);
  assert.strictEqual(r.snapshot.rulesMatched, 4);
  assert.strictEqual(r.snapshot.confidence, 100);
  assert.strictEqual(r.snapshot.isOTC, true, 'fixture is an OTC pair');
}

// Exactly two CALL rules met: oversold and momentum up, but price is back inside
// the band and the last candle is red. Low (needs 2) trades it; Mid and High do
// not. Kept deliberately lopsided (call 2 / put 1) so it is a genuine shortfall
// rather than a both-sides conflict.
const weakCall = { ...base, rsi14: 18, price: 99.9, momentum5: 0.4, lastCandle: 'red' };
const expected = { low: 'CALL', mid: 'SKIP', high: 'SKIP' };
for (const [intensity, want] of Object.entries(expected)) {
  const r = engine.evaluateSignal(weakCall, intensity);
  assert.strictEqual(r.action, want,
    `${intensity} on a 2/4 setup should be ${want}, got ${r.action} (${r.reason})`);
  assert.strictEqual(r.snapshot.rulesMatched, 2, `${intensity} should count 2 matched rules`);
  if (want === 'SKIP') {
    assert.strictEqual(r.reason, 'not_enough_rules',
      `${intensity} should skip for lack of rules, not ${r.reason}`);
  }
}

// Every verdict must carry a renderable checklist — this is what the panel shows.
const sample = engine.evaluateSignal(weakCall, 'high');
assert.strictEqual(sample.snapshot.rules.length, 4, 'four rules must be reported');
sample.snapshot.rules.forEach(rule => {
  assert.ok(typeof rule.label === 'string' && rule.label.length > 0, 'each rule needs a label');
  assert.ok(typeof rule.met === 'boolean', 'each rule needs a boolean met flag');
});
assert.strictEqual(sample.snapshot.required, 4);
assert.strictEqual(sample.snapshot.totalRules, 4);
assert.strictEqual(sample.snapshot.side, 'call', 'the leading side must be reported');

// Confidence must be a real proportion, not a rescaled threshold.
assert.strictEqual(sample.snapshot.confidence, 50, '2 of 4 rules should read as 50%');

// Chaos filter still vetoes regardless of intensity.
const chaos = { ...strongCall, volatility: 5 }; // volRatio ~0.05 >> 0.0025 ceiling
assert.strictEqual(engine.evaluateSignal(chaos, 'low').reason, 'vol_too_high');

console.log('Extension signal-intensity (v3) passed.');
