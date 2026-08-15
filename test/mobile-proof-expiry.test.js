// Webapp Bot (mobile proof) — expiry control + result timing.
// Guards the 2026-08-15 fix: the panel timeframe must be APPLIED to Pocket Option and
// confirmed before any trade, and a still-open trade must never be booked as a loss.
// Run: node test/mobile-proof-expiry.test.js
const fs = require('fs');
const { JSDOM } = require('../dashboard/node_modules/jsdom');
const RUNTIME = require('path').resolve(__dirname, '..', 'mobile-proof/ios/AvalisaMobileProof/ProofRuntime.js');

function hiddenByAncestor(el) {
  for (let n = el; n && n.style !== undefined; n = n.parentElement) {
    if (n.style.display === 'none') return true;
  }
  return false;
}

// Builds a PO-like mobile page. `layout` picks which DOM shape to emulate.
function makePage(layout, currentClock) {
  const picker = `
    <div class="picker" style="display:none">
      <ul>
        <li class="opt">30 sec</li>
        <li class="opt">1 min</li>
        <li class="opt">3 min</li>
        <li class="opt">5 min</li>
      </ul>
    </div>`;
  const trigger = layout === 'desktop-classes'
    ? `<div class="block--expiration-inputs"><div class="control__value"><span class="value__val">${currentClock}</span></div></div>`
    : `<div class="time-box"><span class="lbl">Time</span><div class="control__value"><span class="value__val">${currentClock}</span></div></div>`;
  return `<!doctype html><html><body>
    <div class="chart"><span class="period">1m</span></div>
    <div class="header"><span class="account-type">ACCT_LABEL</span><span class="balance">$778.92</span></div>
    <div class="trade-panel">
      ${trigger}
      <span class="lbl">Amount</span><input name="amount" type="number" value="2">
      <div>Payout $3.84 +92%</div>
      <button class="buy">BUY</button><button class="sell">SELL</button>
    </div>
    ${picker}
  </body></html>`;
}

async function boot(layout = 'mobile-label', currentClock = '00:03:00', opts = {}) {
  const account = opts.account === 'real' ? 'QT Real USD' : 'QT Demo USD';
  const url = opts.account === 'real'
    ? 'https://m.po.trade/en/cabinet/quick-high-low/'
    : 'https://m.po.trade/en/cabinet/demo-quick-high-low/';
  const html = makePage(layout, currentClock).replace('ACCT_LABEL', account);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const { window } = dom;

  // jsdom has no layout engine: synthesise rects so visible()/inTradePanel() behave.
  window.Element.prototype.getBoundingClientRect = function () {
    if (hiddenByAncestor(this)) return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
    const inChart = !!this.closest('.chart');
    const top = inChart ? 100 : 500;             // innerHeight 800 → 0.35*800 = 280
    return { top, left: 20, width: 120, height: 30, bottom: top + 30, right: 140 };
  };
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  // Stubbed backend: a valid Pro licence so the trade path is reachable offline.
  window.fetch = (target) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(String(target).includes('/api/license/')
      ? { allowed: true, plan: 'pro', tradesRemaining: 99, tradesLimit: 100, aiTradesUsed: 0, aiTradesAllowance: 99 }
      : {}),
  });

  // Wire the fake expiry picker.
  const doc = window.document;
  const pickerEl = doc.querySelector('.picker');
  const valEl = doc.querySelector('.value__val');
  const openTarget = doc.querySelector('.control__value');
  openTarget.addEventListener('click', () => {
    pickerEl.style.display = pickerEl.style.display === 'none' ? 'block' : 'none';
  });
  const secondsOf = { '30 sec': '00:00:30', '1 min': '00:01:00', '3 min': '00:03:00', '5 min': '00:05:00' };
  doc.querySelectorAll('.opt').forEach(li => {
    li.addEventListener('click', () => {
      if (opts.optionClicksDoNothing) return;
      valEl.textContent = secondsOf[li.textContent.trim()];
      pickerEl.style.display = 'none';
    });
  });
  if (opts.dropOption) {
    Array.from(doc.querySelectorAll('.opt'))
      .filter(li => li.textContent.trim() === opts.dropOption)
      .forEach(li => li.remove());
  }

  // Spies: what did the bot actually do to the page, and in what order?
  const actions = [];
  doc.querySelector('.buy').addEventListener('click', () => actions.push('BUY'));
  doc.querySelector('.sell').addEventListener('click', () => actions.push('SELL'));
  doc.querySelectorAll('.opt').forEach(li => li.addEventListener('click', () => actions.push('expiry:' + li.textContent.trim())));
  doc.querySelector('.chart .period').addEventListener('click', () => actions.push('CHART-PERIOD'));
  const amountInput = doc.querySelector('input[name="amount"]');
  amountInput.addEventListener('input', () => actions.push('amount:' + amountInput.value));

  const src = fs.readFileSync(RUNTIME, 'utf8');
  window.eval(src);
  return { window, doc, actions, readClock: () => valEl.textContent.trim() };
}



