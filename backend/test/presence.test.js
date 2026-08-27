const test = require('node:test');
const assert = require('node:assert/strict');

const presence = require('../src/lib/presence');

function withMockedNow(value, run) {
  const originalNow = Date.now;
  Date.now = () => value;
  try {
    return run();
  } finally {
    Date.now = originalNow;
  }
}

test('touch records presence within the window but not outside it', () => {
  presence._resetForTest();
  withMockedNow(1_000, () => presence.touch('user_1'));

  withMockedNow(1_500, () => assert.equal(presence.isOnline('user_1', 500), true));
  withMockedNow(1_501, () => assert.equal(presence.isOnline('user_1', 500), false));
});

test('presence stays bounded and retains the newest entry after the cap', () => {
  presence._resetForTest();
  withMockedNow(5_000, () => {
    for (let index = 0; index <= 10_000; index += 1) presence.touch(`user_${index}`);
    assert.equal(presence.onlineCount(60 * 60 * 1000), 10_000);
    assert.equal(presence.isOnline('user_0', 60 * 60 * 1000), false);
    assert.equal(presence.isOnline('user_10000', 60 * 60 * 1000), true);
  });
});

test('presence never throws for null or undefined user IDs', () => {
  presence._resetForTest();
  assert.doesNotThrow(() => presence.touch(null));
  assert.doesNotThrow(() => presence.touch(undefined));
  assert.equal(presence.onlineCount(), 0);
});

test('an anonymous licence check records no presence', async () => {
  presence._resetForTest();
  const prismaPath = require.resolve('../src/lib/prisma');
  const licensePath = require.resolve('../src/routes/license');
  const originalPrismaModule = require.cache[prismaPath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
    deviceFingerprint: {
      findUnique: async () => null,
      create: async ({ data }) => ({ ...data, freeTradesUsed: 0 }),
    },
    },
  };
  delete require.cache[licensePath];

  try {
    const router = require('../src/routes/license');
    const checkLayer = router.stack.find(layer => layer.route?.path === '/check' && layer.route.methods.post);
    const checkHandler = checkLayer.route.stack.at(-1).handle;
    let payload;
    await checkHandler(
      { userId: undefined, body: { deviceFingerprint: 'anonymous-device' } },
      { json: body => { payload = body; return body; }, status: () => ({ json: body => { payload = body; return body; } }) },
    );

    assert.equal(payload.plan, 'free');
    assert.equal(presence.onlineCount(60 * 60 * 1000), 0);
  } finally {
    if (originalPrismaModule) require.cache[prismaPath] = originalPrismaModule;
    else delete require.cache[prismaPath];
    delete require.cache[licensePath];
  }
});
