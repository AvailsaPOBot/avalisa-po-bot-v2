// Explicit maintenance only. Never called by /log or scheduled on server startup.
async function pruneTrades(prisma, now = new Date()) {
  const cutoff = new Date(now.getTime() - 365 * 86400000);
  return prisma.trade.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
module.exports = { pruneTrades };
