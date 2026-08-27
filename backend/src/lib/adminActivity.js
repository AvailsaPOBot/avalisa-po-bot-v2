function latestDate(first, second) {
  if (!first) return second || null;
  if (!second) return first;
  return new Date(first) >= new Date(second) ? first : second;
}

async function getLastActiveByUser(prisma, userIds) {
  const where = userIds ? { userId: { in: userIds } } : undefined;
  const [trades, settings] = await Promise.all([
    prisma.trade.groupBy({ by: ['userId'], _max: { createdAt: true }, ...(where && { where }) }),
    prisma.settings.findMany({ ...(where && { where }), select: { userId: true, updatedAt: true } }),
  ]);

  const lastActiveByUser = new Map();
  for (const trade of trades) lastActiveByUser.set(trade.userId, trade._max.createdAt);
  for (const setting of settings) {
    lastActiveByUser.set(setting.userId, latestDate(lastActiveByUser.get(setting.userId), setting.updatedAt));
  }
  return { lastActiveByUser, everTraded: new Set(trades.map(trade => trade.userId)) };
}

async function getActivitySummary(prisma, now = new Date()) {
  const [totalUsers, activity] = await Promise.all([
    prisma.user.count(),
    getLastActiveByUser(prisma),
  ]);
  const cutoffs = {
    active24h: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    active7d: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    active30d: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
  };
  const buckets = { active24h: 0, active7d: 0, active30d: 0, dormant: 0, neverActive: 0 };

  for (const lastActiveAt of activity.lastActiveByUser.values()) {
    const date = new Date(lastActiveAt);
    if (date >= cutoffs.active24h) buckets.active24h += 1;
    else if (date >= cutoffs.active7d) buckets.active7d += 1;
    else if (date >= cutoffs.active30d) buckets.active30d += 1;
    else buckets.dormant += 1;
  }
  buckets.neverActive = totalUsers - activity.lastActiveByUser.size;

  return { totalUsers, everTraded: activity.everTraded.size, ...buckets };
}

module.exports = { getLastActiveByUser, getActivitySummary };
