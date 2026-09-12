const test = require('node:test');
const assert = require('node:assert/strict');
const { eventData, capBody, userRateLimit, uploadCandles, exportCandles, pruneMarketCandles, pruneTradeEvents, startRetention, isArchiveFull, archiveCapState, resetArchiveCap } = require('../src/lib/tradingTelemetry');
const { sanitizeTradeMeta } = require('../src/lib/tradeMeta');
const { createAccumulator } = require('../src/lib/strategyStats');
const res = () => ({ statusCode: 200, setHeader(k,v) { this[k] = v; }, status(v) { this.statusCode=v; return this; }, json(v) { this.body=v; return this; } });
test('events whitelist fields and preserve session demo balance', () => {
  assert.throws(() => eventData({ type: 'anything' }, 'u'), RangeError);
  const data = eventData({ type: 'session_start', isDemo: true, balance: 10, sessionId: 'local-1', extVersion: '2.4.19', at: 1000, secret: 'no' }, 'u');
  assert.deepEqual(data.meta, { sessionId: 'local-1', extVersion: '2.4.19', isDemo: true, balance: 10, at: '1970-01-01T00:00:01.000Z' });
  assert.throws(() => eventData({ type: 'stop', balance: 10 }, 'u'), RangeError);
  assert.throws(() => eventData({ type: 'pause', reason: 'arbitrary personal text' }, 'u'), RangeError);
});
test('event cap and per-user 120/min limiter with independent users and reset', () => {
  let time=0, calls=0; const limit=userRateLimit(120, () => time);
  for(let i=0;i<120;i++) limit({userId:'a'},res(),()=>calls++);
  const blocked=res();limit({userId:'a'},blocked,()=>assert.fail()); assert.equal(blocked.statusCode,429);
  limit({userId:'b'},res(),()=>calls++);time=60000;limit({userId:'a'},res(),()=>calls++);assert.equal(calls,122);
  const oversized=res();capBody({body:{reason:'x'.repeat(4096)}},oversized,()=>assert.fail());assert.equal(oversized.statusCode,413);
});
const now=Date.parse('2026-09-11T00:00:00Z');
const candle = time => ({time,open:1,high:2,low:1,close:1.5});
const start=now/1000-3000;
test('candle upload dedupes and uses createMany skipDuplicates with bounded valid closed data', async () => {
  resetArchiveCap();
  let args;const db={marketCandle:{createMany:async q=>(args=q,{count:q.data.length})}};
  assert.deepEqual(await uploadCandles(db,{pair:'EURUSD_otc',periodSec:30,candles:[candle(start),candle(start)]},now),{accepted:true,count:1});
  assert.equal(args.skipDuplicates,true);assert.equal(args.data.length,1);
  // NOTE: "closed yet?" is the client's call now (PO's clock runs ahead of ours),
  // so a candle timed at our own now is valid; misalignment and bad OHLC are not.
  for (const changes of [{periodSec:45},{periodSec:'30'},{candles:Array(501).fill(candle(start))},{candles:[candle(start+7)]},{candles:[{...candle(start),low:3}]}]) await assert.rejects(uploadCandles(db,{pair:'EURUSD',periodSec:30,candles:[candle(start)],...changes},now),RangeError);
});
// PO stamps candles on its own clock, measured ~2h ahead of UTC. Judging closure by
// OUR clock rejected every real candle; we only bound the skew now.
test('accepts PO clock skew ahead of server time, rejects implausible futures', async () => {
  resetArchiveCap();
  const db={marketCandle:{createMany:async q=>({count:q.data.length})}};
  const ahead=Math.floor((now/1000+7200)/30)*30; // ~2h ahead, as measured live
  assert.deepEqual(await uploadCandles(db,{pair:'EURUSD',periodSec:30,candles:[candle(ahead)]},now),{accepted:true,count:1});
  const tooFar=Math.floor((now/1000+3*86400)/30)*30;
  await assert.rejects(uploadCandles(db,{pair:'EURUSD',periodSec:30,candles:[candle(tooFar)]},now),RangeError);
  const tooOld=Math.floor((now/1000-91*86400)/30)*30;
  await assert.rejects(uploadCandles(db,{pair:'EURUSD',periodSec:30,candles:[candle(tooOld)]},now),RangeError);
});
// The bot trades M1: rejecting period 60 archived nothing at all in the live 2.4.19 run.
test('60-second candles are archived with their own period and alignment', async () => {
  resetArchiveCap();
  let args;const db={marketCandle:{createMany:async q=>(args=q,{count:q.data.length})}};
  const minute=Math.floor((now/1000-3000)/60)*60;
  assert.deepEqual(await uploadCandles(db,{pair:'EURUSD_otc',periodSec:60,candles:[candle(minute)]},now),{accepted:true,count:1});
  assert.equal(args.data[0].periodSec,60);
  // 30s-aligned time is not a valid 60s candle boundary.
  await assert.rejects(uploadCandles(db,{pair:'EURUSD_otc',periodSec:60,candles:[candle(minute+30)]},now),RangeError);
});
test('export selects the requested period and checks contiguity at that period', async () => {
  const minute=Math.floor((now/1000-6000)/60)*60;
  const rows=Array.from({length:20},(_,i)=>candle(minute+i*60));let args;
  const db={marketCandle:{findMany:async q=>(args=q,rows)}};
  await exportCandles(db,{pair:'EURUSD',periodSec:'60',from:String(minute),to:String(minute+1200)});
  assert.equal(args.where.periodSec,60);
  await assert.rejects(exportCandles(db,{pair:'EURUSD',periodSec:'45',from:String(minute),to:String(minute+1200)}),/periodSec must be 30 or 60/);
  rows.splice(5,1);
  await assert.rejects(exportCandles(db,{pair:'EURUSD',periodSec:'60',from:String(minute),to:String(minute+1200)}),/Noncontiguous/);
});
test('admin export roundtrips into real backtester; rejects gaps rather than inventing candles', async () => {
  const rows=Array.from({length:80},(_,i)=>candle(start+i*30));let args;
  const db={marketCandle:{findMany:async q=>(args=q,rows)}};
  const data=await exportCandles(db,{pair:'EURUSD',from:String(start),to:String(start+3000)});
  const {runBacktest}=await import('../../scripts/backtest-signal.mjs');
  assert.equal(runBacktest(JSON.parse(JSON.stringify(data))).evaluated,240);
  assert.deepEqual(args.where.time,{gte:start,lt:start+3000});assert.equal(args.where.periodSec,30);
  rows.splice(5,1);await assert.rejects(exportCandles(db,{pair:'EURUSD',from:String(start),to:String(start+3000)}),/Noncontiguous/);
});
test('market/PO/timing meta survives whitelist, independent of signalSnapshot', () => {
  const meta=sanitizeTradeMeta({market:{rsi:50,sma20:1,regime:'ranging',action:'SKIP',rulesMatched:{call:null,put:2},lastCandle:'green',candleCount:20},po:{dealId:'deal',openPrice:1,closePrice:2,isDemo:true,profit:0.9,secret:'omit'},timeToResultMs:31000,expirySeconds:30,entryDelayMs:25});
  assert.equal(meta.market.action,'SKIP');assert.equal(meta.market.rulesMatched.call,null);assert.equal(meta.po.secret,undefined);assert.equal(meta.timeToResultMs,31000);
});
test('stats compares martingale action/alignment with outcomes and version unknown/timing rates', () => {
  const acc=createAccumulator();
  for(const [result,action,timeToResultMs] of [['win','CALL',30000],['loss','PUT',32000],['unknown','SKIP',null]]) acc.ingest({userId:'u',strategy:'martingale',direction:'call',result,createdAt:new Date(now),meta:{extVersion:'2.4.19',market:{action},...(timeToResultMs==null?{}:{timeToResultMs})}});
  const g=acc.result().groups;
  assert.equal(g.martingaleEngineAction.find(x=>x.value==='CALL').wins,1);
  assert.equal(g.martingaleEngineAlignment.find(x=>x.value==='opposed').losses,1);
  assert.equal(g.extVersion[0].unknownRate,1/3);assert.deepEqual(g.extVersion[0].timeToResultMs,{known:2,mean:31000,max:32000});
});
// In-memory MarketCandle/TradeEvent stand-ins that honour the where/orderBy the pruner uses.
function memDb(candleTimes=[], eventTimes=[]) {
  const deletes={candles:[],events:[]};
  return { deletes, candleTimes, eventTimes,
    marketCandle:{
      findFirst:async({where})=>{const t=candleTimes.filter(x=>x<where.time.lt).sort((a,b)=>a-b)[0];return t==null?null:{time:t};},
      deleteMany:async({where})=>{deletes.candles.push(where.time.lt);const before=candleTimes.length;for(let i=candleTimes.length-1;i>=0;i--)if(candleTimes[i]<where.time.lt)candleTimes.splice(i,1);return {count:before-candleTimes.length};},
    },
    tradeEvent:{
      findFirst:async({where})=>{const t=eventTimes.filter(x=>x<where.createdAt.lt.getTime()).sort((a,b)=>a-b)[0];return t==null?null:{createdAt:new Date(t)};},
      deleteMany:async({where})=>{deletes.events.push(where.createdAt.lt.getTime());const before=eventTimes.length;for(let i=eventTimes.length-1;i>=0;i--)if(eventTimes[i]<where.createdAt.lt.getTime())eventTimes.splice(i,1);return {count:before-eventTimes.length};},
    } };
}
test('candle prune: 30-day cutoff, oldest-first 2h windows, keeps recent rows', async()=>{
  const cutoff=now/1000-30*86400;
  const db=memDb([cutoff-86400, cutoff-86400+30, cutoff-3600, cutoff-30, cutoff, cutoff+30]);
  const {count}=await pruneMarketCandles(db,new Date(now));
  assert.equal(count,4);
  assert.deepEqual(db.candleTimes.sort((a,b)=>a-b),[cutoff,cutoff+30]);
  assert.ok(db.deletes.candles.length>=2,'deletes in several bounded windows');
  assert.ok(db.deletes.candles.every(b=>b<=cutoff),'never deletes at or after the cutoff');
});
test('trade-event prune keeps 180 days', async()=>{
  const cutoff=now-180*86400000;
  const db=memDb([], [cutoff-5*86400000, cutoff-1, cutoff, cutoff+1]);
  assert.equal((await pruneTradeEvents(db,new Date(now))).count,2);
  assert.deepEqual(db.eventTimes.sort((a,b)=>a-b),[cutoff,cutoff+1]);
});
test('retention never overlaps itself and survives a failing prune', async()=>{
  let release;const gate=new Promise(r=>release=r);let finds=0;
  const db={marketCandle:{findFirst:async()=>{finds++;await gate;return null;},deleteMany:async()=>({count:0})},
    tradeEvent:{findFirst:async()=>null,deleteMany:async()=>({count:0})}};
  const r=startRetention(db,{firstDelayMs:1e9,intervalMs:1e9,log:{error(){}}});
  try {
    const first=r.runOnce(new Date(now));
    assert.deepEqual(await r.runOnce(new Date(now)),{skipped:true});
    release();assert.deepEqual(await first,{candles:0,events:0});assert.equal(finds,1);
    const bad=startRetention({marketCandle:{findFirst:async()=>{throw Error('db down');}}},{firstDelayMs:1e9,intervalMs:1e9,log:{error(){}}});
    assert.deepEqual(await bad.runOnce(new Date(now)),{error:'db down'});bad.stop();
  } finally { r.stop(); }
});
test('archive cap: over the cap returns archive_full without writing; health flag is a boolean', async()=>{
  resetArchiveCap();
  let writes=0;const full={$queryRaw:async()=>[{n:2000000n}],marketCandle:{createMany:async()=>{writes++;return {count:1};}}};
  assert.deepEqual(await uploadCandles(full,{pair:'EURUSD',periodSec:30,candles:[candle(start)]},now),{accepted:false,reason:'archive_full'});
  assert.equal(writes,0);assert.deepEqual(archiveCapState(),{capped:true});
  // Cached for 10 minutes, then re-read.
  const under={$queryRaw:async()=>[{n:10n}]};
  assert.equal(await isArchiveFull(under,now+60000),true);
  assert.equal(await isArchiveFull(under,now+11*60000),false);
  resetArchiveCap();
});
test('market route answers 202 when the archive is full', async()=>{
  const prismaPath=require.resolve('../src/lib/prisma'), routePath=require.resolve('../src/routes/market');
  const previous=require.cache[prismaPath], previousRoute=require.cache[routePath];
  resetArchiveCap();
  require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{$queryRaw:async()=>[{n:9e9}],marketCandle:{createMany:async()=>assert.fail('must not write')}}};delete require.cache[routePath];
  try {
    const handler=require(routePath).stack.find(l=>l.route?.path==='/candles').route.stack.at(-1).handle;
    const r=res();await handler({userId:'u',body:{pair:'EURUSD',periodSec:30,candles:[{time:Math.floor(Date.now()/1000/30)*30-300,open:1,high:2,low:1,close:1.5}]}},r);
    assert.equal(r.statusCode,202);assert.equal(r.body.reason,'archive_full');
  } finally {resetArchiveCap();if(previous)require.cache[prismaPath]=previous;else delete require.cache[prismaPath];if(previousRoute)require.cache[routePath]=previousRoute;else delete require.cache[routePath];}
});
test('routes require auth and admin export has both guards', () => {
  const prismaPath=require.resolve('../src/lib/prisma'), previous=require.cache[prismaPath];
  require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{}};
  try {
    const {authMiddleware,adminMiddleware}=require('../src/middleware/auth');
    for(const [file,route] of [['trades','/event'],['market','/candles']]) {
      const router=require('../src/routes/'+file);assert.equal(router.stack.find(l=>l.route?.path===route).route.stack[0].handle,authMiddleware);
    }
    const admin=require('../src/routes/admin');const index=admin.stack.findIndex(l=>l.route?.path==='/market-candles/export');
    assert.ok(admin.stack.slice(0,index).some(l=>l.handle===authMiddleware));assert.ok(admin.stack.slice(0,index).some(l=>l.handle===adminMiddleware));
  } finally {if(previous)require.cache[prismaPath]=previous;else delete require.cache[prismaPath];}
});

