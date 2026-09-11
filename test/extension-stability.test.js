const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const content = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
const poDom = fs.readFileSync(path.join(__dirname, '../extension/poDom.js'), 'utf8');
function extract(start, end) { return content.slice(content.indexOf(start), content.indexOf(end, content.indexOf(start))); }
test('Stop keeps pending/open order locked and blocks a quick Start', async () => {
  for (const phase of ['order_pending', 'trade_open', 'resolving_result']) {
    const state = {running:true, tradeLock:true, isTradeOpen:true, tradeLockPhase:phase, cycleGeneration:7};
    let cleared = 0;
    const ctx = vm.createContext({state, updateUI(){}, updateStatus(){}, updateBottomStatus(){},
      clearTradeLock(){cleared++;}, clearRuntimeSession:async()=>{}, clearPausedLadder:async()=>{}});
    vm.runInContext(extract('async function startBot()', 'async function saveCurrentSettings()'), ctx);
    ctx.stopBot();
    await ctx.startBot();
    assert.equal(state.running, true);
    assert.equal(state.stopAfterTrade, true);
    assert.equal(state.cycleGeneration, 7);
    assert.equal(cleared, 0);
    // Once settlement clears the lock, the same Stop completes the drain.
    state.tradeLock = false; state.isTradeOpen = false;
    ctx.stopBot();
    assert.equal(state.running, false);
    assert.equal(state.stopAfterTrade, false);
    assert.equal(state.cycleGeneration, 8);
  }
});
function scanHarness({ready=true, switched='NEW', payout=92, cancelAt=0}={}) {
  let currentPair='OLD', evaluations=0, waits=0, clicks=0;
  const state={running:true,stopRequested:false,cycleGeneration:1,activePair:'OLD',settings:{aiPairMode:'auto'}};
  const ctx=vm.createContext({state, console:{log(){}}, AI_SCAN_MAX_FAVORITES:6,
    isCycleActive:g=>state.running&&!state.stopRequested&&g===state.cycleGeneration,
    getPayoutSettings:()=>({minPct:90}), getCurrentPayoutPercent:()=>payout,
    getRequiredCandles:()=>16, ensureAvalisaDataForCurrentPair:async()=>ready,
    evaluateAvalisaCurrentPair:()=>{evaluations++;return {action:evaluations===1?'SKIP':'CALL'};},
    getFavoritePairs:()=>[{name:'NEW',payout:92}],updateStatus(){},
    clickFavoritePair:()=>{clicks++;currentPair=switched;state.activePair=switched;return true;},
    sleep:async()=>{waits++;if(waits===cancelAt)state.stopRequested=true;},
    normalizeAssetName:x=>x,getCurrentPair:()=>currentPair});
  vm.runInContext(extract('async function chooseAvalisaOpportunity', '// ─── Trading Engine'),ctx);
  return {run:()=>ctx.chooseAvalisaOpportunity('mid',1),evaluations:()=>evaluations,clicks:()=>clicks};
}
test('favorite scan does not evaluate an ignored pair switch',async()=>{
  const h=scanHarness({switched:'OLD'});await h.run();assert.equal(h.evaluations(),1);
});
test('favorite scan rechecks actual payout and cancels after waiting',async()=>{
  for(const options of [{payout:70},{payout:null},{cancelAt:1}]){
    const h=scanHarness(options);await h.run();assert.equal(h.evaluations(),1);
  }
});
test('ready matching favorite can produce a signal',async()=>{
  const h=scanHarness();assert.equal((await h.run()).action,'CALL');assert.equal(h.evaluations(),2);
});
test('missing current data cannot be evaluated as a ready signal',async()=>{
  const h=scanHarness({ready:false});await h.run();assert.equal(h.evaluations(),0);
});
test('expiry selection only succeeds after host value confirms it',async()=>{
  for(const applied of [false,true]) {
    let value='00:03:00';
    const item={textContent:'M1',click(){if(applied)value='00:01:00';}};
    const ctx=vm.createContext({console:{log(){},warn(){}},
      PO_SELECTORS:{durationValue:'value',durationTrigger:'trigger',timeframeItems:'items'},
      document:{querySelector:s=>s==='value'?{textContent:value}:null,querySelectorAll:()=>[item]},
      ensureDurationPanel:async()=>{}, sleep:async()=>{},closePOPopovers(){}});
    vm.runInContext(poDom.slice(poDom.indexOf('async function setTimeframe'),poDom.indexOf('function chooseAvailableTimeframeFallback')),ctx);
    assert.equal(await ctx.setTimeframe('M1'), applied?'M1':null);
  }
});
test('flat RSI is neutral; increasing and decreasing prices remain directional',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/indicators.js'),'utf8'),ctx);
  assert.equal(ctx.calcRSI(Array(15).fill(100)),50);
  assert.equal(ctx.calcRSI(Array.from({length:15},(_,i)=>100+i)),100);
  assert.equal(ctx.calcRSI(Array.from({length:15},(_,i)=>100-i)),0);
});
test('cache restore never rewinds live ticks or switches to a departed pair',async()=>{
  for(const newerLive of [false,true]){
    let callback;
    const time=Date.now()/1000;
    const live=[{time:time,close:5}];
    const state={candleBuffer:newerLive?{'PAIR:30':live}:{},activePair:'OTHER'};
    const ctx=vm.createContext({state,CANDLE_CACHE_KEY:'cache',MAX_CANDLE_BUFFER:50,
      chrome:{storage:{local:{get:(_,cb)=>callback=cb}}},normalizeAssetName:x=>x,
      getCurrentPair:()=>newerLive?'PAIR':'OTHER',isFreshCandleCache:()=>true,
      clearStalePairBuffers(){throw Error('must not replace buffer');},updateBottomStatus(){},console});
    vm.runInContext(extract('async function restoreCandleCache','function saveActiveCandleCache'),ctx);
    const result=ctx.restoreCandleCache('PAIR',30);
    callback({cache:{'PAIR:30':{candles:[{time:time-30,close:1}]}}});
    assert.equal(await result,false);
    assert.equal(state.activePair,'OTHER');
    if(newerLive) assert.equal(state.candleBuffer['PAIR:30'],live);
  }
});
