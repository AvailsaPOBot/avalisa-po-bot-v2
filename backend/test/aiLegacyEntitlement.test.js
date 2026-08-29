const test = require('node:test');
const assert = require('node:assert/strict');

function loadAiRouter(license) {
  const prismaPath = require.resolve('../src/lib/prisma');
  const routePath = require.resolve('../src/routes/ai');
  const originalPrisma = require.cache[prismaPath];

  delete require.cache[routePath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { license: { findUnique: async () => license } },
  };
  const router = require('../src/routes/ai');

  return {
    router,
    restore() {
      delete require.cache[routePath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
    },
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
  };
}

test('AI signal rejects post-cutoff Basic licences with the upgrade URL', async () => {
  const route = loadAiRouter({
    plan: 'basic',
    createdAt: '2026-08-30T00:00:00.000Z',
    aiTradesUsed: 0,
  });

  try {
    const signalRoute = route.router.stack.find((layer) => layer.route?.path === '/signal').route;
    const res = response();
    await signalRoute.stack.at(-1).handle({ userId: 'user_123', user: {} }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.upgradeUrl, 'https://avalisabot.vercel.app/pricing');
  } finally {
    route.restore();
  }
});
