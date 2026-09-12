const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.AVALISA_LIFECYCLE_SOURCE || 'extension/content.js','utf8');
function section(a,b){ return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))); }
function harness(saved){
 const state={running:false,stopRequested:false,cycleGeneration:0,settings:{startAmount:1}};
 const timers=[]; const phases=[];
 const ctx=vm.createContext({state,console,Date, RUNTIME_SESSION_MAX_AGE_MS:600000,
 loadRuntimeSession:async()=>saved,clearRuntimeSession:async()=>{},getDefaultSettings:()=>({startAmount:1}),
 updateUI(){},updateTradeCounter(){},updateStatus(){},updateBottomStatus(){},
 persistRuntimeSession:async p=>{phases.push(p);return true;},
 clearPausedLadder:async()=>{},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
 window:{confirm:()=>false},diagnosePOInterface(){throw Error('Start passed guard');}});
 vm.runInContext(section('function isCycleActive','// v2.4.8: a single balance')+section('async function restoreRuntimeSession','// Merge-seed')+section('async function startBot','async function saveCurrentSettings'),ctx);
 return {ctx,state,timers,phases};
}
test('unresolved snapshots survive age and stop flags and require explicit reconciliation before Start',async()=>{
 for(const extra of [{},{savedAt:1},{running:false,stopRequested:true}]){
 const h=harness({running:true,phase:'order_pending',savedAt:Date.now(),...extra});
 await h.ctx.restoreRuntimeSession();
 assert.equal(h.state.reconciliationRequired,true);
 await h.ctx.startBot();
 assert.equal(h.state.running,false);
 }
});
test('deferred Stop watchdog ends a hung cycle without erasing unresolved trade',async()=>{
 const h=harness(null);h.state.running=true;h.ctx.setTradeLock('trade_open');
 h.ctx.stopBot(); assert.equal(h.state.stopAfterTrade,true);
 assert.ok(h.timers.length,'Stop must schedule a watchdog');
 await h.timers.at(-1)();
 assert.equal(h.state.running,false);assert.equal(h.state.stopAfterTrade,false);
 assert.equal(h.state.reconciliationRequired,true);assert.ok(h.phases.includes('unresolved'));
 const generation=h.state.cycleGeneration;h.ctx.stopBot();
 assert.equal(h.state.reconciliationRequired,true);assert.equal(h.state.cycleGeneration,generation);
});
test('unknown result exits into quarantine before resolved persistence or ladder application',()=>{
 const body=section('  const result = await resolveTradeResult','// v2.3.1: stronger guard');
 assert.match(body,/if \(result === 'unknown'\) \{\s*await quarantineUnresolvedTrade/);
 assert.ok(body.indexOf('await quarantineUnresolvedTrade')<body.indexOf('applyMartingaleLogic(result)'));
});
test('order pending is durably written before click and persistence failure prevents click',()=>{
 const body=section('  const clickedAt = Date.now();','  // PO can delay');
 assert.ok(body.indexOf("persistRuntimeSession('order_pending')")<body.indexOf('clickCall()'));
 assert.match(body,/if \(!await persistRuntimeSession/);
});
test('restore cannot overwrite a Start or Stop that happened during storage read',async()=>{
 const h=harness({running:true,phase:'resolved',savedAt:Date.now()});
 let release;h.ctx.loadRuntimeSession=()=>new Promise(r=>{release=r;});
 const pending=h.ctx.restoreRuntimeSession();h.state.cycleGeneration++;
 release({running:true,phase:'resolved',savedAt:Date.now()});await pending;
 assert.equal(h.state.running,false);assert.equal(h.timers.length,0);
});
test('unknown never applies a result or releases into a next cycle',async()=>{
 const h=harness(null);h.state.running=true;
 Object.assign(h.ctx,{generation:0,result:'unknown',tradeMeta:{},balanceBefore:100,balanceDuringTrade:99,
 safeAmount:1,tradeStartTs:1,preTradeSignatures:[],clickedAt:1,
 resolveTradeResult:async()=> 'unknown',getBalance:async()=>null,
 applyMartingaleLogic(){throw Error('unknown applied');},sleep:async()=>{},
 runTradeCycle(){throw Error('duplicate cycle');}});
 vm.runInContext('async function finish(){'+section('  const result = await resolveTradeResult','// v2.3.1: stronger guard'),h.ctx);
 await h.ctx.finish();
 assert.equal(h.state.running,false);assert.equal(h.state.reconciliationRequired,true);
 assert.deepEqual(h.phases,['unresolved']);
});
test('failed storage write prevents the actual click',async()=>{
 const h=harness(null);let clicks=0;
 Object.assign(h.ctx,{generation:0,direction:'call',
 persistRuntimeSession:async()=>false,clickCall:()=>{clicks++;},clickPut:()=>{clicks++;}});
 h.state.running=true;
 vm.runInContext('async function place(){'+section("  setTradeLock('order_pending');",'  // PO can delay')+'}',h.ctx);
 await h.ctx.place();assert.equal(clicks,0);assert.equal(h.state.reconciliationRequired,true);
});
test('a full deal identity ledger stops before any additional trade',async()=>{
 const h=harness(null);h.state.running=true;h.state.usedDealIds=new Set(Array.from({length:4096},(_,i)=>String(i)));
 Object.assign(h.ctx,{preservePausedLadder:async()=>{},checkLicense:async()=>{throw Error('capacity guard missed');}});
 vm.runInContext(section('async function runTradeCycleUnsafe','// v2.3.1: stronger guard'),h.ctx);
 await h.ctx.runTradeCycleUnsafe(0);
 assert.equal(h.state.running,false);assert.equal(h.state.usedDealIds.size,4096);
});
test('scheduled error reload is canceled by Stop',async()=>{
 const h=harness(null);h.state.running=true;h.state.cycleErrorStreak=2;
 let reloads=0;
 Object.assign(h.ctx,{MAX_CYCLE_ERROR_RETRIES:2,window:{location:{reload(){reloads++;}}}});
 vm.runInContext(section('async function handleTradeCycleError','async function chooseAvalisaOpportunity'),h.ctx);
 await h.ctx.handleTradeCycleError(Error('page failure'),0);
 assert.equal(h.timers.length,1);h.ctx.stopBot();h.timers[0]();assert.equal(reloads,0);
});
test('cycle error while order is in flight preserves quarantine instead of enabling retry',async()=>{
 const h=harness(null);h.state.running=true;h.ctx.setTradeLock('trade_open');
 Object.assign(h.ctx,{MAX_CYCLE_ERROR_RETRIES:2,preservePausedLadder:async()=>{}});
 vm.runInContext(section('async function handleTradeCycleError','async function chooseAvalisaOpportunity'),h.ctx);
 await h.ctx.handleTradeCycleError(Error('resolver failed'),0);
 assert.equal(h.state.reconciliationRequired,true);assert.deepEqual(h.phases,['unresolved']);
});
