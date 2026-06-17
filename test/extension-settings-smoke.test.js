const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../dashboard/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><head></head><body><div class="js-balance-real">$100.00</div></body></html>', {
  url: 'https://pocketoption.com/en/cabinet/',
  runScripts: 'outside-only',
});

const storageData = {};
const sentMessages = [];

dom.window.chrome = {
  runtime: {
    getURL: file => `chrome-extension://avalisa/${file}`,
    getManifest: () => JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8')),
    sendMessage: msg => sentMessages.push(msg),
    onMessage: { addListener() {} },
  },
  storage: {
    local: {
      get(keys, callback) {
        if (Array.isArray(keys)) {
          callback(Object.fromEntries(keys.map(k => [k, storageData[k]])));
          return;
        }
        if (typeof keys === 'string') {
          callback({ [keys]: storageData[keys] });
          return;
        }
        callback({ ...keys, ...storageData });
      },
      set(values, callback) {
        Object.assign(storageData, values);
        if (callback) callback();
      },
    },
    onChanged: { addListener() {} },
  },
};
dom.window.fetch = async () => ({ ok: true, json: async () => ({}) });
dom.window.console = console;
dom.window.open = () => {};
dom.window.setTimeout = setTimeout;
dom.window.clearTimeout = clearTimeout;
dom.window.setInterval = () => 0;
dom.window.clearInterval = () => {};
dom.window.window = dom.window;
dom.window.globalThis = dom.window;
dom.window.assert = assert;
dom.window.__storageData = storageData;

const scripts = [
  'config.js',
  'signalEngine.js',
  'state.js',
  'apiClient.js',
  'storage.js',
  'indicators.js',
  'poDom.js',
  'tradeResult.js',
  'overlayView.js',
  'claimFlow.js',
  'content.js',
];
const extensionBundle = scripts
  .map(file => `${fs.readFileSync(path.join(root, 'extension', file), 'utf8')}\n//# sourceURL=${file}`)
  .join('\n');

