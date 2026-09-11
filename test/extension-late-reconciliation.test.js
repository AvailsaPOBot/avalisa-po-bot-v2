const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = process.env.AVALISA_TEST_SOURCE_DIR || path.join(__dirname, '../extension');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const content = read('content.js');
const start = 1789140000000;
const asset = 'CHFJPY_otc';
const deal = (id, extra = {}) => ({id, asset, amount:64, openTime:start / 1000 + 1, profit:-64, ...extra});
function harness() {
  let clock = start, balance = 291.29;
  const logs = [];
  const state = {settings:{startAmount:1}, currentAmount:256, martingaleStep:8,
    currentDealId:null, currentTradeIdentity:{tradeStartTs:start, asset, amount:64},
    recentCloseEvents:[], recentOpenEvents:[], usedDealIds:new Set()};
  const ctx = vm.createContext({state, Date:class extends Date {static now(){return clock;}},
    console:{log:(...a)=>logs.push(a.join(' ')),warn:(...a)=>logs.push(a.join(' '))},
    window:{localStorage:{getItem:()=>null}}, document:{visibilityState:'hidden',querySelectorAll:()=>[]},
    sleep:async ms=>{clock+=ms;}, Event:class{}, FocusEvent:class{}, InputEvent:class{}});
  vm.runInContext(read('poDom.js')+'\n'+read('tradeResult.js')+'\n'+content.slice(content.indexOf('function avDebugEnabled'),content.indexOf('function ingestCandle')),ctx);
  ctx.sleep=async ms=>{clock+=ms;};
  ctx.getBalance=async()=>balance;
  ctx.countDealElements=()=>5;
  ctx.getCurrentPair=()=>asset;
  return {ctx,state,logs, advance:ms=>clock+=ms};
}
test('late text successopenOrder is adopted after half-stake balance confirmation; hidden WS loss resolves',async()=>{
  const {ctx,state}=harness();
  const opened=await ctx.waitForTradeOpen(323.29,64,45000,5);
  assert.equal(opened.method,'balance-drop');
  assert.equal(state.currentDealId,null);
  ctx.parseWsMessage('42'+JSON.stringify(['successopenOrder',deal('ours')]));
  state.recentCloseEvents.push({ts:start+40000,event:'successcloseOrder',payload:{deals:[deal('ours')]}});
  const result=await ctx.resolveTradeResult(323.29,opened.balanceDuring,64,start,[]);
  assert.equal(state.currentDealId,'ours');
  assert.equal(result,'loss');
});
test('unique close identifies trade, but two distinct matching close candidates stay unresolved',()=>{
  for(const ids of [['one'],['one','two']]) {
    const {ctx,state}=harness();
    state.recentCloseEvents.push({ts:start+40000,event:'successcloseOrder',payload:{deals:ids.map(id=>deal(id))}});
    const result=ctx.readWsTradeResultSince(start);
    assert.equal(result?.result || null,ids.length===1?'loss':null);
    assert.equal(state.currentDealId,ids.length===1?'one':null);
  }
});
test('stale time, missing time, wrong pair/amount, used ID and timestamp-only events never identify a trade',()=>{
  for(const extra of [{openTime:start/1000-1},{openTime:undefined},{asset:'EURUSD_otc'},{amount:32}]) {
    const {ctx,state}=harness();
    state.recentCloseEvents.push({ts:start+40000,event:'successcloseOrder',payload:{deals:[deal('bad',extra)]}});
    assert.equal(ctx.readWsTradeResultSince(start),null);
  }
  const {ctx,state}=harness();
  state.usedDealIds.add('old');
  state.recentCloseEvents.push({ts:start+40000,event:'successcloseOrder',payload:{deals:[deal('old')]}});
  assert.equal(ctx.readWsTradeResultSince(start),null);
});
test('duplicate close delivery is one candidate; milliseconds and ISO openTime are accepted',()=>{
  for(const openTime of [start+1000,new Date(start+1000).toISOString()]) {
    const {ctx,state}=harness();
    const event={ts:start+40000,event:'successcloseOrder',payload:{deals:[deal('one',{openTime})]}};
    state.recentCloseEvents.push(event,event);
    assert.equal(ctx.readWsTradeResultSince(start)?.result,'loss');
  }
});
test('amount pause restores the clamped input and preserves recovery ladder',async()=>{
  for(const startAmount of [2,0,256]) {
    const {ctx,state,logs}=harness();
    let value='99.29';
    const input={focus(){},select(){},dispatchEvent(){},get value(){return value;}};
    ctx.window.HTMLInputElement=function(){};
    Object.defineProperty(ctx.window.HTMLInputElement.prototype,'value',{set(v){value=String(Math.min(99.29,Number(v)));}});
    ctx.getTradeAmountInput=()=>({input,selector:'amount'});
    state.settings.startAmount=startAmount;
    state.running=true;
    Object.assign(ctx,{preservePausedLadder:async()=>{},clearTradeLock(){},clearRuntimeSession:async()=>{},updateUI(){},updateStatus(){}});
    vm.runInContext(content.slice(content.indexOf('async function pauseRecoveryAfterAmountSetFailure'),content.indexOf('async function recoverAfterUnconfirmedOrder')),ctx);
    assert.equal(ctx.setTradeAmount(256),false);
    await ctx.pauseRecoveryAfterAmountSetFailure(1,256,99.29);
    assert.equal(Number(value),startAmount > 99.29 ? 1 : Math.max(1,startAmount));
    assert.equal(state.currentAmount,256);
    assert.equal(state.martingaleStep,8);
    assert.equal(state.running,false);
    assert.ok(logs.some(s=>/restored/i.test(s)));
  }
});
test('balance and CALL/PUT polling logs are silent by default and enabled by debug flag',async()=>{
  const {ctx,logs}=harness();
  vm.runInContext(read('poDom.js'),ctx);
  ctx.isDemoMode=()=>true;
  ctx.PO_SELECTORS={balance:{demo:['balance']}};
  ctx.document.querySelector=()=>({textContent:'99.29'});
  ctx.isVisibleAccountBalanceElement=()=>true;
  ctx.isUsableTradeButton=()=>true;
  for(const enabled of [false,true]) {
    logs.length=0;ctx.window.__AVALISA_DEBUG_LOGS__=enabled;
    await ctx.getBalance();ctx.resolveTradeButton('call',['call']);ctx.resolveTradeButton('put',['put']);
    assert.equal(logs.length,enabled?3:0);
    ctx.isVisibleAccountBalanceElement=()=>false;
    ctx.getActiveAccountBalanceFromText=()=>99.29;
    logs.length=0;await ctx.getBalance();assert.equal(logs.length,enabled?1:0);
    ctx.isVisibleAccountBalanceElement=()=>true;
  }
});

