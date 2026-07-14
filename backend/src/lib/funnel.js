// Funnel analytics — lightweight, opt-in, fire-and-forget event capture.
//
// Design guarantees (why this can ship inert & safe):
// - Dependency-injected prisma (matches lib/claimGuidance.js) so it is unit
//   testable without a DATABASE_URL.
// - Gated behind AppConfig key `funnel_analytics_enabled` (default OFF). Until
//   an operator flips it on (and creates the FunnelEvent table via Supabase
//   SQL), recordFunnelEvent is a pure no-op.
// - Writes are fire-and-forget and fully swallowed: analytics must NEVER throw
//   into, delay, or break a user-facing request.

const CACHE_TTL_MS = 60_000;
let cache = { enabled: false, at: 0 };

// Cached AppConfig lookup so we don't hit the DB on every event.
async function funnelEnabled(prisma) {
  const now = Date.now();
  if (now - cache.at < CACHE_TTL_MS) return cache.enabled;
  try {
    const row = await prisma.appConfig.findUnique({ where: { key: 'funnel_analytics_enabled' } });
    cache = { enabled: row?.value === 'true', at: now };
  } catch (err) {
    // If config can't be read, stay OFF — never let analytics assume enabled.
    cache = { enabled: false, at: now };
  }
  return cache.enabled;
}

// Fire-and-forget. Returns a promise (resolving to whether a row was written)
// for tests, but callers should NOT await it in request handlers.
function recordFunnelEvent(prisma, type, { userId = null, meta = null } = {}) {
  const p = (async () => {
    try {
      if (!prisma || !type) return false;
      if (!(await funnelEnabled(prisma))) return false;
      await prisma.funnelEvent.create({ data: { type: String(type), userId, meta } });
      return true;
    } catch (err) {
      // Swallow: a missing table or DB hiccup must not surface to the user.
      return false;
    }
  })();
  p.catch(() => {});
  return p;
}

// Admin read model: counts grouped by event type, newest-heaviest first.
async function getFunnelSummary(prisma, { since = null } = {}) {
  const where = since ? { createdAt: { gte: since } } : {};
  const grouped = await prisma.funnelEvent.groupBy({
    by: ['type'],
    where,
    _count: { _all: true },
  });
  return grouped
    .map((g) => ({ type: g.type, count: g._count._all }))
    .sort((a, b) => b.count - a.count);
}

function _resetCacheForTest() {
  cache = { enabled: false, at: 0 };
}

module.exports = { funnelEnabled, recordFunnelEvent, getFunnelSummary, _resetCacheForTest };
