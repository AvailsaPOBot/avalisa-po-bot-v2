const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../dashboard/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><head></head><body><div>QT Real USD 100.00</div></body></html>', {
  url: 'https://m.po.trade/en/cabinet/demo-quick-high-low/?source=pwa',
  runScripts: 'outside-only',
});

dom.window.console = console;
dom.window.TextDecoder = TextDecoder;
dom.window.localStorage.clear();
dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { width: 100, height: 30, top: 100, left: 0, right: 100, bottom: 130 };
};
dom.window.webkit = { messageHandlers: { avalisaProof: { postMessage() {} } } };

const runtime = fs.readFileSync(path.join(root, 'mobile-proof/ios/AvalisaMobileProof/ProofRuntime.js'), 'utf8');
dom.window.eval(`${runtime}\n//# sourceURL=ProofRuntime.js`);

const proof = dom.window.AvalisaProof;
assert.equal(proof.version, '1.02-local-proof');

let snapshot = JSON.parse(proof.snapshot());
proof.scan();
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.demoMode, 'real-blocked');
assert.equal(proof.startDemoMartingale(), false);
snapshot = JSON.parse(proof.snapshot());
assert.match(snapshot.lastTradeStatus, /demo mode not confirmed/);

const settingsStatus = proof.setSettings({
  settings: {
    strategy: 'ai',
    direction: 'put',
    timeframe: 'M5',
    intensity: 'high',
    aiPairMode: 'auto',
    startAmount: 5,
    martingaleMultiplier: 2.4,
    martingaleSteps: '5',
    payoutAction: 'off',
    payoutMinPercent: 88,
    maxProofTrades: 100,
    maxProofAmount: 128,
    mobileAmountFallback: 'stop',
  },
});
assert.equal(settingsStatus.settings.strategy, 'ai');
assert.equal(settingsStatus.settings.intensity, 'high');
assert.equal(settingsStatus.settings.aiPairMode, 'auto');
assert.equal(settingsStatus.settings.startAmount, 5);
assert.equal(settingsStatus.settings.martingaleMultiplier, 2.4);
assert.equal(settingsStatus.settings.maxProofTrades, 100);
assert.equal(settingsStatus.settings.mobileAmountFallback, 'stop');

const normalized = proof.setSettings({
  settings: {
    strategy: 'bad',
    timeframe: 'bad',
    intensity: 'bad',
    aiPairMode: 'bad',
    payoutAction: 'bad',
    startAmount: -4,
    maxProofTrades: 999,
    mobileAmountFallback: 'bad',
  },
});
assert.equal(normalized.settings.strategy, 'martingale');
assert.equal(normalized.settings.timeframe, 'S30');
assert.equal(normalized.settings.intensity, 'low');
assert.equal(normalized.settings.aiPairMode, 'current');
assert.equal(normalized.settings.payoutAction, 'switch');
assert.equal(normalized.settings.startAmount, 1);
assert.equal(normalized.settings.maxProofTrades, 100);
assert.equal(normalized.settings.mobileAmountFallback, 'hold-start');

dom.window.document.body.innerHTML = '<div>QT Demo USD 100.00</div><div>Payout +66%</div>';
proof.setSettings({
  settings: {
    payoutAction: 'switch',
    payoutMinPercent: 90,
    maxProofTrades: 1,
  },
});
assert.equal(proof.startDemoMartingale(), true);
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.botRunning, false);
assert.match(snapshot.lastTradeStatus, /payout 66% below minimum 90%; no favorite available to auto-switch/);

dom.window.document.body.innerHTML = '<div>QT Demo USD 100.00</div><button>CAD/CHF</button><div>Payout +66%</div>';
proof.setSettings({
  settings: {
    payoutAction: 'switch',
    payoutMinPercent: 90,
    maxProofTrades: 1,
  },
});
assert.equal(proof.startDemoMartingale(), true);
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.botRunning, true);
assert.match(snapshot.lastTradeStatus, /opening pair selector to auto-switch from 66% below minimum 90%/);

dom.window.document.body.innerHTML = '<div>QT Demo USD 100.00</div><button>CAD/CHF</button><div>Payout +66%</div><div class="favorite-list__item">AUD/CAD OTC +92%</div>';
proof.stopBot('test reset');
proof.setSettings({
  settings: {
    payoutAction: 'switch',
    payoutMinPercent: 90,
    maxProofTrades: 1,
  },
});
assert.equal(proof.startDemoMartingale(), true);
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.botRunning, true);
assert.match(snapshot.lastTradeStatus, /switching to AUD\/CAD OTC \(92%\) before trade/);

console.log('Mobile proof runtime smoke passed.');
process.exit(0);
