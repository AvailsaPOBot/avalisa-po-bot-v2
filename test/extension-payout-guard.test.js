const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/poDom.js'), 'utf8');
function harness({action = 'switch', payouts = [70], pair = 'OLD', switchedPair = 'NEW', clicked = true} = {}) {
  const context = vm.createContext({console: {log(){}, warn(){}}, state: {payoutMinPercent:90, payoutAction:action}});
  vm.runInContext(source, context);
  let switches = 0;
  Object.assign(context, {
    getCurrentPayoutPercent: () => payouts.length > 1 ? payouts.shift() : payouts[0],
    getCurrentPair: () => switches ? switchedPair : pair,
    getFavoritePairs: () => [{name:'NEW', payout:92}],
    clickFavoritePair: () => { switches++; return clicked; },
    sleep: async () => {},
  });
  return {run: options => context.checkPayoutBeforeTrade(options), switches: () => switches};
}
test('enabled monitor blocks an unreadable payout', async () => {
  assert.equal((await harness({payouts:[null]}).run()).proceed, false);
});
test('disabled monitor allows unreadable payout', async () => {
  assert.equal((await harness({action:'off', payouts:[null]}).run()).proceed, true);
});
test('current-pair mode still enforces the minimum without switching', async () => {
  const h = harness();
  assert.equal((await h.run({allowSwitch:false})).proceed, false);
  assert.equal(h.switches(), 0);
});
test('ignored pair click cannot authorize a trade', async () => {
  assert.equal((await harness({switchedPair:'OLD', payouts:[70,92]}).run()).proceed, false);
});
test('post-switch payout must meet minimum and be readable', async () => {
  for (const payout of [null, 75]) assert.equal((await harness({payouts:[70,payout]}).run()).proceed, false);
});
test('confirmed pair and qualifying payout allow trade', async () => {
  assert.equal((await harness({payouts:[70,92]}).run()).proceed, true);
});
test('already qualifying payout does not switch', async () => {
  const h = harness({payouts:[92]});
  assert.equal((await h.run()).proceed, true);
  assert.equal(h.switches(), 0);
});
test('failed click and stop policy halt', async () => {
  for (const opts of [{clicked:false}, {action:'stop'}]) assert.equal((await harness(opts).run()).halt, true);
});

test('stale favorite payout for the current pair cannot bypass the live payout', async () => {
  const h = harness({pair:'NEW'});
  assert.equal((await h.run()).proceed, false);
  assert.equal(h.switches(), 0);
});
