// Output is at most 512 UTF-8 bytes; unknown keys and invalid values are discarded.
function sanitizeTradeMeta(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  if (typeof input.payoutPct === 'number' && Number.isFinite(input.payoutPct) && input.payoutPct >= 0 && input.payoutPct <= 100) out.payoutPct = input.payoutPct;
  if (Number.isSafeInteger(input.martingaleStep) && input.martingaleStep >= 0) out.martingaleStep = input.martingaleStep;
  if (typeof input.extVersion === 'string' && /^[0-9A-Za-z.+_-]{1,64}$/.test(input.extVersion)) out.extVersion = input.extVersion;
  if (['ws', 'balance', 'dom-late', 'unknown', 'other'].includes(input.resultMethod)) out.resultMethod = input.resultMethod;
  if (['current', 'favorite', null].includes(input.source)) out.source = input.source;
  if (['low', 'mid', 'high', null].includes(input.intensity)) out.intensity = input.intensity;
  return Object.keys(out).length && Buffer.byteLength(JSON.stringify(out)) <= 512 ? out : null;
}
module.exports = { sanitizeTradeMeta };
