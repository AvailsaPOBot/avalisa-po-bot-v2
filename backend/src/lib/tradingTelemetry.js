const EVENT_TYPES = new Set(['order_attempt', 'open_unconfirmed', 'result_unknown', 'pause', 'stop', 'session_start', 'session_stop']);
const validPair = value => typeof value === 'string' && /^[A-Za-z0-9_. /-]{1,80}$/.test(value);
function capBody(req, res, next) {
  if (Buffer.byteLength(JSON.stringify(req.body || {})) > 4096) return res.status(413).json({ error: 'Event payload exceeds 4096 bytes' });
  next();
}
// Authenticated per-user fixed window, bounded by expiry cleanup; no DB access.
function userRateLimit(limit = 120, now = Date.now) {
  const windows = new Map();
  return (req, res, next) => {
    const at = now();
    for (const [id, value] of windows) if (value.until <= at) windows.delete(id);
    const row = windows.get(req.userId) || { count: 0, until: at + 60000 };
    windows.set(req.userId, row);
    if (++row.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((row.until - at) / 1000))));
      return res.status(429).json({ error: 'Telemetry rate limit exceeded' });
    }
    next();
  };
}
function eventData(body, userId) {
  if (!body || !EVENT_TYPES.has(body.type)) throw new RangeError('Invalid event type');
  const meta = {};
  if (body.step != null) {
    if (!Number.isSafeInteger(body.step) || body.step < 0) throw new RangeError('Invalid step');
    meta.step = body.step;
  }
  for (const key of ['extVersion', 'sessionId']) if (body[key] != null) {
    if (typeof body[key] !== 'string' || !/^[0-9A-Za-z.+_-]{1,128}$/.test(body[key])) throw new RangeError('Invalid ' + key);
    meta[key] = body[key];
  }
  if (body.at != null) {
    const at = typeof body.at === 'number' ? new Date(body.at) : new Date(body.at);
    if (!Number.isFinite(at.getTime())) throw new RangeError('Invalid at');
    meta.at = at.toISOString();
  }
  if (body.isDemo != null) {
    if (typeof body.isDemo !== 'boolean') throw new RangeError('Invalid isDemo');
    meta.isDemo = body.isDemo;
  }
  if (body.balance != null) {
    if (typeof body.balance !== 'number' || !Number.isFinite(body.balance) || typeof body.isDemo !== 'boolean') throw new RangeError('Invalid balance or missing isDemo');
    meta.balance = body.balance;
  }
  if (body.pair != null && !validPair(body.pair)) throw new RangeError('Invalid pair');
  if (body.reason != null && (typeof body.reason !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(body.reason))) throw new RangeError('Invalid reason');
  if (body.amount != null && (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0)) throw new RangeError('Invalid amount');
  return { userId, type: body.type, reason: body.reason ?? null, pair: body.pair ?? null, amount: body.amount ?? null, meta };
}
function candleData(body, now = Date.now()) {
  if (!body || !validPair(body.pair) || body.periodSec !== 30 || !Array.isArray(body.candles) || !body.candles.length || body.candles.length > 500) throw new RangeError('Expected pair, periodSec=30 and 1-500 candles');
  if (Buffer.byteLength(JSON.stringify(body)) > 100000) throw new RangeError('Candle payload exceeds 100000 bytes');
  const candles = new Map();
  for (const c of body.candles) {
    if (!c || !Number.isSafeInteger(c.time) || c.time % 30 || c.time < Math.floor(now / 1000) - 90 * 86400 || c.time + 30 > Math.floor(now / 1000) || !['open', 'high', 'low', 'close'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k]) && c[k] > 0) || c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close)) throw new RangeError('Invalid, open, or older-than-90-days candle');
    candles.set(c.time, { pair: body.pair, periodSec: 30, time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return [...candles.values()];
}
// Hard cap on the archive so a telemetry table can never fill the database the
// money path lives in. Row count is a cheap planner estimate, refreshed at most
// every 10 minutes; a failed estimate keeps the previous reading.
const CAP_REFRESH_MS = 10 * 60 * 1000;
const capCache = { at: 0, capped: false };
function maxCandleRows() {
  const n = Number(process.env.MARKET_CANDLE_MAX_ROWS);
  return Number.isFinite(n) && n > 0 ? n : 1500000;
}
async function isArchiveFull(prisma, now = Date.now()) {
  if (capCache.at && now - capCache.at < CAP_REFRESH_MS) return capCache.capped;
  try {
    const rows = await prisma.$queryRaw`SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'MarketCandle'`;
    const n = Number(rows?.[0]?.n);
    capCache.capped = Number.isFinite(n) && n > maxCandleRows();
    capCache.at = now;
  } catch (_) {}
  return capCache.capped;
}
function archiveCapState() { return { capped: capCache.capped }; }
function resetArchiveCap() { capCache.at = 0; capCache.capped = false; }
async function uploadCandles(prisma, body, now = Date.now()) {
  const data = candleData(body, now);
  if (await isArchiveFull(prisma, now)) return { accepted: false, reason: 'archive_full' };
  const { count } = await prisma.marketCandle.createMany({ data, skipDuplicates: true });
  return { accepted: true, count };
}
function timestamp(value, name) {
  const seconds = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Date.parse(value) / 1000;
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 2147483647) throw new RangeError('Invalid ' + name + ': use Unix seconds or ISO timestamp');
  return seconds;
}
async function exportCandles(prisma, query) {
  if (!validPair(query.pair)) throw new RangeError('pair is required');
  const from = timestamp(query.from, 'from'), to = timestamp(query.to, 'to');
  if (to <= from || to - from > 90 * 86400) throw new RangeError('Range must be positive and at most 90 days');
  const rows = await prisma.marketCandle.findMany({ where: { pair: query.pair, periodSec: 30, time: { gte: from, lt: to } }, orderBy: { time: 'asc' }, select: { time: true, open: true, high: true, low: true, close: true }, take: 259201 });
  if (!rows.length) throw new RangeError('No candles in requested range');
  // Never fabricate missing prices or silently return a file the strict backtester rejects.
  const gap = rows.findIndex((c, i) => i && c.time - rows[i - 1].time !== 30);
  if (gap !== -1) throw new RangeError(`Noncontiguous archive: gap after ${rows[gap - 1].time}; narrow from/to to a contiguous range`);
  return { [query.pair]: rows };
}
const MARKET_CANDLE_RETENTION_DAYS = 30;
const TRADE_EVENT_RETENTION_DAYS = 180;
// Delete oldest-first in bounded windows so no single statement locks or scans
// the whole table; stops when nothing older than the cutoff remains.
async function pruneInWindows(findOldest, deleteBefore, cutoff, step, maxBatches = 500) {
  let count = 0;
  for (let i = 0; i < maxBatches; i++) {
    const oldest = await findOldest();
    if (oldest == null || oldest >= cutoff) break;
    count += (await deleteBefore(Math.min(cutoff, oldest + step))).count;
  }
  return { count };
}
async function pruneMarketCandles(prisma, now = new Date()) {
  const cutoff = Math.floor(now.getTime() / 1000) - MARKET_CANDLE_RETENTION_DAYS * 86400;
  return pruneInWindows(
    async () => (await prisma.marketCandle.findFirst({ where: { time: { lt: cutoff } }, orderBy: { time: 'asc' }, select: { time: true } }))?.time ?? null,
    before => prisma.marketCandle.deleteMany({ where: { time: { lt: before } } }),
    cutoff, 7200); // 2h of 30s candles per pair per statement
}
async function pruneTradeEvents(prisma, now = new Date()) {
  const cutoff = now.getTime() - TRADE_EVENT_RETENTION_DAYS * 86400000;
  return pruneInWindows(
    async () => (await prisma.tradeEvent.findFirst({ where: { createdAt: { lt: new Date(cutoff) } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }))?.createdAt?.getTime() ?? null,
    before => prisma.tradeEvent.deleteMany({ where: { createdAt: { lt: new Date(before) } } }),
    cutoff, 86400000);
}
// Daily retention, first pass a minute after start. Never overlaps itself and
// never throws into the server; timers are unref'd so they cannot hold the process.
function startRetention(prisma, { intervalMs = 86400000, firstDelayMs = 60000, log = console } = {}) {
  let running = false;
  const runOnce = async (now = new Date()) => {
    if (running) return { skipped: true };
    running = true;
    try {
      const candles = await pruneMarketCandles(prisma, now);
      const events = await pruneTradeEvents(prisma, now);
      return { candles: candles.count, events: events.count };
    } catch (err) {
      log.error('[retention] prune failed:', err.message);
      return { error: err.message };
    } finally { running = false; }
  };
  const first = setTimeout(runOnce, firstDelayMs); first.unref?.();
  const timer = setInterval(runOnce, intervalMs); timer.unref?.();
  return { runOnce, stop: () => { clearTimeout(first); clearInterval(timer); } };
}
module.exports = { EVENT_TYPES, capBody, userRateLimit, eventData, candleData, uploadCandles, exportCandles, pruneMarketCandles, pruneTradeEvents, startRetention, isArchiveFull, archiveCapState, resetArchiveCap };
