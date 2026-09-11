// Bounded, explicitly whitelisted execution telemetry; never used for AI allowance.
function sanitizeTradeMeta(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  if (typeof input.payoutPct === 'number' && Number.isFinite(input.payoutPct) && input.payoutPct >= 0 && input.payoutPct <= 100) out.payoutPct = input.payoutPct;
  if (Number.isSafeInteger(input.martingaleStep) && input.martingaleStep >= 0) out.martingaleStep = input.martingaleStep;
  if (typeof input.extVersion === 'string' && /^[0-9A-Za-z.+_-]{1,64}$/.test(input.extVersion)) out.extVersion = input.extVersion;
  if (['ws', 'balance', 'dom-late', 'unknown', 'other'].includes(input.resultMethod)) out.resultMethod = input.resultMethod;
  if (['current', 'favorite', null].includes(input.source)) out.source = input.source;
  if (['low', 'mid', 'high', null].includes(input.intensity)) out.intensity = input.intensity;
  for (const key of ['expirySeconds', 'entryDelayMs', 'timeToResultMs']) {
    if (Number.isFinite(input[key]) && input[key] >= 0 && input[key] <= 86400000) out[key] = input[key];
  }
  if (input.market && typeof input.market === 'object') {
    const m = input.market, market = {};
    if (typeof m.pair === 'string' && /^[A-Za-z0-9_. /-]{1,80}$/.test(m.pair)) market.pair = m.pair;
    if (Number.isSafeInteger(m.periodSec) && m.periodSec > 0 && m.periodSec <= 3600) market.periodSec = m.periodSec;
    if (['low', 'mid', 'high'].includes(m.intensity)) market.intensity = m.intensity;
    if (typeof m.reason === 'string' && /^[a-zA-Z0-9_:-]{1,80}$/.test(m.reason)) market.reason = m.reason;
    for (const key of ['rsi', 'sma20', 'stdev', 'volatility', 'slope', 'momentum', 'candleCount']) {
      if (m[key] === null || (typeof m[key] === 'number' && Number.isFinite(m[key]))) market[key] = m[key];
    }
    if (['trending', 'ranging', 'unknown', null].includes(m.regime)) market.regime = m.regime;
    if (['CALL', 'PUT', 'SKIP'].includes(m.action)) market.action = m.action;
    if (['green', 'red', 'doji', null].includes(m.lastCandle)) market.lastCandle = m.lastCandle;
    if (m.rulesMatched && typeof m.rulesMatched === 'object') {
      market.rulesMatched = {};
      for (const side of ['call', 'put']) if (m.rulesMatched[side] === null || Number.isInteger(m.rulesMatched[side]) && m.rulesMatched[side] >= 0 && m.rulesMatched[side] <= 4) market.rulesMatched[side] = m.rulesMatched[side];
    }
    if (Object.keys(market).length) out.market = market;
  }
  if (input.po && typeof input.po === 'object') {
    const po = {};
    if (typeof input.po.dealId === 'string' && input.po.dealId.length <= 128) po.dealId = input.po.dealId;
    if (Number.isSafeInteger(input.po.dealId)) po.dealId = input.po.dealId;
    for (const key of ['openPrice', 'closePrice', 'openTime', 'closeTime', 'payoutPct', 'profit']) if (typeof input.po[key] === 'number' && Number.isFinite(input.po[key])) po[key] = input.po[key];
    for (const key of ['openTime', 'closeTime']) {
      if (typeof input.po[key] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(input.po[key]) && Number.isFinite(Date.parse(input.po[key]))) po[key] = new Date(input.po[key]).toISOString();
    }
    if (typeof input.po.isDemo === 'boolean') po.isDemo = input.po.isDemo;
    else if (input.po.isDemo === 0 || input.po.isDemo === 1) po.isDemo = input.po.isDemo === 1;
    if (Object.keys(po).length) out.po = po;
  }
  return Object.keys(out).length && Buffer.byteLength(JSON.stringify(out)) <= 4096 ? out : null;
}
module.exports = { sanitizeTradeMeta };
