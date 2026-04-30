// signalEngine.js — Regime-Adaptive Hybrid Strategy v2
// Runs in the content-script isolated world BEFORE content.js.
// Exposes globalThis.AvalisaSignalEngine.evaluateSignal(indicators, intensity).
// No network calls. No LLM tokens. Deterministic.

(function () {
  // Per-intensity thresholds. Tune from observed live trade data later.
  const THRESHOLDS = {
    low: {
      minConfidence: 35,
      // Regime classification
      regimeSlopeThreshold: 0.4,   // slope/stdev ratio above this = trending
      // Volatility → timeframe
      volLowThreshold: 0.0004,     // stdev/price below this = use M3
      volHighThreshold: 0.0030,    // above this = SKIP (chaos)
      // Mean reversion
      rsiLow: 35, rsiHigh: 65, bbK: 1.5,
      // Low is the active/testing mode: trade when one strong mean-reversion
      // condition appears, matching the older Avalisa behavior that placed trades.
      rulesRequiredRanging: 1,
      // Trend pullback
      pullbackRsiLow: 40, pullbackRsiHigh: 60,
      pullbackBbK: 0.7,            // price within ±0.7σ of SMA20 = pullback zone
      rulesRequiredTrending: 2,
      // Filters
      skipOTC: false,
      requireCandleConfirm: false, // last candle aligns with direction
    },
    mid: {
      minConfidence: 68,
      regimeSlopeThreshold: 0.3,
      volLowThreshold: 0.0005,
      volHighThreshold: 0.0025,
      rsiLow: 30, rsiHigh: 70, bbK: 2.0,
      rulesRequiredRanging: 2,
      pullbackRsiLow: 40, pullbackRsiHigh: 60,
      pullbackBbK: 0.6,
      rulesRequiredTrending: 3,
      skipOTC: true,
      requireCandleConfirm: true,
    },
    high: {
      minConfidence: 95,
      regimeSlopeThreshold: 0.25,
      volLowThreshold: 0.0006,
      volHighThreshold: 0.0020,
      rsiLow: 25, rsiHigh: 75, bbK: 2.5,
      rulesRequiredRanging: 4,
      pullbackRsiLow: 42, pullbackRsiHigh: 58,
      pullbackBbK: 0.5,
      rulesRequiredTrending: 4,
      skipOTC: true,
      requireCandleConfirm: true,
    },
  };

  function round4(x) {
    if (x == null || !Number.isFinite(x)) return null;
    return Math.round(x * 10000) / 10000;
  }

  function isOtcPair(pair) {
    if (!pair) return false;
    return /_otc|\botc\b/i.test(String(pair));
  }

  // Returns 'S30' | 'M1' | 'M3' | 'M5' | null (null = SKIP for vol).
  // Intensity maps to how much expiry breathing room Avalisa wants.
  function pickTimeframe(volRatio, th, intensity) {
    if (!Number.isFinite(volRatio)) {
      if (intensity === 'high') return 'M3';
      if (intensity === 'mid') return 'M1';
      return 'S30';
    }
    if (volRatio > th.volHighThreshold) return null; // chaos → SKIP
    if (intensity === 'high') return volRatio < th.volLowThreshold ? 'M5' : 'M3';
    if (intensity === 'mid') return volRatio < th.volLowThreshold ? 'M3' : 'M1';
    return volRatio < th.volLowThreshold ? 'M1' : 'S30';
  }

  function classifyRegime(slopeScore, th) {
    if (!Number.isFinite(slopeScore)) return 'unknown';
    return Math.abs(slopeScore) >= th.regimeSlopeThreshold ? 'trending' : 'ranging';
  }

  function evaluateSignal(indicators, intensity) {
    const th = THRESHOLDS[intensity] || THRESHOLDS.mid;
    const i = indicators || {};

    const rsi = i.rsi14;
    const sma20 = i.sma20;
    const stdev20 = i.volatility;
    const price = i.price;
    const momentum = i.momentum5;
    const slope10 = i.slope10;          // SMA20 slope over last 10 candles
    const lastCandle = i.lastCandle;    // 'green' | 'red' | null
    const pair = i.pair;
    const isOTC = isOtcPair(pair);

    // Volatility ratio = stdev / price
    const volRatio = (Number.isFinite(stdev20) && Number.isFinite(price) && price > 0)
      ? stdev20 / price : null;

    // Slope score = slope10 normalized by stdev
    const slopeScore = (Number.isFinite(slope10) && Number.isFinite(stdev20) && stdev20 > 0)
      ? slope10 / stdev20 : null;

    const regime = classifyRegime(slopeScore, th);
    const intensityName = THRESHOLDS[intensity] ? intensity : 'mid';
    const tfPick = pickTimeframe(volRatio, th, intensityName);

    const baseSnapshot = {
      rsi: round4(rsi),
      sma20: round4(sma20),
      stdev20: round4(stdev20),
      price: round4(price),
      momentum: round4(momentum),
      slope10: round4(slope10),
      slopeScore: round4(slopeScore),
      volRatio: round4(volRatio),
      regime,
      lastCandle: lastCandle || null,
      bbPos: null,
      intensity: intensityName,
      rulesMatched: 0,
      confidence: 0,
      action: 'SKIP',
      timeframe: tfPick || 'M1',
    };

    // Guard: missing indicators
    if (!Number.isFinite(rsi) || !Number.isFinite(sma20) ||
        !Number.isFinite(stdev20) || !Number.isFinite(price)) {
      return { action: 'SKIP', snapshot: baseSnapshot, reason: 'missing_indicators' };
    }

    // OTC filter
    if (th.skipOTC && isOTC) {
      return { action: 'SKIP', snapshot: baseSnapshot, reason: 'otc_filter' };
    }

    // Volatility chaos filter
    if (tfPick === null) {
      return { action: 'SKIP', snapshot: baseSnapshot, reason: 'vol_too_high' };
    }

    // Need slope to classify regime; if missing, fall back to ranging
    if (regime === 'unknown') {
      // proceed as ranging — safer default
    }

    const upperBB = sma20 + th.bbK * stdev20;
    const lowerBB = sma20 - th.bbK * stdev20;
    const bbPos = stdev20 > 0 ? (price - sma20) / stdev20 : 0;
    const pullbackUpper = sma20 + th.pullbackBbK * stdev20;
    const pullbackLower = sma20 - th.pullbackBbK * stdev20;

    let callCount = 0;
    let putCount = 0;
    const strategy = regime === 'trending' ? 'trend-follow' : 'mean-revert';

    if (regime === 'trending' && Number.isFinite(slope10)) {
      // TREND-FOLLOWING: enter on pullback in direction of trend
      const isUptrend = slope10 > 0;
      const isDowntrend = slope10 < 0;

      if (isUptrend) {
        // CALL setup: uptrend + price pulled back near SMA + RSI in pullback zone
        if (slope10 > 0) callCount++;                                             // 1: trend up
        if (price >= pullbackLower && price <= sma20) callCount++;               // 2: price pulled back below SMA
        if (rsi >= th.pullbackRsiLow && rsi <= th.pullbackRsiHigh) callCount++;  // 3: RSI in mid zone
        if (th.requireCandleConfirm) {
          if (lastCandle === 'green') callCount++;                                // 4: reversal candle
        } else {
          if (Number.isFinite(momentum) && momentum > 0) callCount++;            // 4: momentum turning up
        }
      } else if (isDowntrend) {
        if (slope10 < 0) putCount++;
        if (price <= pullbackUpper && price >= sma20) putCount++;
        if (rsi >= th.pullbackRsiLow && rsi <= th.pullbackRsiHigh) putCount++;
        if (th.requireCandleConfirm) {
          if (lastCandle === 'red') putCount++;
        } else {
          if (Number.isFinite(momentum) && momentum < 0) putCount++;
        }
      }
    } else {
      // MEAN REVERSION: existing logic, refined with candle confirm
      // CALL: oversold reversal
      if (rsi < th.rsiLow) callCount++;
      if (price < lowerBB) callCount++;
      if (Number.isFinite(momentum) && momentum > 0) callCount++;
      if (th.requireCandleConfirm) {
        if (lastCandle === 'green') callCount++;
      }
      // PUT: overbought reversal
      if (rsi > th.rsiHigh) putCount++;
      if (price > upperBB) putCount++;
      if (Number.isFinite(momentum) && momentum < 0) putCount++;
      if (th.requireCandleConfirm) {
        if (lastCandle === 'red') putCount++;
      }
    }

    const required = regime === 'trending' ? th.rulesRequiredTrending : th.rulesRequiredRanging;

    let action = 'SKIP';
    let rulesMatched = Math.max(callCount, putCount);
    let confidence = 0;
    let reason;

    // Conflict guard: skip only when both sides are equally strong. Low
    // intensity can require just one rule, so a single weak opposite hint must
    // not cancel a stronger Avalisa signal.
    if (callCount >= required && putCount >= required && callCount === putCount) {
      reason = 'conflicting_signals';
    } else if (callCount >= required && callCount > putCount) {
      action = 'CALL';
      rulesMatched = callCount;
    } else if (putCount >= required && putCount > callCount) {
      action = 'PUT';
      rulesMatched = putCount;
    } else {
      reason = 'no_signal';
    }

    if (action !== 'SKIP') {
      confidence = Math.min(100, Math.round((rulesMatched / Math.max(required, 1)) * th.minConfidence));
      if (confidence < th.minConfidence) {
        action = 'SKIP';
        reason = 'low_confidence';
      }
    }

    const snapshot = {
      ...baseSnapshot,
      bbPos: round4(bbPos),
      strategy,
      rulesMatched,
      confidence,
      minConfidence: th.minConfidence,
      callCount,
      putCount,
      action,
      timeframe: tfPick,
    };

    return reason ? { action, snapshot, reason, timeframe: tfPick }
                  : { action, snapshot, timeframe: tfPick };
  }

  globalThis.AvalisaSignalEngine = { evaluateSignal };
})();
