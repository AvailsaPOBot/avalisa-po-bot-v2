const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/telemetry.js', 'utf8');
const content = fs.readFileSync('extension/content.js', 'utf8');
function harness(post = async () => ({})) {
  let now = 1800000000000;
  const ctx = vm.createContext({
    state: {jwt:'test',running:true,settings:{strategy:'martingale',intensity:'mid'},activePeriod:30,candleBuffer:{},currentAmount:1,martingaleStep:0},
    chrome:{runtime:{getManifest:()=>({version:'2.4.19'})}},
    getCurrentPair:()=> 'EURUSD', normalizeAssetName:x=>x,
    getRequiredCandles:()=>20, apiPost:post, withRetry: async fn=> {for(let i=0;i<3;i++){try{return await fn();}catch(e){if(i===2)throw e;}}},
    isDemoMode:()=>true, getBalance:async()=>100,
    Date:class extends Date { static now(){return now;} },
    console, setTimeout: () => 0,
  });
  vm.runInContext(fs.readFileSync('extension/signalEngine.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('extension/indicators.js','utf8'),ctx);
  vm.runInContext(source+'\nglobalThis.telemetry = AvalisaTelemetry;',ctx);
  return {ctx, telemetry:ctx.telemetry, advance:ms=>{now+=ms;},now:()=>now};
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('martingale order meta has computed market context without AI signalSnapshot',()=>{
  const {ctx,telemetry}=harness();
  ctx.state.candleBuffer['EURUSD:30']=Array.from({length:40},(_,i)=>({time:1700000000+i*30,open:1+i*.00001,high:1.01,low:.99,close:1+i*.00001}));
  const market=telemetry.market('EURUSD');
  assert.equal(market.candleCount,40);
  assert.equal(typeof market.rsi,'number');
  assert.equal(typeof market.sma20,'number');
  assert.equal(typeof market.rulesMatched.call,'number');
  Object.assign(ctx,{executionAsset:'EURUSD',expiryMs:30000,signalAt:Date.now(),signalSource:null,aiSignalSnapshot:null,getCurrentPayoutPercent:()=>92});
  vm.runInContext(content.slice(content.indexOf('  const tradeMeta = {'),content.indexOf('  const clickedAt ='))+'\nglobalThis.meta = tradeMeta;',ctx);
  assert.equal(ctx.meta.market.candleCount,40);
  assert.equal(ctx.aiSignalSnapshot,null);
  assert.equal(ctx.meta.expirySeconds,30);
  assert.equal(telemetry.market('GBPUSD').candleCount,0);
});
test('failing telemetry returns immediately and retries off the trade path',async()=>{
  let calls=0,cycleCompleted=false;
  const {telemetry}=harness(()=>{calls++;throw Error('offline');});
  telemetry.event('order_attempt');
  cycleCompleted=true;
  assert.equal(calls,0);
  assert.equal(cycleCompleted,true);
  await settle();
  assert.equal(calls,3);
  assert.match(content,/withRetry\(\(\) => apiPost\('\/api\/trades\/log'/);
  assert.doesNotMatch(content,/await AvalisaTelemetry/);
});
test('candles upload closed 30s only, dedupe and throttle even after failure',async()=>{
  const posts=[];
  let fail=true;
  const {telemetry,advance,now}=harness(async(path,body)=>{posts.push({path,body});if(fail)throw Error('offline');});
  const ts=Math.floor(now()/1000/30)*30;
  telemetry.history('EURUSD',[[ts-60,1],[ts-59,2],[ts-30,3],[ts,4]]);
  await settle();
  assert.equal(posts.length,1);
  assert.equal(posts[0].body.candles.length,2);
  telemetry.history('EURUSD',[[ts-60,1]]);
  telemetry.tick('EURUSD',ts+1,5);
  telemetry.tick('GBPUSD',ts+1,5);
  await settle();assert.equal(posts.length,1);
  advance(300000);fail=false;
  telemetry.tick('EURUSD',ts+300,6);
  await settle();assert.equal(posts.length,2);
  advance(300000);
  telemetry.tick('EURUSD',ts+600,7);
  await settle();assert.equal(posts.length,3);
  assert.ok(posts[2].body.candles.every(c=>c.time>ts));
  assert.ok(posts.every(p=>p.body.periodSec===30 && p.body.candles.length<=500));
});
test('candles upload only while the bot runs, and only for the pair it is on',async()=>{
  const posts=[];const {ctx,telemetry,now}=harness(async(path,body)=>posts.push(body));
  const ts=Math.floor(now()/1000/30)*30;
  ctx.state.running=false;
  telemetry.history('EURUSD',[[ts-60,1],[ts-30,2]]);
  telemetry.tick('EURUSD',ts-59,3);
  await settle();assert.equal(posts.length,0,'stopped bot uploads nothing');
  ctx.state.running=true;
  telemetry.history('GBPUSD',[[ts-60,1],[ts-30,2]]);
  await settle();assert.equal(posts.length,0,'a pair the bot is not on is never uploaded');
  telemetry.history('EURUSD',[[ts-60,1],[ts-30,2]]);
  await settle();assert.equal(posts.length,1);assert.equal(posts[0].pair,'EURUSD');
});
test('archive_full reply counts as delivered and pauses all candle uploads for an hour',async()=>{
  const posts=[];const {telemetry,advance,now}=harness(async(path,body)=>{posts.push(body);return {success:true,accepted:false,reason:'archive_full'};});
  const ts=Math.floor(now()/1000/30)*30;
  telemetry.history('EURUSD',[[ts-60,1],[ts-30,2]]);
  await settle();assert.equal(posts.length,1);
  advance(300000);telemetry.tick('EURUSD',ts+300,3);await settle();
  assert.equal(posts.length,1,'still paused after the normal 5-minute window');
  advance(3600000);telemetry.tick('EURUSD',ts+3900,4);await settle();
  assert.equal(posts.length,2,'resumes after an hour');
  assert.ok(posts[1].candles.every(c=>c.time>ts),'already-acknowledged candles are not resent');
});
test('PO facts merge exact open and close deal fields and exclude other accounts/data',()=>{
  const {ctx,telemetry}=harness();
  ctx.state.currentDealId='ours';
  ctx.state.recentOpenEvents=[{event:'successopenOrder',payload:{id:'ours',openPrice:1.2,openTime:123,isDemo:1,percentProfit:92,email:'private'}}];
  ctx.state.recentCloseEvents=[{event:'successcloseOrder',payload:{deals:[{id:'other',profit:999},{id:'ours',closePrice:1.3,closeTime:153,profit:.92}]}}];
  assert.deepEqual(JSON.parse(JSON.stringify(telemetry.po())),{dealId:'ours',openPrice:1.2,openTime:123,isDemo:1,payoutPct:92,closePrice:1.3,closeTime:153,profit:.92});
});
test('session start and stop carry balance, demo flag and same session ID',async()=>{
  const posts=[];const {telemetry}=harness(async(path,body)=>posts.push(body));
  telemetry.session('session_start');await settle();
  telemetry.session('session_stop');await settle();
  assert.equal(posts.length,2);assert.equal(posts[0].balance,100);
  assert.equal(posts[0].isDemo,true);assert.equal(posts[0].sessionId,posts[1].sessionId);
});
test('history batches cap at 500 candles and accept text OHLC frames',async()=>{
  const posts=[];const {ctx,telemetry,now}=harness(async(path,body)=>posts.push(body));
  ctx.getCurrentPeriodSeconds=()=>30;
  const end=Math.floor(now()/30000)*30;
  telemetry.history('EURUSD',Array.from({length:600},(_,i)=>[end-(600-i)*30,1]));
  await settle();assert.equal(posts[0].candles.length,500);
  const other=harness(async(path,body)=>posts.push(body));
  other.ctx.getCurrentPeriodSeconds=()=>30;
  other.telemetry.frame({asset:'EURUSD',period:30,candles:[[end-30,1,1.5,2,.9]]});
  await settle();assert.deepEqual(JSON.parse(JSON.stringify(posts[1].candles)),[{time:end-30,open:1,close:1.5,high:2,low:.9}]);
});
