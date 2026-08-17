/**
 * Integration proof for the 2.4.9 Avalisa AI fix.
 *
 * Feeds a REAL Pocket Option history frame (captured live from
 * demo-api-eu.po.market on 2026-08-17, AUDCAD_otc @ 30s, 1558 ticks / 750s)
 * through the extension's own ingest path, then asserts the AI scanner reaches
 * a tradable state at EVERY intensity — including Mid and High, which on 2.4.8
 * could never clear their candle gates and so never placed a single trade.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../dashboard/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/po-history-30s.json'), 'utf8'));

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://po.trade/en/cabinet/demo-quick-high-low/',
  runScripts: 'outside-only',
});
const storageData = {};
dom.window.chrome = {
  runtime: {
    getURL: f => `chrome-extension://avalisa/${f}`,
    getManifest: () => JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8')),
    sendMessage: () => {},
    onMessage: { addListener() {} },
  },
  storage: {
    local: {
      get(keys, cb) {
        if (Array.isArray(keys)) return cb(Object.fromEntries(keys.map(k => [k, storageData[k]])));
        if (typeof keys === 'string') return cb({ [keys]: storageData[keys] });
        cb({ ...keys, ...storageData });
      },
      set(v, cb) { Object.assign(storageData, v); if (cb) cb(); },
      remove(keys, cb) { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete storageData[k]); if (cb) cb(); },
    },
    onChanged: { addListener() {} },
  },
};
dom.window.fetch = async () => ({ ok: true, json: async () => ({}) });
dom.window.console = console;
dom.window.setTimeout = setTimeout;
dom.window.clearTimeout = clearTimeout;
dom.window.setInterval = () => 0;
dom.window.clearInterval = () => {};
dom.window.window = dom.window;
dom.window.globalThis = dom.window;
dom.window.assert = assert;
dom.window.__fixture = fixture;

const scripts = ['config.js', 'signalEngine.js', 'state.js', 'apiClient.js', 'storage.js',
  'indicators.js', 'poDom.js', 'tradeResult.js', 'overlayView.js', 'claimFlow.js', 'content.js'];
const bundle = scripts
  .map(f => `${fs.readFileSync(path.join(root, 'extension', f), 'utf8')}\n//# sourceURL=${f}`)
  .join('\n');

const run = dom.window.eval(`${bundle}

(async () => {
  await new Promise(r => setTimeout(r, 2600));
  state.settings = getDefaultSettings();
  state.settings.strategy = 'ai';

  // The analysis period must be pinned to something PO can actually fill.
  assert.equal(AI_ANALYSIS_PERIOD_SEC, 30, 'AI analysis period should be 30s');

  // Replay the captured frame exactly as injected.js would deliver it.
  window.dispatchEvent(new window.MessageEvent('message', {
    source: window,
    data: { type: 'AVALISA_WS_HISTORY', data: JSON.stringify(__fixture) },
  }));
  await new Promise(r => setTimeout(r, 300));

  const candles = getBufferedCandles();
  assert.equal(state.activePair, __fixture.asset, 'active pair should follow the history frame');
  assert.equal(state.activePeriod, 30, 'active period should be the 30s analysis period');
  assert.ok(candles.length >= 20,
    'a real 30s PO seed should yield >= 20 candles, got ' + candles.length);

  // The actual regression: every intensity must clear its gate and produce a
  // usable signal decision rather than stalling on "loading_N_M" forever.
  const results = {};
  for (const intensity of ['low', 'mid', 'high']) {
    const required = getRequiredCandles(intensity);
    assert.ok(candles.length >= required,
      intensity + ' needs ' + required + ' candles but the real seed only gave ' + candles.length);

    const r = evaluateAvalisaCurrentPair(intensity, 92, 'current');
    assert.ok(!/^loading_/.test(r.reason),
      intensity + ' still stalled on ' + r.reason + ' — this is the 2.4.8 bug');
    assert.equal(r.asset, __fixture.asset, intensity + ' result must identify the pair (was pair=undefined)');
    assert.ok(['CALL', 'PUT', 'SKIP'].includes(r.action), 'unexpected action ' + r.action);
    results[intensity] = r.action + '/' + r.reason + ' (' + r.candleCount + ' candles)';
  }

  console.log('  real PO seed ->', candles.length, 'candles @', state.activePeriod + 's');
  for (const [k, v] of Object.entries(results)) console.log('  ' + k.padEnd(5), v);
  return true;
})()`);

run.then(() => console.log('Extension AI readiness (real PO data) passed.'))
  .catch(err => { console.error(err); process.exit(1); });
