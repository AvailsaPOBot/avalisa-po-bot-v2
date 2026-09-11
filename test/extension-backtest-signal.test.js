const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/backtest-candles-30s.json'), 'utf8'));
const load = () => import('../scripts/backtest-signal.mjs');

test('real engine fixture produces deterministic aggregates and met-rule groups', async () => {
  const { runBacktest } = await load();
  const report = runBacktest(fixture, { includeSignals: true });
  assert.deepEqual(report, runBacktest(fixture, { includeSignals: true }));
  assert.equal(report.evaluated, 270);
  assert.equal(report.skipped, 206);
  assert.equal(report.unscored, 1);
  assert.equal(report.groups.intensity.low.n, 58);
  assert.equal(report.groups.intensity.low.wins, 43);
  assert.equal(report.groups.intensity.mid.n, 5);
  for (const signal of report.signals) {
    const expected = signal.entry === signal.exit ? 'ties' : ((signal.exit > signal.entry) === (signal.action === 'CALL') ? 'wins' : 'losses');
    assert.equal(signal.result, expected);
  }
  for (const [id, bucket] of Object.entries(report.groups.ruleId)) {
    assert.equal(bucket.n, report.signals.filter(s => s.snapshot.rules.some(r => r.id === id && r.met)).length);
  }
});

test('future candle changes cannot change historical signal decisions; rolling buffer matches content', async () => {
  const { runBacktest, createEvaluator } = await load();
  const changed = structuredClone(fixture);
  for (const c of changed.AUDCAD_otc.slice(60)) for (const k of ['open', 'high', 'low', 'close']) c[k] += 2;
  const original = runBacktest(fixture, { includeSignals: true }).signals.filter(s => s.index < 60);
  const modified = runBacktest(changed, { includeSignals: true }).signals.filter(s => s.index < 60);
  const decisions = signals => signals.map(({ exit, result, ...decision }) => decision);
  assert.deepEqual(decisions(original), decisions(modified));
  const evaluate = createEvaluator();
  assert.deepEqual(evaluate(fixture.AUDCAD_otc, 'AUDCAD_otc', 'low'), evaluate(fixture.AUDCAD_otc.slice(-50), 'AUDCAD_otc', 'low'));
  assert.equal(evaluate(fixture.AUDCAD_otc.slice(0, 11), 'AUDCAD_otc', 'low').action, 'SKIP');
  assert.equal(evaluate(fixture.AUDCAD_otc.slice(0, 15), 'AUDCAD_otc', 'mid').action, 'SKIP');
});

test('Wilson intervals use wins plus losses; empty outcomes have no interval', async () => {
  const { wilson } = await load();
  assert.equal(wilson(0, 0), null);
  const interval = wilson(50, 50);
  assert.ok(Math.abs(interval.low - 0.4038315303659956) < 1e-12);
  assert.ok(Math.abs(interval.high - 0.5961684696340044) < 1e-12);
  assert.equal(wilson(5, 0).high, 1);
});

test('expiry scoring includes ties and rejects malformed candles/options', async () => {
  const { runBacktest } = await load();
  const base = runBacktest(fixture, { intensities: ['low'], includeSignals: true });
  const signal = base.signals[0];
  const tied = structuredClone(fixture);
  const candle = tied.AUDCAD_otc[signal.index + 2];
  candle.close = signal.entry;
  candle.high = Math.max(candle.high, candle.close);
  candle.low = Math.min(candle.low, candle.close);
  const report = runBacktest(tied, { intensities: ['low'], includeSignals: true });
  assert.equal(report.signals.find(s => s.index === signal.index).result, 'ties');
  const bucket = report.groups.intensity.low;
  assert.equal(bucket.winRate, bucket.wins / (bucket.wins + bucket.losses));
  const gap = structuredClone(fixture); gap.AUDCAD_otc[1].time += 1;
  assert.throws(() => runBacktest(gap), /30-second/);
  assert.throws(() => runBacktest(fixture, { expiry: 0 }), /positive integer/);
  assert.throws(() => runBacktest(fixture, { intensities: ['oops'] }), /intensities/);
});

test('CLI reads local JSON and emits parseable report', () => {
  const output = execFileSync(process.execPath, ['scripts/backtest-signal.mjs', 'test/fixtures/backtest-candles-30s.json', '--expiry', '3', '--intensity', 'low'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  const report = JSON.parse(output);
  assert.equal(report.expirySeconds, 90);
  assert.deepEqual(Object.keys(report.groups.intensity), ['low']);
});
