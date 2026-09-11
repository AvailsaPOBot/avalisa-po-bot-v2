#!/usr/bin/env node
// Offline candle-close research only: no order execution, payout filtering, pair
// ranking, intrabar ticks, or martingale simulation. Signals may overlap.
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, 'extension', name), 'utf8');

export function wilson(wins, losses) {
  const n = wins + losses;
  if (!n) return null;
  const z = 1.959963984540054, p = wins / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export function createEvaluator() {
  const context = vm.createContext({ document: { getElementById: () => null }, recordSignalSnapshot() {} });
  for (const file of ['config.js', 'state.js', 'indicators.js', 'signalEngine.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const content = read('content.js');
  // Execute these actual content functions, so readiness, timeframe mapping,
  // indicator arguments and evaluation stay identical to the extension.
  for (const name of ['getBufferedCandles', 'getCurrentAiIntensity', 'getRequiredCandles', 'evaluateAvalisaCurrentPair']) {
    const match = content.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));
    if (!match) throw new Error(`Cannot load content.js function ${name}`);
    vm.runInContext(match[0], context, { filename: `content.js:${name}` });
  }
  const evaluate = vm.runInContext(`(candles, pair, intensity, end) => {
    state.settings = { ...(state.settings || {}), intensity };
    state.activePair = pair;
    state.activePeriod = AI_ANALYSIS_PERIOD_SEC;
    state.candleBuffer[pair + ':' + state.activePeriod] = candles.slice(Math.max(0, end - MAX_CANDLE_BUFFER), end);
    return evaluateAvalisaCurrentPair(intensity);
  }`, context);
  return (candles, pair, intensity, end = candles.length) => JSON.parse(JSON.stringify(evaluate(candles, pair, intensity, end)));
}

function validate(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object' || !Object.keys(data).length) {
    throw new Error('Input must be { "PAIR": [{time, open, high, low, close}, ...] }; time is Unix seconds.');
  }
  for (const [pair, candles] of Object.entries(data)) {
    if (!Array.isArray(candles) || !candles.length) throw new Error(`${pair}: candles must be a nonempty array`);
    candles.forEach((c, i) => {
      if (!c || !['time', 'open', 'high', 'low', 'close'].every(k => Number.isFinite(c[k])) ||
          c.low <= 0 || c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close) ||
          (i && c.time - candles[i - 1].time !== 30)) {
        throw new Error(`${pair}: invalid OHLC or noncontiguous 30-second timestamps at candle ${i}`);
      }
    });
  }
}

export function runBacktest(data, { expiry = 2, intensities = ['low', 'mid', 'high'], includeSignals = false } = {}) {
  validate(data);
  if (!Number.isInteger(expiry) || expiry < 1) throw new Error('expiry must be a positive integer candle count');
  if (!Array.isArray(intensities) || !intensities.length || new Set(intensities).size !== intensities.length || intensities.some(i => !['low', 'mid', 'high'].includes(i))) throw new Error('Invalid intensities');
  const evaluate = createEvaluator();
  const groups = Object.fromEntries(['intensity', 'regime', 'rulesMatched', 'ruleId'].map(k => [k, new Map()]));
  const signals = [];
  let evaluated = 0, skipped = 0, unscored = 0;
  for (const [pair, candles] of Object.entries(data)) {
    for (let i = 0; i < candles.length; i++) {
      for (const intensity of intensities) {
        const opportunity = evaluate(candles, pair, intensity, i + 1);
        evaluated++;
        if (opportunity.action === 'SKIP') { skipped++; continue; }
        if (i + expiry >= candles.length) { unscored++; continue; }
        const entry = candles[i].close, exit = candles[i + expiry].close;
        const result = entry === exit ? 'ties' : ((exit > entry) === (opportunity.action === 'CALL') ? 'wins' : 'losses');
        const snapshot = opportunity.sig.snapshot;
        const keys = { intensity: [intensity], regime: [snapshot.regime ?? 'unknown'], rulesMatched: [String(snapshot.rulesMatched)], ruleId: [...new Set(snapshot.rules.filter(r => r.met).map(r => r.id))] };
        for (const [dimension, values] of Object.entries(keys)) for (const value of values) {
          const bucket = groups[dimension].get(value) || { n: 0, wins: 0, losses: 0, ties: 0, unknown: 0 };
          bucket.n++; bucket[result]++; groups[dimension].set(value, bucket);
        }
        if (includeSignals) signals.push({ pair, index: i, time: candles[i].time, intensity, action: opportunity.action, entry, exit, result, snapshot });
      }
    }
  }
  const report = {
    expiryCandles: expiry, expirySeconds: expiry * 30, evaluated, skipped, unscored,
    methodology: 'Closed 30s candles; real extension readiness/indicators/engine; rolling max 50; every non-SKIP scored at entry index + expiry. Overlapping signals and intensity variants are correlated; intervals are descriptive. No execution, payout filters, pair selection, fees, or martingale simulation.',
    groups: Object.fromEntries(Object.entries(groups).map(([key, buckets]) => [key, Object.fromEntries([...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([value, b]) => [value, { ...b, winRate: b.wins + b.losses ? b.wins / (b.wins + b.losses) : null, wilson95: wilson(b.wins, b.losses) }]))])),
  };
  if (includeSignals) report.signals = signals;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const file = args.shift();
    if (!file || args.length % 2 || args.some((v, i) => i % 2 === 0 && !['--expiry', '--intensity'].includes(v))) throw new Error('Usage: node scripts/backtest-signal.mjs candles.json [--expiry 2] [--intensity low|mid|high|all]');
    const flags = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
    const options = { expiry: flags['--expiry'] === undefined ? 2 : Number(flags['--expiry']) };
    if (flags['--intensity'] && flags['--intensity'] !== 'all') options.intensities = [flags['--intensity']];
    console.log(JSON.stringify(runBacktest(JSON.parse(fs.readFileSync(file, 'utf8')), options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
