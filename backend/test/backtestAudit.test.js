const test=require('node:test');
const assert=require('node:assert/strict');
test('backtester rejects fractional, negative and misaligned Unix candle timestamps',async()=>{
 const {runBacktest}=await import('../../scripts/backtest-signal.mjs');
 for(const time of [0.5,-30,31]) assert.throws(()=>runBacktest({EURUSD:[{time,open:1,high:2,low:1,close:1.5}]}),/invalid OHLC|timestamp/);
});