test('binary handler retains a late open after DOM confirmation even when lastWsOpen is overwritten',async()=>{
  const {ctx,state}=harness();
  ctx.getBalance=async()=>null;
  let counts=0;ctx.countDealElements=()=>++counts===1?5:6;
  const opened=await ctx.waitForTradeOpen(323.29,64,2000,5);
  assert.equal(opened.method,'dom-deal-no-balance-drop');
  // Use the actual content-script binary branch, including JSON decoding.
  const begin=content.indexOf("} else if (t === 'AVALISA_WS_BINARY') {");
  const end=content.indexOf("} else if (t === 'AVALISA_WS_HISTORY') {",begin);
  vm.runInContext('function binary(e) { const t="AVALISA_WS_BINARY"; '+content.slice(begin+7,end)+'} }',ctx);
  ctx.binary({data:{event:'successopenOrder',data:JSON.stringify(deal('ours'))}});
  ctx.binary({data:{event:'successopenOrder',data:JSON.stringify(deal('other',{asset:'EURUSD_otc'}))}});
  assert.equal(state.lastWsOpen.payload.id,'other');
  assert.ok(Array.isArray(state.recentOpenEvents));
  assert.equal(state.recentOpenEvents.length,2);
  assert.equal(state.currentDealId,'ours');
});
test('retained ambiguous opens stay unresolved and a previously claimed ID is never reused',()=>{
  const {ctx,state}=harness();
  state.recentOpenEvents=[{ts:start+1000,payload:deal('a')},{ts:start+1000,payload:deal('b')}];
  assert.equal(ctx.readWsTradeResultSince(start),null);
  assert.equal(state.currentDealId,null);
  state.recentOpenEvents.pop();
  ctx.readWsTradeResultSince(start);
  assert.equal(state.currentDealId,'a');
  assert.ok(state.usedDealIds.has('a'));
  state.currentDealId=null;
  ctx.readWsTradeResultSince(start);
  assert.equal(state.currentDealId,null);
});

test('failed safe reset warns rather than claiming restoration',async()=>{
  const {ctx,state,logs}=harness();
  state.running=true;
  Object.assign(ctx,{setTradeAmount:()=>false,preservePausedLadder:async()=>{},clearTradeLock(){},clearRuntimeSession:async()=>{},updateUI(){},updateStatus(){}});
  vm.runInContext(content.slice(content.indexOf('async function pauseRecoveryAfterAmountSetFailure'),content.indexOf('async function recoverAfterUnconfirmedOrder')),ctx);
  await ctx.pauseRecoveryAfterAmountSetFailure(1,256,99.29);
  assert.equal(state.running,false);
  assert.ok(logs.some(s=>/Could not restore PO amount/.test(s)));
  assert.ok(!logs.some(s=>/input restored/.test(s)));
});
