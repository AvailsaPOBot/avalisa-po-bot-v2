const test = require('node:test');
const assert = require('node:assert/strict');

const {
  recordFunnelEvent,
  getFunnelSummary,
  _resetCacheForTest,
} = require('../src/lib/funnel');

function mockPrisma({ flag = null, groups = [] } = {}) {
  const created = [];
  return {
    created,
    appConfig: {
      findUnique: async () => (flag === null ? null : { value: flag }),
    },
    funnelEvent: {
      create: async ({ data }) => {
        created.push(data);
        return { id: 'evt_1', ...data };
      },
      groupBy: async () => groups,
    },
  };
}

test('funnel is OFF by default (no config row) → recordFunnelEvent is a no-op', async () => {
  _resetCacheForTest();
  const prisma = mockPrisma({ flag: null });
  const wrote = await recordFunnelEvent(prisma, 'signup', { userId: 'u1' });
  assert.equal(wrote, false);
  assert.equal(prisma.created.length, 0);
});

test('funnel OFF when flag is any value other than "true"', async () => {
  _resetCacheForTest();
  const prisma = mockPrisma({ flag: 'false' });
  const wrote = await recordFunnelEvent(prisma, 'signup');
  assert.equal(wrote, false);
  assert.equal(prisma.created.length, 0);
});

test('funnel ON → event recorded with type/userId/meta', async () => {
  _resetCacheForTest();
  const prisma = mockPrisma({ flag: 'true' });
  const wrote = await recordFunnelEvent(prisma, 'signup', { userId: 'u1' });
  assert.equal(wrote, true);
  assert.deepEqual(prisma.created[0], { type: 'signup', userId: 'u1', meta: null });
});

test('recordFunnelEvent NEVER throws even if the DB write fails', async () => {
  _resetCacheForTest();
  const prisma = {
    appConfig: { findUnique: async () => ({ value: 'true' }) },
    funnelEvent: { create: async () => { throw new Error('relation "FunnelEvent" does not exist'); } },
  };
  const wrote = await recordFunnelEvent(prisma, 'signup');
  assert.equal(wrote, false);
});

test('missing type is ignored', async () => {
  _resetCacheForTest();
  const prisma = mockPrisma({ flag: 'true' });
  const wrote = await recordFunnelEvent(prisma, undefined, { userId: 'u1' });
  assert.equal(wrote, false);
  assert.equal(prisma.created.length, 0);
});

test('getFunnelSummary maps grouped counts and sorts by count desc', async () => {
  const prisma = mockPrisma({
    groups: [
      { type: 'signup', _count: { _all: 5 } },
      { type: 'login', _count: { _all: 12 } },
      { type: 'affiliate_link_served', _count: { _all: 8 } },
    ],
  });
  const summary = await getFunnelSummary(prisma);
  assert.deepEqual(summary, [
    { type: 'login', count: 12 },
    { type: 'affiliate_link_served', count: 8 },
    { type: 'signup', count: 5 },
  ]);
});
