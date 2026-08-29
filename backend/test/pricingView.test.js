const test = require('node:test');
const assert = require('node:assert/strict');

function loadFunnelRouter({ recorder = () => {} } = {}) {
  const prismaPath = require.resolve('../src/lib/prisma');
  const funnelLibPath = require.resolve('../src/lib/funnel');
  const funnelRoutePath = require.resolve('../src/routes/funnel');
  const originalPrisma = require.cache[prismaPath];
  const originalFunnelLib = require.cache[funnelLibPath];

  delete require.cache[funnelRoutePath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {},
  };
  require.cache[funnelLibPath] = {
    id: funnelLibPath,
    filename: funnelLibPath,
    loaded: true,
    exports: { recordFunnelEvent: recorder },
  };
  const router = require('../src/routes/funnel');

  return {
    router,
    restore() {
      delete require.cache[funnelRoutePath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
      if (originalFunnelLib) require.cache[funnelLibPath] = originalFunnelLib;
      else delete require.cache[funnelLibPath];
    },
  };
}

async function postPricingView(router, body) {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      return this;
    },
  };
  const handler = router.stack.find((layer) => layer.route?.path === '/pricing-view').route.stack[0].handle;
  await handler({ body }, response);
  return response;
}

test('pricing view records exactly one fixed funnel event and returns 204', async () => {
  const calls = [];
  const { router, restore } = loadFunnelRouter({
    recorder: (...args) => calls.push(args),
  });

  try {
    const response = await postPricingView(router);
    assert.equal(response.statusCode, 204);
    assert.deepEqual(calls, [[{}, 'pricing_view']]);
  } finally {
    restore();
  }
});

test('a broken pricing-view recorder still returns 204', async () => {
  const { router, restore } = loadFunnelRouter({
    recorder: () => { throw new Error('analytics unavailable'); },
  });

  try {
    const response = await postPricingView(router);
    assert.equal(response.statusCode, 204);
  } finally {
    restore();
  }
});

test('pricing view ignores a posted body and records only the fixed event', async () => {
  const calls = [];
  const { router, restore } = loadFunnelRouter({
    recorder: (...args) => calls.push(args),
  });

  try {
    const response = await postPricingView(router, {
      type: 'checkout_click',
      meta: { plan: 'enterprise' },
      arbitrary: 'event-writer-attempt',
    });
    assert.equal(response.statusCode, 204);
    assert.deepEqual(calls, [[{}, 'pricing_view']]);
  } finally {
    restore();
  }
});
