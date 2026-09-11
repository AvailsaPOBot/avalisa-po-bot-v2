// Destructive maintenance command; run only with explicit database authorization.
// This file is not wired to startup or any request path.
const prisma = require('../src/lib/prisma');
const { pruneTrades } = require('../src/lib/tradeRetention');
if (require.main === module) {
  pruneTrades(prisma).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
