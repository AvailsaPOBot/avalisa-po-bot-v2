const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/telemetry.js', 'utf8');
const content = fs.readFileSync('extension/content.js', 'utf8');
function harness(post = async () => ({})) {
  let now = 1800000000000;
  const ctx = vm.createContext({
    state: {jwt:'test',running:true,activePair:'EURUSD',activePeriod:30,settings:{strategy:'martingale',intensity:'mid'},candleBuffer:{},currentAmount:1,martingaleStep:0},
    chrome:{runtime:{getManifest:()=>({version:'2.4.20'})}},
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
// Fill the bot's own buffer, the way content.js does, ending with one still-open candle.
function fillBuffer(ctx, pair, period, count, nowMs) {
  const last = Math.floor(nowMs/1000/period)*period;
  ctx.state.candleBuffer[`${pair}:${period}`] = Array.from({length:count},(_,i)=>({
    time:last-(count-1-i)*period, open:1+i*1e-5, high:1.01, low:0.99, close:1+i*1e-5 }));
  return last; // the open one
}
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
// The 2.4.19 archive rebuilt candles from PO's raw stream and collected NOTHING live,
// because those frames carry numeric stream ids, not the pair. Archive the bot's buffer.
test('archives the bot own buffer for the active pair, skipping the still-open candle',async()=>{
  const posts=[];const {ctx,telemetry,now}=harness(async(path,body)=>{posts.push({path,body});return {};});
  const open=fillBuffer(ctx,'EURUSD',30,5,now());
  telemetry.tick('12345',now()/1000,1.5); // PO numeric stream id must not matter any more
  await settle();
  assert.equal(posts.length,1);
  assert.equal(posts[0].path,'/api/market/candles');
  assert.equal(posts[0].body.pair,'EURUSD');
  assert.equal(posts[0].body.periodSec,30);
  assert.equal(posts[0].body.candles.length,4,'four closed candles, the open one held back');
  assert.ok(posts[0].body.candles.every(c=>c.time<open));
});
// Measured live 2026-09-12: PO stamps candles ~2h AHEAD of local time. A wall-clock
// "is it closed yet" test marked every candle open and archived nothing at all.
test('archives PO candles stamped in the future by PO own clock',async()=>{
  const posts=[];const {ctx,telemetry,now}=harness(async(path,body)=>{posts.push(body);return {};});
  const skewed=Math.floor((now()/1000+7200)/30)*30; // PO ~2h ahead
  ctx.state.candleBuffer['EURUSD:30']=Array.from({length:6},(_,i)=>({time:skewed+i*30,open:1,high:1.01,low:0.99,close:1.005}));
  telemetry.snapshot();await settle();
  assert.equal(posts.length,1,'future-stamped candles still archive');
  assert.equal(posts[0].candles.length,5,'all but the newest, which is still forming');
  assert.ok(posts[0].candles.every(c=>c.time<skewed+5*30));
});
test('archives M1 too: whatever period the bot is actually trading',async()=>{
  const posts=[];const {ctx,telemetry,now}=harness(async(path,body)=>{posts.push(body);return {};});
  ctx.state.activePeriod=60;
  fillBuffer(ctx,'EURUSD',60,4,now());
  fillBuffer(ctx,'EURUSD',30,4,now());
  telemetry.snapshot();
  await settle();
  assert.deepEqual(posts.map(p=>p.periodSec).sort(),[30,60]);
});
test('uploads only while running, only for the pair the bot trades, deduped and throttled',async()=>{
  const posts=[];const {ctx,telemetry,advance,now}=harness(async(path,body)=>{posts.push(body);return {};});
  fillBuffer(ctx,'EURUSD',30,4,now());
  ctx.state.running=false;
  telemetry.snapshot();await settle();
  assert.equal(posts.length,0,'stopped bot archives nothing');
  ctx.state.running=true;
  ctx.state.activePair=null;
  telemetry.snapshot();await settle();
  assert.equal(posts.length,0,'no active pair, nothing to attribute');
  ctx.state.activePair='EURUSD';
  telemetry.snapshot();await settle();
  assert.equal(posts.length,1);
  telemetry.snapshot();await settle();
  assert.equal(posts.length,1,'throttled to one POST per pair+period per 5 minutes');
  const firstTimes=posts[0].candles.map(c=>c.time);
  advance(300001);
  telemetry.snapshot();await settle();
  assert.equal(posts.length,1,'time passing alone adds nothing: closure comes from the series');
  fillBuffer(ctx,'EURUSD',30,8,now());
  telemetry.snapshot();await settle();
  assert.equal(posts.length,2,'new candles in the buffer are archived');
  assert.ok(posts[1].candles.every(c=>!firstTimes.includes(c.time)),'no duplicates across posts');
});
test('archive_full counts as delivered and pauses uploads for an hour',async()=>{
  const posts=[];const {ctx,telemetry,advance,now}=harness(async(path,body)=>{posts.push(body);return {success:true,accepted:false,reason:'archive_full'};});
  fillBuffer(ctx,'EURUSD',30,4,now());
  telemetry.snapshot();await settle();
  assert.equal(posts.length,1);
  advance(300001);fillBuffer(ctx,'EURUSD',30,10,now());
  telemetry.snapshot();await settle();
  assert.equal(posts.length,1,'still paused after the normal throttle window');
  advance(3600000);fillBuffer(ctx,'EURUSD',30,12,now());
  telemetry.snapshot();await settle();
  assert.equal(posts.length,2,'resumes after an hour');
});
test('batches cap at 500 candles per request',async()=>{
  const posts=[];const {ctx,telemetry,now}=harness(async(path,body)=>{posts.push(body);return {};});
  fillBuffer(ctx,'EURUSD',30,700,now());
  telemetry.snapshot();await settle();
  assert.equal(posts[0].candles.length,500);
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
