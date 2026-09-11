const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeTradeMeta } = require('../src/lib/tradeMeta');
const { wilson, createAccumulator, getStrategyStats } = require('../src/lib/strategyStats');
const { pruneTrades } = require('../src/lib/tradeRetention');

test('meta strictly whitelists typed bounded telemetry', () => {
  const valid = { payoutPct: 92, martingaleStep: 3, extVersion: '2.4.18', resultMethod: 'dom-late', source: 'favorite', intensity: 'high' };
  assert.deepEqual(sanitizeTradeMeta({ ...valid, userId: 'secret', extra: 'x'.repeat(10000) }), valid);
  assert.equal(sanitizeTradeMeta({ payoutPct: '92', martingaleStep: 1.5, extVersion: 'x'.repeat(10000), resultMethod: 'bad', source: 'bad', intensity: 'bad' }), null);
  assert.equal(sanitizeTradeMeta([]), null);
  assert.equal(sanitizeTradeMeta({ payoutPct: Infinity, martingaleStep: -1 }), null);
  assert.deepEqual(sanitizeTradeMeta({ source: null, intensity: null, payoutPct: 0 }), { payoutPct: 0, source: null, intensity: null });
  assert.ok(Buffer.byteLength(JSON.stringify(sanitizeTradeMeta(valid))) <= 512);
});
test('Wilson 95 interval reference values and zero denominator', () => {
  assert.equal(wilson(0, 0), null);
  assert.ok(Math.abs(wilson(5, 10).low - 0.2365930905) < 1e-9);
  assert.ok(Math.abs(wilson(5, 10).high - 0.7634069095) < 1e-9);
  assert.ok(wilson(0, 10).low < 1e-15);
  assert.ok(wilson(10, 10).high > 1 - 1e-15);
});
const base = { userId: 'PRIVATE_USER_A', strategy: 'ai', timeframe: 'S30', pair: 'EURUSD_otc', createdAt: new Date('2026-09-10T17:00:00Z'), signalSnapshot: { intensity: 'mid', regime: 'ranging', rulesMatched: 3, rules: [{ id: 'rsi_extreme', met: true }, { id: 'bb_break', met: false }, { id: 'confirm', met: true }, { id: 'confirm', met: true }] }, meta: { payoutPct: 92, extVersion: '2.4.18', resultMethod: 'ws' } };
test('all dimensions aggregate outcomes without user identifiers or raw snapshots', () => {
  const a = createAccumulator();
  ['win', 'loss', 'tie', 'pending', 'unknown'].forEach((result, i) => a.ingest({ ...base, result, userId: i ? 'PRIVATE_USER_B' : base.userId }));
  const r = a.result();
  assert.equal(r.distinctUsers, 2);
  assert.deepEqual([r.total.n, r.total.wins, r.total.losses, r.total.ties, r.total.unknown], [5, 1, 1, 1, 2]);
  assert.equal(r.total.winRate, 0.5);
  assert.ok(Math.abs(r.total.breakEven - 1 / 1.92) < 1e-12);
  for (const [key, value] of Object.entries({ strategy: 'ai', intensity: 'mid', regime: 'ranging', rulesMatched: '3', timeframe: 'S30', market: 'OTC', payoutBucket: '90-92', utcHour: '17', extVersion: '2.4.18', resultMethod: 'ws' })) {
    assert.equal(r.groups[key][0].value, value);
    assert.equal(r.groups[key][0].n, 5);
  }
  assert.deepEqual(r.groups.ruleId.map(b => [b.value, b.n]), [['rsi_extreme', 5], ['confirm', 5]]);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE_USER|userId|signalSnapshot/);
});
test('payout boundaries, legacy unknown metadata and tie-only buckets', () => {
  const a = createAccumulator();
  [84.9, 85, 89.9, 90, 92, 92.1, null].forEach(payoutPct => a.ingest({ ...base, result: 'tie', meta: payoutPct === null ? null : { payoutPct }, signalSnapshot: null }));
  const r = a.result();
  assert.deepEqual(r.groups.payoutBucket.map(b => [b.value, b.n]), [['<85', 1], ['85-89', 2], ['90-92', 2], ['>92', 1], ['unknown', 1]]);
  assert.equal(r.total.winRate, null);
  assert.equal(r.total.wilson95, null);
  assert.equal(r.groups.payoutBucket.at(-1).breakEven, null);
});
test('stats uses date/demo filters and rejects bad inputs', async () => {
  let args;
  const db = { trade: { findMany: async q => { args = q; return [{ ...base, result: 'win' }]; } } };
  const now = new Date('2026-09-11T00:00:00Z');
  const r = await getStrategyStats(db, { demo: 'false' }, now);
  assert.equal(args.where.isDemo, false);
  assert.equal(args.where.createdAt.gte.toISOString(), '2026-08-12T00:00:00.000Z');
  assert.equal(r.distinctUsers, 1);
  await assert.rejects(getStrategyStats(db, { demo: 'no' }), RangeError);
  await assert.rejects(getStrategyStats(db, { since: 'yesterday' }), RangeError);
});
test('pruning is strictly age based, only through explicit maintenance call', async () => {
  let args;
  await pruneTrades({ trade: { deleteMany: async q => { args = q; return { count: 4 }; } } }, new Date('2026-09-11T00:00:00Z'));
  assert.deepEqual(args, { where: { createdAt: { lt: new Date('2025-09-11T00:00:00Z') } } });
});
function loadRouter(file, db) {
  const path = require.resolve('../src/lib/prisma'), route = require.resolve('../src/routes/' + file);
  const previous = require.cache[path];
  require.cache[path] = { id: path, filename: path, loaded: true, exports: db };
  delete require.cache[route];
  const router = require(route);
  return { router, restore() { delete require.cache[route]; if (previous) require.cache[path] = previous; else delete require.cache[path]; } };
}
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } }; }
test('log retains old trades, stores sanitized meta without consuming AI allowance', async () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: String(i) }));
  const route = loadRouter('trades', { trade: {
    create: async ({ data }) => { rows.push(data); return data; },
    deleteMany: async () => { assert.fail('logging must never delete trades'); },
    findMany: async () => { assert.fail('logging must never query trades for trimming'); },
  } });
  try {
    const res = response();
    await route.router.stack.find(l => l.route?.path === '/log').route.stack.at(-1).handle({ userId: 'local', body: { direction: 'call', amount: 1, result: 'win', meta: { martingaleStep: 2, secret: 'discard' } } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(rows.length, 151);
    assert.deepEqual(rows.at(-1).meta, { martingaleStep: 2 });
    assert.equal(rows.at(-1).signalSnapshot, null);
  } finally { route.restore(); }
});
test('history caps retained display at newest 50 demo and 100 real using take', async () => {
  const queries = [];
  const route = loadRouter('trades', { trade: { findMany: async q => { queries.push(q); return Array.from({ length: q.take }, (_, i) => ({ id: String(i), createdAt: new Date(), result: 'tie' })); } } });
  try {
    const res = response();
    await route.router.stack.find(l => l.route?.path === '/history').route.stack.at(-1).handle({ userId: 'local', query: { type: 'all', limit: '1000' } }, res);
    assert.deepEqual(queries.map(q => q.take), [50, 100]);
    assert.equal(res.body.pagination.total, 150);
    assert.equal(res.body.trades.length, 100);
  } finally { route.restore(); }
});
test('admin endpoint is behind existing auth and emits aggregates only', async () => {
  const route = loadRouter('admin', { trade: { findMany: async () => [{ ...base, result: 'win' }] } });
  try {
    const { authMiddleware, adminMiddleware } = require('../src/middleware/auth');
    const index = route.router.stack.findIndex(l => l.route?.path === '/strategy-stats');
    assert.ok(route.router.stack.slice(0, index).some(l => l.handle === authMiddleware));
    assert.ok(route.router.stack.slice(0, index).some(l => l.handle === adminMiddleware));
    const res = response();
    await route.router.stack[index].route.stack.at(-1).handle({ query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.distinctUsers, 1);
    assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE_USER|userId/);
  } finally { route.restore(); }
});
