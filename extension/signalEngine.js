// signalEngine.js — local rule engine (Mean Reversion v1)
// Runs in the content-script isolated world BEFORE content.js.
// Exposes globalThis.AvalisaSignalEngine.evaluateSignal(indicators, intensity).
// No network calls. No LLM tokens. Deterministic.

(function () {
  const THRESHOLDS = {
    low:  { rsiLow: 35, rsiHigh: 65, bbK: 1.5, rulesRequired: 1, skipOTC: false, useMomentum: false },
    mid:  { rsiLow: 30, rsiHigh: 70, bbK: 2.0, rulesRequired: 2, skipOTC: true,  useMomentum: false },
    high: { rsiLow: 20, rsiHigh: 80, bbK: 2.5, rulesRequired: 2, skipOTC: true,  useMomentum: true  },
  };

  function round4(x) {
    if (x == null || !Number.isFinite(x)) return null;
    return Math.round(x * 10000) / 10000;
  }

  function isOtcPair(pair) {
    if (!pair) return false;
    return /_otc|\botc\b/i.test(String(pair));
  }

  function evaluateSignal(indicators, intensity) {
    const th = THRESHOLDS[intensity] || THRESHOLDS.mid;
    const i = indicators || {};

    // Map existing buildIndicators() field names.
    const rsi = i.rsi14;
    const sma20 = i.sma20;
    const stdev20 = i.volatility;
    const price = i.price;
    const momentum = i.momentum5;
    const pair = i.pair;
    const isOTC = isOtcPair(pair);

    const baseSnapshot = {
      rsi: round4(rsi),
      sma20: round4(sma20),
      stdev20: round4(stdev20),
      price: round4(price),
      bbPos: null,
      momentum: round4(momentum),
      intensity: intensity || 'mid',
      rulesMatched: 0,
      action: 'SKIP',
    };

    // Guard: missing required inputs.
    if (
      !Number.isFinite(rsi) ||
      !Number.isFinite(sma20) ||
      !Number.isFinite(stdev20) ||
      !Number.isFinite(price)
    ) {
      return { action: 'SKIP', snapshot: baseSnapshot, reason: 'missing_indicators' };
    }

    // OTC filter.
    if (th.skipOTC && isOTC) {
      return { action: 'SKIP', snapshot: baseSnapshot, reason: 'otc_filter' };
    }

    const upperBB = sma20 + th.bbK * stdev20;
    const lowerBB = sma20 - th.bbK * stdev20;
    const bbPos = stdev20 > 0 ? (price - sma20) / stdev20 : 0;

    // CALL rules (bullish mean reversion).
    let callCount = 0;
    if (rsi < th.rsiLow) callCount++;
    if (price < lowerBB) callCount++;
    if (th.useMomentum && Number.isFinite(momentum) && momentum > 0) callCount++;

    // PUT rules (bearish mean reversion).
    let putCount = 0;
    if (rsi > th.rsiHigh) putCount++;
    if (price > upperBB) putCount++;
    if (th.useMomentum && Number.isFinite(momentum) && momentum < 0) putCount++;

    let action;
    let rulesMatched;
    let reason;
    if (callCount >= th.rulesRequired) {
      action = 'CALL';
      rulesMatched = callCount;
    } else if (putCount >= th.rulesRequired) {
      action = 'PUT';
      rulesMatched = putCount;
    } else {
      action = 'SKIP';
      rulesMatched = Math.max(callCount, putCount);
      reason = 'no_signal';
    }

    const snapshot = {
      ...baseSnapshot,
      bbPos: round4(bbPos),
      rulesMatched,
      action,
    };

    return reason ? { action, snapshot, reason } : { action, snapshot };
  }

  globalThis.AvalisaSignalEngine = { evaluateSignal };
})();
