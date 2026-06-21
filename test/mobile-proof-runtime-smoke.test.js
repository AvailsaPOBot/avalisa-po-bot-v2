const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../dashboard/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><head></head><body><div>QT Real USD 100.00</div><input type="number" value="1"><button>CALL</button><button>PUT</button></body></html>', {
  url: 'https://m.po.trade/en/cabinet/demo-quick-high-low/?source=pwa',
  runScripts: 'outside-only',
});

dom.window.console = console;
dom.window.TextDecoder = TextDecoder;
dom.window.AbortController = AbortController;
dom.window.localStorage.clear();
dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { width: 100, height: 30, top: 100, left: 0, right: 100, bottom: 130 };
};
dom.window.webkit = { messageHandlers: { avalisaProof: { postMessage() {} } } };
let licenseState = {
  allowed: true,
  plan: 'basic',
  tradesRemaining: null,
  tradesUsed: 0,
  tradesLimit: null,
  aiTradesAllowance: 10,
  aiTradesUsed: 0,
};
let licenseChecks = 0;
let licenseIncrements = 0;
let tradeLogs = 0;
dom.window.fetch = async (url, options = {}) => {
  const parsed = new URL(String(url));
  const body = options.body ? JSON.parse(options.body) : {};
  if (parsed.pathname === '/api/license/check') {
    assert.ok(body.deviceFingerprint);
    licenseChecks += 1;
    return new Response(JSON.stringify(licenseState), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (parsed.pathname === '/api/license/increment') {
    assert.ok(body.deviceFingerprint);
    licenseIncrements += 1;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (parsed.pathname === '/api/trades/log') {
    assert.match(options.headers?.Authorization || '', /^Bearer /);
    tradeLogs += 1;
    return new Response(JSON.stringify({ success: true, trade: { id: 'trade-test' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (parsed.pathname === '/api/auth/login') {
    return new Response(JSON.stringify({
      token: 'jwt-test',
      user: { id: 'user-test', email: body.email },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected fetch ${parsed.pathname}`);
};

const runtime = fs.readFileSync(path.join(root, 'mobile-proof/ios/AvalisaMobileProof/ProofRuntime.js'), 'utf8');
dom.window.eval(`${runtime}\n//# sourceURL=ProofRuntime.js`);

const proof = dom.window.AvalisaProof;
assert.equal(proof.version, '1.02-local-proof');

(async () => {
let snapshot = JSON.parse(proof.snapshot());
proof.scan();
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.demoMode, 'real');
assert.equal(snapshot.layoutHealth, 'mobile layout ready');
assert.equal(await proof.placeTrade('call', 1), true);
snapshot = JSON.parse(proof.snapshot());
assert.match(snapshot.lastTradeStatus, /real CALL click sent/);
assert.ok(licenseChecks >= 1);
assert.ok(licenseIncrements >= 1);

dom.window.history.pushState({}, '', '/en/cabinet?source=pwa');
dom.window.document.body.innerHTML = '<div>Payout +92%</div><button>CALL</button>';
proof.scan();
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.demoMode, 'unknown');
assert.equal(snapshot.layoutHealth, 'account mode not confirmed (unknown)');
assert.equal(await proof.placeTrade('call', 1), false);
snapshot = JSON.parse(proof.snapshot());
assert.match(snapshot.lastTradeStatus, /account mode not confirmed/);

dom.window.history.pushState({}, '', '/en/cabinet/quick-high-low/?source=pwa');
dom.window.document.body.innerHTML = `
  <div>QT Real USD 44.50</div>
  <div class="js-balance-demo">$10000.00</div>
  <div class="js-balance-real-USD">$44.50</div>
  <input type="number" value="1">
  <button>CALL</button>
`;
proof.scan();
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.demoMode, 'real');
assert.equal(snapshot.balance, '$44.50');
assert.match(snapshot.layoutHealth, /missing PUT/);
assert.equal(await proof.placeTrade('call', 1), true);
snapshot = JSON.parse(proof.snapshot());
assert.match(snapshot.lastTradeStatus, /real CALL click sent/);

dom.window.history.pushState({}, '', '/en/cabinet/demo-quick-high-low/?source=pwa');
dom.window.document.body.innerHTML = `
  <div>QT Demo USD 10000.00</div>
  <div class="js-balance-demo">$10000.00</div>
  <div class="js-balance-real-USD">$44.50</div>
  <input type="number" value="1">
  <button>CALL</button>
`;
proof.scan();
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.demoMode, 'confirmed');
assert.equal(snapshot.balance, '$10000.00');
assert.equal(await proof.placeTrade('call', 1), true);
snapshot = JSON.parse(proof.snapshot());
assert.match(snapshot.lastTradeStatus, /demo CALL click sent/);

snapshot = await proof.login('paid@example.com', 'password123');
assert.equal(snapshot.authStatus, 'logged_in');
assert.equal(snapshot.userEmail, 'paid@example.com');
assert.equal(snapshot.licensePlan, 'basic');

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
assert.equal(await proof.startDemoMartingale(), true);
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
assert.equal(await proof.startDemoMartingale(), true);
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
assert.equal(await proof.startDemoMartingale(), true);
snapshot = JSON.parse(proof.snapshot());
assert.equal(snapshot.botRunning, true);
assert.match(snapshot.lastTradeStatus, /switching to AUD\/CAD OTC \(92%\) before trade/);

proof.stopBot('test reset');
licenseState = { allowed: false, plan: 'free', tradesRemaining: 0, tradesUsed: 10, tradesLimit: 10, reason: 'Trade limit reached' };
assert.equal(await proof.startDemoMartingale(), false);
snapshot = JSON.parse(proof.snapshot());
assert.match(snapshot.lastTradeStatus, /Trade limit reached/);
assert.equal(await proof.placeDemoTrade('call', 1), false);
snapshot = JSON.parse(proof.snapshot());
assert.match(snapshot.lastTradeStatus, /Trade limit reached/);

console.log('Mobile proof runtime smoke passed.');
process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
