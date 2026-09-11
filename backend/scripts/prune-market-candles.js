// Manual one-shot retention (the server also runs this daily via startRetention).
const { pruneMarketCandles, pruneTradeEvents } = require('../src/lib/tradingTelemetry');
if (require.main === module) {
  const prisma = require('../src/lib/prisma');
  (async () => ({ candles: (await pruneMarketCandles(prisma)).count, events: (await pruneTradeEvents(prisma)).count }))()
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