const testPromise = dom.window.eval(`${extensionBundle}

(async () => {
    state.settings = getDefaultSettings();
    state.licenseInfo = { allowed: true, plan: 'basic', aiTradesAllowance: 10, aiTradesUsed: 0 };
    state.jwt = 'test-token';
    injectOverlay();

  assert.equal(document.getElementById('av-strategy').value, 'martingale');
  assert.equal(document.getElementById('av-row-direction').style.display, 'flex');
  assert.equal(document.getElementById('av-row-timeframe').style.display, 'flex');
  assert.equal(document.getElementById('av-row-intensity').style.display, 'none');
  assert.equal(document.getElementById('av-row-ai-pair-mode').style.display, 'none');

  document.getElementById('av-strategy').value = 'ai';
  document.getElementById('av-strategy').dispatchEvent(new Event('change'));
  assert.equal(document.getElementById('av-row-direction').style.display, 'none');
  assert.equal(document.getElementById('av-row-timeframe').style.display, 'none');
  assert.equal(document.getElementById('av-row-intensity').style.display, 'flex');
  assert.equal(document.getElementById('av-row-ai-pair-mode').style.display, 'flex');
  assert.equal(__storageData.settings.strategy, 'ai');

  document.getElementById('av-intensity').value = 'high';
  document.getElementById('av-ai-pair-mode').value = 'current';
  document.getElementById('av-start-amount').value = '5';
  document.getElementById('av-multiplier').value = '2.4';
  await saveCurrentSettings();
  assert.equal(__storageData.settings.intensity, 'high');
  assert.equal(__storageData.settings.aiPairMode, 'current');
  assert.equal(__storageData.settings.startAmount, 5);
  assert.equal(__storageData.settings.martingaleMultiplier, 2.4);

  document.getElementById('av-payout-enabled').checked = false;
  document.getElementById('av-payout-enabled').dispatchEvent(new Event('change'));
  assert.equal(__storageData.payoutAction, 'off');
  assert.equal(document.getElementById('av-payout-min').disabled, true);
  assert.equal(document.getElementById('av-payout-action').disabled, true);

  document.getElementById('av-payout-enabled').checked = true;
  document.getElementById('av-payout-action').value = 'stop';
  document.getElementById('av-payout-action').dispatchEvent(new Event('change'));
  assert.equal(__storageData.payoutAction, 'stop');
  assert.equal(document.getElementById('av-payout-min').disabled, false);

  state.settings.strategy = 'ai';
  document.body.innerHTML = '<div id="avalisa-overlay"></div><div class="js-balance-real">$100.00</div>';
  const realBlock = getAiAllowanceBlock({ allowed: true, plan: 'basic', aiTradesAllowance: 10, aiTradesUsed: 10 });
  assert.equal(realBlock.reason, 'AI trade allowance exhausted');

  document.body.innerHTML = '<div id="avalisa-overlay"></div><div class="balance__label">Demo</div><div class="js-balance-demo">$10000.00</div>';
  const demoBlock = getAiAllowanceBlock({ allowed: true, plan: 'basic', aiTradesAllowance: 10, aiTradesUsed: 10 });
  assert.equal(demoBlock, null);

  state.settings = {
    ...getDefaultSettings(),
    startAmount: 1,
    martingaleMultiplier: 2,
    martingaleSteps: '3',
  };
  state.currentAmount = 1;
  state.martingaleStep = 0;
  applyMartingaleLogic('loss');
  assert.equal(state.currentAmount, 2);
  assert.equal(state.martingaleStep, 1);
  applyMartingaleLogic('tie');
  assert.equal(state.currentAmount, 2);
  assert.equal(state.martingaleStep, 1);
  applyMartingaleLogic('unknown');
  assert.equal(state.currentAmount, 2);
  assert.equal(state.martingaleStep, 1);
  applyMartingaleLogic('win');
  assert.equal(state.currentAmount, 1);
  assert.equal(state.martingaleStep, 0);

  document.body.innerHTML = '<div class="block--bet-amount"><div class="value__val"><input value="8"></div></div>';
  assert.equal(setTradeAmount(16), true);
  assert.equal(document.querySelector('.block--bet-amount input').value, '16.00');

  document.body.innerHTML = '<div class="asset-select"><span class="asset__name">EUR/USD OTC</span></div><div class="block--bet-amount"><div class="value__val"><input value="8"></div></div><button class="btn btn-call">CALL</button><button class="btn btn-put">PUT</button>';
  const healthyLayout = assessPOLayoutHealth();
  assert.equal(healthyLayout.ok, true);
  assert.equal(healthyLayout.message, 'PO layout ready');
  assert.equal(healthyLayout.controls.amountSelector, '.block--bet-amount .value__val input');
  assert.equal(healthyLayout.controls.hasCallButton, true);
  assert.equal(healthyLayout.controls.hasPutButton, true);

  document.body.innerHTML = '<div class="asset-select"><span class="asset__name">EUR/USD OTC</span></div><div class="block--bet-amount"><div class="value__val"><input value="8"></div></div><button class="btn btn-call">CALL</button>';
  const missingPutLayout = assessPOLayoutHealth();
  assert.equal(missingPutLayout.ok, false);
  assert.match(missingPutLayout.message, /missing PUT button/);

  document.body.innerHTML = '';
  injectOverlay();
  state.running = true;
  updateUI();
  assert.equal(document.getElementById('av-start-btn').disabled, true);
  assert.equal(document.getElementById('av-stop-btn').disabled, false);
  assert.equal(document.getElementById('av-strategy').disabled, true);

  console.log('Extension settings smoke passed.');
})().catch(err => {
  console.error(err);
  window.__testFailure = err;
});
`);

Promise.resolve(testPromise).then(() => {
  if (dom.window.__testFailure) throw dom.window.__testFailure;
}).catch(err => {
  console.error(err);
  process.exit(1);
});