let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra === undefined ? '' : '-> ' + JSON.stringify(extra)); }
};

(async () => {


  console.log('\n[1] parseDurationToSeconds');
  {
    const { window } = await boot();
    const P = window.AvalisaProof.debug.parseDurationToSeconds;
    const table = [
      ['00:00:30', 30], ['00:01:00', 60], ['00:03:00', 180], ['01:00:00', 3600],
      ['30s', 30], ['30 sec', 30], ['30 seconds', 30],
      ['1m', 60], ['1 min', 60], ['3 min', 180], ['5 minutes', 300],
      ['M1', 60], ['M3', 180], ['S30', 30],
      ['3:00', 180], ['Time 00:03:00', 180],
      ['', null], ['-', null], ['Amount', null], ['abc', null],
    ];
    for (const [input, want] of table) ok(`"${input}" → ${want}`, P(input) === want, { got: P(input) });
  }

  console.log('\n[2] applyTimeframe switches PO from 3m to 30s (mobile "Time" label layout)');
  {
    const { window, readClock } = await boot('mobile-label', '00:03:00');
    const d = window.AvalisaProof.debug;
    ok('starts at 180s', d.currentExpirySeconds() === 180, { got: d.currentExpirySeconds() });
    const r = await d.applyTimeframe('S30');
    ok('reports ok', r.ok === true, r);
    ok('reports 30s', r.seconds === 30, r);
    ok('PO field now 00:00:30', readClock() === '00:00:30', { got: readClock() });
    ok('runtime reads back 30', d.currentExpirySeconds() === 30);
  }

  console.log('\n[3] same, desktop-style .block--expiration-inputs layout');
  {
    const { window, readClock } = await boot('desktop-classes', '00:05:00');
    const d = window.AvalisaProof.debug;
    const r = await d.applyTimeframe('M1');
    ok('reports ok', r.ok === true, r);
    ok('PO field now 00:01:00', readClock() === '00:01:00', { got: readClock() });
  }

  console.log('\n[4] already-correct expiry is a no-op (does not poke the PO panel)');
  {
    const { window, doc } = await boot('mobile-label', '00:00:30');
    const d = window.AvalisaProof.debug;
    let clicks = 0;
    doc.querySelector('.control__value').addEventListener('click', () => { clicks++; });
    const r = await d.applyTimeframe('S30');
    ok('reports ok', r.ok === true, r);
    ok('reason=already set', r.reason === 'already set', r);
    ok('no clicks on PO UI', clicks === 0, { clicks });
  }

  console.log('\n[5] FAIL CLOSED when the requested expiry is not offered');
  {
    const { window, readClock } = await boot('mobile-label', '00:03:00', { dropOption: '30 sec' });
    const d = window.AvalisaProof.debug;
    const r = await d.applyTimeframe('S30');
    ok('reports NOT ok', r.ok === false, r);
    ok('reason names what was offered', /not offered/.test(r.reason), r);
    ok('PO expiry untouched', readClock() === '00:03:00', { got: readClock() });
  }

  console.log('\n[6] FAIL CLOSED when clicking the option does not stick');
  {
    const { window } = await boot('mobile-label', '00:03:00', { optionClicksDoNothing: true });
    const d = window.AvalisaProof.debug;
    const r = await d.applyTimeframe('S30');
    ok('reports NOT ok', r.ok === false, r);
    ok('reason reports the stuck value', /stayed at 00:03:00/.test(r.reason), r);
  }

  console.log('\n[7] classifyResult never calls a loss before expiry');
  {
    const { window } = await boot();
    const C = window.AvalisaProof.debug.classifyResult;
    // 3-minute trade, $2 stake: balance 100 → 98 at open, still 98 mid-flight.
    ok('35s into a 180s trade = unknown (was: loss)', C(100, 98, 98, 2, 35000, 180) === 'unknown', { got: C(100, 98, 98, 2, 35000, 180) });
    ok('182s into a 180s trade = loss', C(100, 98, 98, 2, 182000, 180) === 'loss', { got: C(100, 98, 98, 2, 182000, 180) });
    ok('win still detected mid-flight', C(100, 98, 101.84, 2, 182000, 180) === 'win', { got: C(100, 98, 101.84, 2, 182000, 180) });
    ok('tie detected', C(100, 98, 100, 2, 182000, 180) === 'tie', { got: C(100, 98, 100, 2, 182000, 180) });
    ok('no balance reading = unknown', C(100, 98, null, 2, 182000, 180) === 'unknown');
    // 30s trade behaves as before
    ok('35s into a 30s trade = loss', C(100, 98, 98, 2, 35000, 30) === 'loss', { got: C(100, 98, 98, 2, 35000, 30) });
  }

  console.log('\n[8] requestedTradeTimeframe honours the panel setting');
  {
    const { window } = await boot();
    const A = window.AvalisaProof;
    A.setSettings({ settings: { timeframe: 'M3', strategy: 'martingale' } });
    ok('martingale uses panel timeframe', A.debug.requestedTradeTimeframe() === 'M3', { got: A.debug.requestedTradeTimeframe() });
    A.setSettings({ settings: { strategy: 'ai' } });
    A.debug.state.aiSuggestedTimeframe = 'S30';
    ok('AI mode uses AI timeframe', A.debug.requestedTradeTimeframe() === 'S30', { got: A.debug.requestedTradeTimeframe() });
    A.debug.state.aiSuggestedTimeframe = null;
    ok('AI falls back to panel', A.debug.requestedTradeTimeframe() === 'M3', { got: A.debug.requestedTradeTimeframe() });
  }

async function runCycle(opts) {
  const h = await boot(opts.layout || 'mobile-label', opts.clock || '00:03:00', opts);
  const A = h.window.AvalisaProof;
  A.setSettings({ settings: { strategy: 'martingale', timeframe: opts.timeframe || 'S30', direction: 'call', startAmount: 1 } });
  A.scan();
  await A.startBot();
  await new Promise(r => setTimeout(r, 300));
  return h;
}


  console.log('\n[9] DEMO account: full Start cycle sets the expiry BEFORE the amount, then trades');
  {
    const h = await runCycle({ account: 'demo', timeframe: 'S30', clock: '00:03:00' });
    const d = h.window.AvalisaProof.debug;
    ok('account read as demo', d.state.demoMode === 'confirmed', { got: d.state.demoMode });
    ok('PO expiry switched to 30s', h.readClock() === '00:00:30', { got: h.readClock(), actions: h.actions });
    ok('clicked the 30 sec option', h.actions.includes('expiry:30 sec'), h.actions);
    ok('chart period never clicked', !h.actions.includes('CHART-PERIOD'), h.actions);
    const iExpiry = h.actions.findIndex(a => a.startsWith('expiry:'));
    const iAmount = h.actions.findIndex(a => a.startsWith('amount:'));
    const iTrade = h.actions.findIndex(a => a === 'BUY' || a === 'SELL');
    ok('order = expiry → amount → trade', iExpiry >= 0 && iAmount > iExpiry && iTrade > iAmount, { actions: h.actions });
    ok('confirmed expiry recorded as 30s', d.state.confirmedExpirySeconds === 30, { got: d.state.confirmedExpirySeconds });
    h.window.AvalisaProof.stopBot('test done');
  }

  console.log('\n[10] REAL account: identical path, expiry still applied before the trade');
  {
    const h = await runCycle({ account: 'real', timeframe: 'M1', clock: '00:03:00' });
    const d = h.window.AvalisaProof.debug;
    ok('account read as real', d.state.demoMode === 'real', { got: d.state.demoMode });
    ok('PO expiry switched to 1m', h.readClock() === '00:01:00', { got: h.readClock(), actions: h.actions });
    ok('trade placed', h.actions.some(a => a === 'BUY' || a === 'SELL'), h.actions);
    ok('confirmed expiry recorded as 60s', d.state.confirmedExpirySeconds === 60, { got: d.state.confirmedExpirySeconds });
    ok('chart period never clicked', !h.actions.includes('CHART-PERIOD'), h.actions);
    h.window.AvalisaProof.stopBot('test done');
  }

  console.log('\n[11] FAIL CLOSED end-to-end: expiry unavailable → bot stops, NO trade placed');
  {
    const h = await runCycle({ account: 'demo', timeframe: 'S30', clock: '00:03:00', dropOption: '30 sec' });
    const d = h.window.AvalisaProof.debug;
    ok('no BUY/SELL click', !h.actions.some(a => a === 'BUY' || a === 'SELL'), h.actions);
    ok('bot stopped', d.state.botRunning === false, { botRunning: d.state.botRunning });
    ok('status explains why', /could not set 30s expiry/i.test(d.state.lastTradeStatus), { status: d.state.lastTradeStatus });
    ok('PO expiry left alone', h.readClock() === '00:03:00', { got: h.readClock() });
  }

  console.log('\n[12] FAIL CLOSED on a REAL account too (no real-money trade on a wrong expiry)');
  {
    const h = await runCycle({ account: 'real', timeframe: 'S30', clock: '00:03:00', optionClicksDoNothing: true });
    const d = h.window.AvalisaProof.debug;
    ok('account read as real', d.state.demoMode === 'real', { got: d.state.demoMode });
    ok('no BUY/SELL click', !h.actions.some(a => a === 'BUY' || a === 'SELL'), h.actions);
    ok('bot stopped', d.state.botRunning === false);
    ok('status explains why', /could not set 30s expiry/i.test(d.state.lastTradeStatus), { status: d.state.lastTradeStatus });
  }


  console.log('\n[13] REGRESSION — the reported bug: panel says 30s, PO is on 3m');
  console.log('     Old build: fired a trade, waited 35s, called the still-open trade a LOSS, doubled.');
  {
    // Panel asks for 3m and PO is on 3m, so the bot trades a genuine 3-minute contract.
    const h = await boot('mobile-label', '00:03:00', { account: 'demo' });
    const A = h.window.AvalisaProof;
    const d = A.debug;
    const balanceEl = h.doc.querySelector('.balance');
    // PO deducts the stake the moment the trade opens.
    h.doc.querySelector('.buy').addEventListener('click', () => { balanceEl.textContent = '$777.92'; });

    A.setSettings({ settings: { strategy: 'martingale', timeframe: 'M3', direction: 'call', startAmount: 1, martingaleMultiplier: 2 } });
    A.scan();
    await A.startBot();
    await new Promise(r => setTimeout(r, 2500));

    ok('trade was placed', h.actions.some(a => a === 'BUY' || a === 'SELL'), h.actions);
    ok('bot waits on the CONFIRMED 3m expiry', d.state.confirmedExpirySeconds === 180, { got: d.state.confirmedExpirySeconds });
    ok('trade-open confirmed by balance drop', d.state.lastTradeStatus.includes('expiry 00:03:00') || /settling/.test(d.state.lastTradeStatus), { status: d.state.lastTradeStatus });

    // ~2.5s in: the stake is gone and no payout has landed — this is exactly the state
    // the old build misread as a loss.
    console.log('     state at 2.5s into a 180s trade:', JSON.stringify({ status: d.state.lastTradeStatus, nextAmount: d.state.nextAmount, step: d.state.martingaleStep }));
    ok('martingale did NOT step', d.state.martingaleStep === 0, { step: d.state.martingaleStep });
    ok('next stake still $1 (not doubled to $2)', d.state.nextAmount === 1, { nextAmount: d.state.nextAmount });
    ok('no second trade fired on top of the open one', h.actions.filter(a => a === 'BUY' || a === 'SELL').length === 1, h.actions);
    ok('bot still running, still waiting', d.state.botRunning === true);
    A.stopBot('test done');
  }

  console.log('\n[14] Unknown results cannot ladder forever');
  {
    const h = await boot('mobile-label', '00:00:30', { account: 'demo' });
    const d = h.window.AvalisaProof.debug;
    ok('unknown streak counter exists and starts at 0', d.state.unknownResultStreak === 0, { got: d.state.unknownResultStreak });
    ok('a stalled read stays "unknown", which holds the ladder',
      d.classifyResult(100, 98, null, 2, 999000, 30) === 'unknown');
  }
  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
  if (fail) { console.error('Mobile proof expiry test FAILED'); process.exit(1); }
  console.log('Mobile proof expiry test passed.');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
