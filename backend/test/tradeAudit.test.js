const test=require('node:test');
const assert=require('node:assert/strict');
function response(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
async function route(db, path, body){
 const p=require.resolve('../src/lib/prisma'), r=require.resolve('../src/routes/trades');
 const old=require.cache[p], oldRoute=require.cache[r];
 require.cache[p]={id:p,filename:p,loaded:true,exports:db};delete require.cache[r];
 try {const h=require(r).stack.find(l=>l.route?.path===path).route.stack.at(-1).handle; const res=response();await h({body,userId:'u',user:{},params:{id:'trade'}},res);return res;} finally {if(old)require.cache[p]=old;else delete require.cache[p];if(oldRoute)require.cache[r]=oldRoute;else delete require.cache[r];}
}
const valid={pair:'EURUSD',direction:'call',amount:1,result:'win',isDemo:true};
test('trade log rejects malformed data before touching database',async()=>{
 let calls=0;const db={trade:{create:async()=>{calls++;return {};}}};
 for(const bad of [{amount:'1oops'},{amount:Infinity},{amount:-1},{direction:{}},{result:'madeup'},{pair:{}},{balanceAfter:'oops'},{isDemo:[]},{strategy:{}},{signalSnapshot:'text'},null]) {
 const res=await route(db,'/log',bad===null?null:{...valid,...bad});assert.equal(res.statusCode,400,JSON.stringify(bad));
 }
 assert.equal(calls,0);
});
test('trade update stores zero balance and rejects malformed result before database',async()=>{
 let saved,calls=0;const db={trade:{updateMany:async({data})=>{saved=data;calls++;return {count:1};}}};
 assert.equal((await route(db,'/:id',{result:'loss',balanceAfter:0})).statusCode,200);assert.equal(saved.balanceAfter,0);
 assert.equal((await route(db,'/:id',{result:{set:'win'},balanceAfter:'bad'})).statusCode,400);assert.equal(calls,1);
});
test('failed AI trade insert rolls quota back in same transaction',async()=>{
 let used=0,transactions=0;
 const db={license:{findUnique:async()=>({plan:'basic',aiTradesAllowance:10}),updateMany:async()=>{used++;return {count:1};}},trade:{create:async()=>{throw Error('insert failed');}}};
 db.$transaction=async fn=>{transactions++;const prior=used;try{return await fn(db);}catch(e){used=prior;throw e;}};
 assert.equal((await route(db,'/log',{...valid,isDemo:false,signalSnapshot:{action:'CALL'}})).statusCode,500);
 assert.equal(used,0);assert.equal(transactions,1);
});
