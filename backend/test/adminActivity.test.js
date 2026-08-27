const test = require('node:test');
const assert = require('node:assert/strict');

const { getActivitySummary } = require('../src/lib/adminActivity');

test('activity buckets are mutually exclusive and use the later trade or settings timestamp', async () => {
  const now = new Date('2026-08-27T12:00:00.000Z');
  const daysAgo = days => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prisma = {
    user: { count: async () => 5 },
    trade: {
      groupBy: async () => [
        { userId: 'one-hour', _max: { createdAt: daysAgo(2) } },
        { userId: 'three-days', _max: { createdAt: daysAgo(3) } },
        { userId: 'ninety-days', _max: { createdAt: daysAgo(90) } },
      ],
    },
    settings: {
      findMany: async () => [
        { userId: 'one-hour', updatedAt: new Date(now.getTime() - 60 * 60 * 1000) },
        { userId: 'twenty-days', updatedAt: daysAgo(20) },
      ],
    },
  };

  const summary = await getActivitySummary(prisma, now);

  assert.deepEqual(summary, {
    totalUsers: 5,
    everTraded: 3,
    active24h: 1,
    active7d: 1,
    active30d: 1,
    dormant: 1,
    neverActive: 1,
  });
  assert.equal(summary.active24h + summary.active7d + summary.active30d + summary.dormant + summary.neverActive, summary.totalUsers);
});
