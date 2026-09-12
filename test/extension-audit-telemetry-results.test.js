const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = f => fs.readFileSync(`extension/${f}`, 'utf8');
const settle = () => new Promise(r => setImmediate(r));
test('late DOM verdict requires the exact current deal identity', () => {
  const item = (id, text) => ({innerText:text,getAttribute:k=>k==='data-id'?id:null,querySelector:()=>null});
  const ctx = vm.createContext({state:{currentDealId:'ours'},document:{querySelectorAll:()=>[item('other','win + $1'),item('ours','loss - $1')]}});
  vm.runInContext(read('tradeResult.js'),ctx);
  assert.equal(ctx.findResolvedNewDealResult([])?.result,'loss');
  ctx.state.currentDealId=null;
  assert.equal(ctx.findResolvedNewDealResult([]),null);
});
test('non-finite close profits never become a money verdict',()=>{
  const ctx=vm.createContext({});vm.runInContext(read('tradeResult.js'),ctx);
  assert.equal(ctx.resultForDealId({deals:[{id:'ours',profit:NaN}]},'ours'),null);
  assert.equal(ctx.extractResultFromCloseEvent({profit:Infinity}),null);
});
test('malformed history and send frames cannot throw out of the listener',()=>{
  const src=read('content.js');let listener;
  const ctx=vm.createContext({window:{addEventListener:(_,fn)=>listener=fn},console:{warn(){}},debugLog(){}});
  vm.runInContext(src.slice(src.indexOf("window.addEventListener('message', (e) => {"),src.indexOf('// ─── Init')),ctx);
  for(const type of ['AVALISA_WS_HISTORY','AVALISA_WS_SEND']) for(const data of [undefined,null,{},42]) {
    assert.doesNotThrow(()=>listener({data:{type,data}}));
  }
});
test('archive bounds stalled concurrent requests and does not redispatch an in-flight key',async()=>{
  let calls=0,now=1800000000000;
  const ctx=vm.createContext({state:{running:true,jwt:'x',activePeriod:30,candleBuffer:{}},Date:class extends Date{static now(){return now;}},apiPost:()=>{calls++;return new Promise(()=>{});}});
  vm.runInContext(read('telemetry.js')+';globalThis.t= AvalisaTelemetry',ctx);
  for(let i=0;i<100;i++){
    const pair=`PAIR${i}`;ctx.state.activePair=pair;
    ctx.state.candleBuffer[`${pair}:30`]=[{time:30,open:1,high:1,low:1,close:1},{time:60,open:1,high:1,low:1,close:1}];
    ctx.t.snapshot();await settle();
  }
  assert.ok(calls<=4,`stalled requests ${calls}`);
  now+=300001;ctx.state.activePair='PAIR0';ctx.t.snapshot();await settle();
  assert.ok(calls<=4,'no second request while first is pending');
});
test('queued archive dispatch stops when the bot stops before transport begins',async()=>{
  let calls=0;
  const ctx=vm.createContext({state:{running:true,jwt:'x',activePair:'EURUSD',activePeriod:30,candleBuffer:{'EURUSD:30':[{time:30,open:1,high:1,low:1,close:1},{time:60,open:1,high:1,low:1,close:1}]}},apiPost:async()=>{calls++;return {};}});
  vm.runInContext(read('telemetry.js')+';globalThis.t=AvalisaTelemetry',ctx);
  ctx.t.snapshot();ctx.state.running=false;await settle();assert.equal(calls,0);
});
test('queued telemetry and retries cannot cross account credentials',async()=>{
  const calls=[];
  const ctx=vm.createContext({state:{jwt:'A'},apiPost:async()=>{calls.push(ctx.state.jwt);ctx.state.jwt='B';throw Error('offline');},withRetry:async fn=>{for(let i=0;i<3;i++){try{return await fn();}catch{}}}});
  vm.runInContext(read('telemetry.js')+';globalThis.t=AvalisaTelemetry',ctx);
  ctx.t.post('/api/trades/event',{type:'order_attempt'});ctx.state.jwt='B';await settle();
  assert.deepEqual(calls,[],'cancel before first dispatch');
  ctx.state.jwt='A';ctx.t.post('/api/trades/event',{type:'order_attempt'});await settle();
  assert.deepEqual(calls,['A'],'retry must not use B credentials');
});
test('delayed session balance cannot publish the old session under a new account',async()=>{
  let finishBalance;const calls=[];
  const ctx=vm.createContext({state:{jwt:'A'},getCurrentPair:()=> 'EURUSD',isDemoMode:()=>true,getBalance:()=>new Promise(r=>finishBalance=r),chrome:{runtime:{getManifest:()=>({version:'x'})}},apiPost:async()=>calls.push(ctx.state.jwt),withRetry:fn=>fn()});
  vm.runInContext(read('telemetry.js')+';globalThis.t=AvalisaTelemetry',ctx);
  ctx.t.session('session_start');await settle();ctx.state.jwt='B';finishBalance(123);await settle();
  assert.deepEqual(calls,[]);
});
test('candle ingestion bounds inactive key cardinality and preserves active candles',()=>{
  const ctx=vm.createContext({state:{activePair:'EURUSD',activePeriod:30,candleBuffer:{'EURUSD:30':[{time:30,close:7}]}},TF_TO_SECONDS:{M1:60},scheduleCandleCacheSave(){}});
  const src=read('content.js');vm.runInContext(src.slice(src.indexOf('function ingestCandle'),src.indexOf('function getBufferedCandles()')),ctx);
  for(let i=0;i<100;i++)ctx.ingestCandle({asset:`PAIR${i}`,period:30,time:30,open:1,high:1,low:1,close:1});
  assert.ok(Object.keys(ctx.state.candleBuffer).length<=20);
  assert.equal(ctx.state.candleBuffer['EURUSD:30'][0].close,7);
  ctx.state.activePair=null;
  for(let i=0;i<100;i++)ctx.ingestTick(`TICK${i}`,100,1);
  assert.ok(Object.keys(ctx.state.candleBuffer).length<=20);
});
