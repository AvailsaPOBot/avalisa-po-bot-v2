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
      remove(keys, callback) {
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach(key => delete storageData[key]);
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
    // content.js schedules restoreRuntimeSession() at +2.5s after load (reload
    // recovery). Let it fire on empty storage first so it cannot collide with
    // sessions this test persists mid-run.
    await new Promise(resolve => setTimeout(resolve, 2600));

    state.settings = getDefaultSettings();
    state.licenseInfo = { allowed: true, plan: 'basic', aiTradesAllowance: 10, aiTradesUsed: 0 };
    state.jwt = 'test-token';
    injectOverlay();

  assert.equal(document.getElementById('av-strategy').value, 'martingale');
  // Read the expected build from the manifest rather than hardcoding it — this
  // assertion silently turned every routine version bump into a smoke-test
  // failure, which the AGE dispatcher treats as fail-closed.
  assert.equal(
    document.getElementById('av-build-badge').textContent,
    'v' + chrome.runtime.getManifest().version,
  );
  assert.equal(PO_SELECTORS.tradeButtons.call[0], 'a.btn.btn-call');
  assert.equal(PO_SELECTORS.tradeButtons.put[0], 'a.btn.btn-put');
  assert.equal(PO_SELECTORS.balance.demo.includes('.js-balance-demo'), true);
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

  document.body.innerHTML = '';
  injectOverlay();
  showLimitReachedMessage({ reason: 'Limit reached' });
  assert.equal(document.getElementById('av-limit-msg').style.display, 'block');
  state.licenseInfo = { allowed: true, plan: 'lifetime' };
  updateUI();
  assert.equal(document.getElementById('av-limit-msg').style.display, 'none');

  document.body.innerHTML = '<div>QT Demo</div><div>USD</div><div>$50,000</div><div>TOP UP</div>';
  assert.equal(isDemoMode(), true);
  assert.equal(await getBalance(), 50000);

  document.body.innerHTML = '<div style="display:none" class="js-balance-demo">$544.84</div><div>QT Demo</div><div>USD</div><div>$32.84</div><div>TOP UP</div><div>Status: Recovery paused — $1024.00 is above balance $544.84.</div>';
  assert.equal(isDemoMode(), true);
  assert.equal(await getBalance(), 32.84);

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
  assert.equal(healthyLayout.controls.amountSelector, PO_SELECTORS.tradeAmount[0]);
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

  state.settings = getDefaultSettings();
  state.running = true;
  state.stopRequested = false;
  state.cycleGeneration = 150;
  state.currentAmount = 6400;
  state.martingaleStep = 6;
  state.tradesCount = 33;
  state.lastDirection = 'put';
  state.amountSetFailures = 2;
  state.recoveryReloads = 1;
  await persistRuntimeSession('amount_retry');
  assert.equal(__storageData.avalisaRuntimeSession.currentAmount, 6400);
  state.running = false;
  state.currentAmount = 1;
  state.martingaleStep = 0;
  state.tradesCount = 0;
  state.lastDirection = null;
  state.amountSetFailures = 0;
  state.recoveryReloads = 0;
  assert.equal(await restoreRuntimeSession(), true);
  assert.equal(state.running, true);
  assert.equal(state.currentAmount, 6400);
  assert.equal(state.martingaleStep, 6);
  assert.equal(state.tradesCount, 33);
  assert.equal(state.lastDirection, 'put');
  assert.equal(state.amountSetFailures, 2);
  assert.equal(state.recoveryReloads, 1);
  stopBot();
  assert.equal(__storageData.avalisaRuntimeSession, undefined);

  document.body.innerHTML = '<div>QT Demo</div><div>USD</div><div>$499.28</div><div>TOP UP</div>';
  injectOverlay();
  state.settings = getDefaultSettings();
  state.running = true;
  state.stopRequested = false;
  state.cycleGeneration = 300;
  state.currentAmount = 640;
  state.martingaleStep = 6;
  state.amountSetFailures = 2;
  state.recoveryReloads = 2;
  await persistRuntimeSession('amount_retry');
  await retryAfterAmountSetFailure(300, 640);
  assert.equal(state.running, false);
  assert.equal(state.stopRequested, true);
  assert.equal(state.amountSetFailures, 0);
  assert.equal(state.recoveryReloads, 0);
  assert.equal(state.lastTradeCycleError.phase, 'amount_above_balance');
  assert.equal(__storageData.avalisaRuntimeSession, undefined);
  assert.match(document.getElementById('av-status').textContent, /above balance \\$499\\.28/);
  // v2.4.8: the pause preserves the mid-recovery ladder for the next Start
  assert.equal(__storageData.avalisaPausedLadder.currentAmount, 640);
  assert.equal(__storageData.avalisaPausedLadder.martingaleStep, 6);

  // v2.4.8: consumePausedLadder resumes fresh markers with unchanged settings…
  const resumed = await consumePausedLadder(state.settings);
  assert.equal(resumed.currentAmount, 640);
  assert.equal(resumed.martingaleStep, 6);
  assert.equal(__storageData.avalisaPausedLadder, undefined);
  // …drops stale markers…
  __storageData.avalisaPausedLadder = {
    savedAt: Date.now() - (31 * 60 * 1000), currentAmount: 16, martingaleStep: 4,
    startAmount: parseFloat(state.settings.startAmount) || 1,
    martingaleMultiplier: state.settings.martingaleMultiplier,
    martingaleSteps: state.settings.martingaleSteps,
  };
  assert.equal(await consumePausedLadder(state.settings), null);
  assert.equal(__storageData.avalisaPausedLadder, undefined);
  // …and drops markers whose martingale settings changed.
  __storageData.avalisaPausedLadder = {
    savedAt: Date.now(), currentAmount: 16, martingaleStep: 4,
    startAmount: 999,
    martingaleMultiplier: state.settings.martingaleMultiplier,
    martingaleSteps: state.settings.martingaleSteps,
  };
  assert.equal(await consumePausedLadder(state.settings), null);

  const originalCheckLicense = checkLicense;
  document.body.innerHTML = '';
  injectOverlay();

  // v2.4.8: a first unexpected error retries with backoff instead of stopping.
  state.settings = getDefaultSettings();
  state.running = true;
  state.stopRequested = false;
  state.cycleGeneration = 201;
  state.cycleErrorStreak = 0;
  state.cycleErrorReloads = 1;
  let licenseCalls = 0;
  checkLicense = async () => {
    licenseCalls += 1;
    if (licenseCalls === 1) throw new Error('one-off hiccup');
    state.cycleGeneration = 999; // invalidate so the retried cycle exits quietly
    return { allowed: true, plan: 'lifetime' };
  };
  await runTradeCycle(201);
  assert.equal(state.running, true);
  assert.equal(state.cycleErrorStreak, 1);
  assert.match(document.getElementById('av-status').textContent, /retrying/);
  await new Promise(resolve => setTimeout(resolve, 150)); // retry fires before runTradeCycle resolves; small settle only
  assert.equal(licenseCalls, 2);

  // v2.4.8: after retries and the one self-heal reload are exhausted, it stops
  // safely and preserves the ladder for the next Start.
  state.settings = getDefaultSettings();
  state.running = true;
  state.stopRequested = false;
  state.cycleGeneration = 200;
  state.currentAmount = 8;
  state.martingaleStep = 3;
  state.cycleErrorStreak = 2;
  state.cycleErrorReloads = 1;
  checkLicense = async () => { throw new Error('simulated PO drift'); };
  await runTradeCycle(200);
  assert.equal(state.running, false);
  assert.equal(state.stopRequested, true);
  assert.equal(state.tradeLock, false);
  assert.equal(state.isTradeOpen, false);
  assert.equal(state.lastTradeCycleError.message, 'simulated PO drift');
  assert.match(document.getElementById('av-status').textContent, /stopped safely/);
  assert.equal(__storageData.avalisaPausedLadder.currentAmount, 8);
  assert.equal(__storageData.avalisaPausedLadder.martingaleStep, 3);
  stopBot();
  assert.equal(__storageData.avalisaPausedLadder, undefined); // manual Stop drops the preserved ladder
  checkLicense = originalCheckLicense;

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