test('PO native demo flags normalize and ISO socket timestamps survive', () => {
  assert.deepEqual(sanitizeTradeMeta({po:{isDemo:1,openTime:'2026-09-11T00:00:00Z',closeTime:'2026-09-11T00:00:30.100Z'}}).po, {isDemo:true,openTime:'2026-09-11T00:00:00.000Z',closeTime:'2026-09-11T00:00:30.100Z'});
  assert.deepEqual(sanitizeTradeMeta({po:{isDemo:0,openTime:'bad'}}).po,{isDemo:false});
});
test('event route rejects invalid types before persistence and persists whitelisted session data', async () => {
  const prismaPath=require.resolve('../src/lib/prisma'), routePath=require.resolve('../src/routes/trades');
  const previous=require.cache[prismaPath], previousRoute=require.cache[routePath];let writes=0, saved;
  require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{tradeEvent:{create:async ({data})=>{writes++;saved=data;}}}};delete require.cache[routePath];
  try {
    const handler=require(routePath).stack.find(l=>l.route?.path==='/event').route.stack.at(-1).handle;
    const bad=res();await handler({userId:'u',body:{type:'invalid'}},bad);assert.equal(bad.statusCode,400);assert.equal(writes,0);
    const good=res();await handler({userId:'u',body:{type:'session_stop',isDemo:false,balance:0,extVersion:'2.4.19'}},good);
    assert.equal(good.statusCode,200);assert.equal(writes,1);assert.equal(saved.meta.balance,0);assert.equal(saved.meta.isDemo,false);
  } finally {if(previous)require.cache[prismaPath]=previous;else delete require.cache[prismaPath];if(previousRoute)require.cache[routePath]=previousRoute;else delete require.cache[routePath];}
});

test('stats uses market intensity and actual-side rule count with AI snapshot fallback', () => {
  const acc=createAccumulator();
  acc.ingest({userId:'u',strategy:'martingale',direction:'put',result:'win',createdAt:new Date(now),meta:{market:{intensity:'high',rulesMatched:{call:1,put:3}}}});
  acc.ingest({userId:'u',strategy:'ai',direction:'call',result:'loss',createdAt:new Date(now),signalSnapshot:{intensity:'mid',rulesMatched:4}});
  const g=acc.result().groups;
  assert.equal(g.intensity.find(b=>b.value==='high').wins,1);
  assert.equal(g.intensity.find(b=>b.value==='mid').losses,1);
  assert.equal(g.rulesMatched.find(b=>b.value==='3').wins,1);
  assert.equal(g.rulesMatched.find(b=>b.value==='4').losses,1);
});
