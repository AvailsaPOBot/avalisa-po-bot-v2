/* Trading-only, best-effort telemetry. No caller waits for network work.
 * Bounded queues are memory-only: reloads/offline exhaustion can lose telemetry.
 *
 * 2.4.20 — the archive no longer rebuilds candles from raw socket traffic.
 * Measured live on 2026-09-12: that collected ZERO rows, because PO labels tick
 * and history frames with numeric stream ids (never the display pair), and the
 * old filter also insisted on period 30 while the bot trades M1 (period 60).
 * We now upload the buffer the bot itself built and already trades on
 * (state.candleBuffer[`${state.activePair}:${period}`]), which is the same data
 * the signal engine sees — no id guessing, and both periods are archived.
 */
const AvalisaTelemetry = (() => {
  const sentTimes = new Map();  // "pair:period" -> Set of uploaded candle times
  const nextPost = new Map();   // "pair:period" -> earliest next POST
  let pending = 0;
  let sessionId = null;
  let pausedUntil = 0; // set when the server reports archive_full
  const ARCHIVED_PERIODS = [30, 60];
  const version = () => chrome.runtime.getManifest().version;
  function post(path, payload) {
    if (!state.jwt || pending >= 120) return;
    // Freeze facts before retries; even a synchronous transport error stays detached.
    const body = JSON.parse(JSON.stringify(payload));
    pending++;
    Promise.resolve().then(() => withRetry(() => apiPost(path, body)))
      .catch(() => {}).finally(() => { pending--; });
  }
  function event(type, reason = null, extra = {}) {
    try {
      post('/api/trades/event', {
        type, reason, pair: getCurrentPair(), amount: state.currentAmount,
        step: state.martingaleStep || 0, extVersion: version(),
        at: new Date().toISOString(), sessionId, ...extra,
      });
      if (type === 'pause') session('session_stop');
    } catch (_) {}
  }
  function session(type) {
    if (type === 'session_start') sessionId = globalThis.crypto?.randomUUID?.() || String(Date.now());
    const id = sessionId;
    const demo = isDemoMode();
    const facts = { pair: getCurrentPair(), amount: state.currentAmount, step: state.martingaleStep || 0, at: new Date().toISOString() };
    // Read balance asynchronously, never make Start/Stop wait for DOM or network.
    Promise.resolve().then(() => getBalance()).then(balance => {
      event(type, null, { ...facts, sessionId: id, isDemo: demo, balance });
    }).catch(() => event(type, 'balance_unavailable', { ...facts, sessionId: id, isDemo: demo }));
  }
  function market(pair) {
    const intensity = state.settings?.intensity || state.settings?.aiIntensity || 'mid';
    const periodSec = state.activePeriod || 30;
    const candles = state.candleBuffer?.[`${pair}:${periodSec}`] || [];
    const empty = { pair, periodSec, intensity, rsi: null, sma20: null, stdev: null,
      volatility: null, slope: null, momentum: null, regime: 'unknown',
      rulesMatched: { call: null, put: null }, lastCandle: null,
      candleCount: candles.length, action: 'SKIP', reason: 'missing_indicators' };
    try {
      const indicators = buildIndicators(candles, pair, `${periodSec}s`);
      const evaluation = AvalisaSignalEngine.evaluateSignal(indicators || {}, intensity);
      const snapshot = evaluation.snapshot || {};
      return { ...empty, rsi: indicators?.rsi14 ?? null, sma20: indicators?.sma20 ?? null,
        stdev: indicators?.volatility ?? null, volatility: indicators?.volatility ?? null,
        slope: indicators?.slope10 ?? null, momentum: indicators?.momentum5 ?? null,
        regime: snapshot.regime || 'unknown', lastCandle: indicators?.lastCandle ?? null,
        rulesMatched: { call: snapshot.callCount ?? null, put: snapshot.putCount ?? null },
        action: evaluation.action, reason: evaluation.reason || null };
    } catch (_) { return empty; }
  }
  function po() {
    const dealId = state.currentDealId;
    if (!dealId) return {};
    const facts = { dealId };
    // Only copy allowed fields from the exact attributed deal, never whole socket payloads.
    for (const ev of [...(state.recentOpenEvents || []), ...(state.recentCloseEvents || [])]) {
      if (!/^success(open|close)Order$/i.test(ev.event)) continue;
      const deals = Array.isArray(ev.payload?.deals) ? ev.payload.deals
        : Array.isArray(ev.payload) ? ev.payload : [ev.payload];
      for (const deal of deals) {
        if (deal?.id !== dealId) continue;
        for (const key of ['openPrice', 'closePrice', 'openTime', 'closeTime', 'profit', 'isDemo']) {
          if (deal[key] !== undefined) facts[key] = deal[key];
        }
        const payout = deal.payoutPct ?? deal.payout ?? deal.percentProfit;
        if (payout !== undefined) facts.payoutPct = payout;
      }
    }
    return facts;
  }
  // Keep memory flat: remember only enough uploaded times to dedupe a long session.
  function remember(key, times) {
    const seen = sentTimes.get(key) || new Set();
    for (const t of times) seen.add(t);
    if (seen.size > 2000) for (const t of [...seen].sort((a, b) => a - b).slice(0, seen.size - 2000)) seen.delete(t);
    sentTimes.set(key, seen);
    if (sentTimes.size > 20) sentTimes.delete(sentTimes.keys().next().value);
    if (nextPost.size > 20) nextPost.delete(nextPost.keys().next().value);
  }
  function uploadBuffer(pair, period) {
    const key = `${pair}:${period}`;
    if (Date.now() < (nextPost.get(key) || 0)) return;
    const seen = sentTimes.get(key) || new Set();
    const buffer = state.candleBuffer?.[key] || [];
    // "Closed" is decided by PO's own series, never by this machine's clock.
    // Measured live 2026-09-12: PO stamps candles ~2h ahead of local time, so a
    // wall-clock test marked every candle as still open and archived nothing.
    // The newest candle in the buffer is the forming one; everything before it is done.
    const newest = buffer.reduce((max, c) => (c && Number.isFinite(c.time) && c.time > max ? c.time : max), -Infinity);
    const candles = buffer
      .filter(c => c && Number.isFinite(c.time) && c.time % period === 0 && c.time < newest
        && !seen.has(c.time) && [c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0))
      .sort((a, b) => a.time - b.time).slice(-500)
      .map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
    if (!candles.length) return;
    // Reserve the interval before dispatch, including failed requests: never
    // faster than one POST per pair+period per 5 minutes.
    nextPost.set(key, Date.now() + 300000);
    Promise.resolve().then(() => apiPost('/api/market/candles', { pair, periodSec: period, candles }))
      .then(res => {
        remember(key, candles.map(c => c.time));
        // Server archive is full: treat as delivered and stop all uploads for 1h.
        if (res && res.accepted === false && res.reason === 'archive_full') pausedUntil = Date.now() + 3600000;
      })
      .catch(() => {});
  }
  // Archive only while the bot runs, and only the pair it is actually trading
  // (state.activePair is the pair its own buffers belong to).
  function snapshot() {
    try {
      if (!state.running || !state.jwt || Date.now() < pausedUntil) return;
      const pair = state.activePair;
      if (!pair || pair === 'UNKNOWN') return;
      for (const period of ARCHIVED_PERIODS) {
        if (period === 30 || period === state.activePeriod) uploadBuffer(pair, period);
      }
    } catch (_) {}
  }
  // Socket entry points stay so content.js keeps its call sites; each one just
  // nudges the throttled snapshot rather than parsing PO's stream itself.
  return { post, event, session, market, po, snapshot, tick: snapshot, history: snapshot, candle: snapshot, frame: snapshot };
})();
