const { sanitizeTradeMeta } = require('./tradeMeta');
function wilson(wins, n) {
  if (!n) return null;
  const z = 1.959963984540054, p = wins / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}
const dimensions = ['strategy', 'intensity', 'regime', 'rulesMatched', 'ruleId', 'timeframe', 'market', 'payoutBucket', 'utcHour', 'extVersion', 'resultMethod'];
function createAccumulator() {
  const groups = Object.fromEntries(dimensions.map(key => [key, new Map()]));
  const users = new Set();
  const total = bucket();
  function bucket() { return { n: 0, wins: 0, losses: 0, ties: 0, unknown: 0, payoutSum: 0, payoutN: 0 }; }
  function add(b, t, m) {
    b.n++;
    b[t.result === 'win' ? 'wins' : t.result === 'loss' ? 'losses' : t.result === 'tie' ? 'ties' : 'unknown']++;
    if (m.payoutPct != null) { b.payoutSum += m.payoutPct / 100; b.payoutN++; }
  }
  // Only engine-produced labels are emitted; arbitrary snapshot text is not output.
  const enumValue = (value, allowed) => allowed.includes(value) ? value : 'unknown';
  function ingest(t) {
    users.add(t.userId);
    const m = sanitizeTradeMeta(t.meta) || {}, s = t.signalSnapshot || {};
    const p = m.payoutPct;
    const values = {
      strategy: enumValue(t.strategy, ['martingale', 'anti-martingale', 'fixed', 'ai-signal', 'ai', 'user-ai']),
      intensity: enumValue(m.intensity || s.intensity, ['low', 'mid', 'high']),
      regime: enumValue(s.regime, ['trending', 'ranging']),
      rulesMatched: Number.isInteger(s.rulesMatched) && s.rulesMatched >= 0 && s.rulesMatched <= 4 ? String(s.rulesMatched) : 'unknown',
      ruleId: [...new Set((Array.isArray(s.rules) ? s.rules : []).filter(r => r && r.met === true).map(r => r.id).filter(id => ['trend', 'pullback', 'rsi_zone', 'confirm', 'rsi_extreme', 'bb_break', 'momentum'].includes(id)))],
      timeframe: enumValue(t.timeframe, ['S15', 'S30', 'M1', 'M3', 'M5', 'M30', 'H1']),
      market: /otc/i.test(t.pair || '') ? 'OTC' : 'non-OTC',
      payoutBucket: p == null ? 'unknown' : p < 85 ? '<85' : p < 90 ? '85-89' : p <= 92 ? '90-92' : '>92',
      utcHour: String(new Date(t.createdAt).getUTCHours()),
      extVersion: m.extVersion || 'unknown',
      resultMethod: m.resultMethod || 'unknown',
    };
    add(total, t, m);
    for (const key of dimensions) for (const value of Array.isArray(values[key]) ? values[key] : [values[key]]) {
      if (!groups[key].has(value)) groups[key].set(value, bucket());
      add(groups[key].get(value), t, m);
    }
  }
  function finish(b) {
    const { payoutSum, payoutN, ...counts } = b;
    const decided = b.wins + b.losses;
    const avgPayout = payoutN ? payoutSum / payoutN : null;
    return { ...counts, winRate: decided ? b.wins / decided : null, wilson95: wilson(b.wins, decided), payoutKnown: payoutN, avgPayout, breakEven: avgPayout == null ? null : 1 / (1 + avgPayout) };
  }
  return { ingest, result: () => ({ distinctUsers: users.size, total: finish(total), groups: Object.fromEntries(dimensions.map(key => [key, [...groups[key]].map(([value, b]) => ({ value, ...finish(b) }))])) }) };
}
async function getStrategyStats(prisma, query, now = new Date()) {
  const demo = query.demo ?? 'all';
  if (!['true', 'false', 'all'].includes(demo)) throw new RangeError('demo must be true, false or all');
  if (query.since !== undefined && (typeof query.since !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(query.since) || !Number.isFinite(Date.parse(query.since)))) throw new RangeError('since must be an ISO timestamp with timezone');
  const since = query.since === undefined ? new Date(now.getTime() - 30 * 86400000) : new Date(query.since);
  const where = { createdAt: { gte: since, lte: now }, ...(demo === 'all' ? {} : { isDemo: demo === 'true' }) };
  const acc = createAccumulator();
  let cursor;
  while (true) {
    const rows = await prisma.trade.findMany({ where, orderBy: { id: 'asc' }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, strategy: true, signalSnapshot: true, meta: true, result: true, timeframe: true, pair: true, createdAt: true } });
    rows.forEach(acc.ingest);
    if (rows.length < 1000) break;
    cursor = rows.at(-1).id;
  }
  return { since: since.toISOString(), until: now.toISOString(), demo, ...acc.result() };
}
module.exports = { wilson, createAccumulator, getStrategyStats };
