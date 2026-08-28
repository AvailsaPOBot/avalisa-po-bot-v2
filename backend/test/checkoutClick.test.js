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

async function postCheckoutClick(router, plan) {
  const response = {
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
    end() {
      return this;
    },
  };
  const handler = router.stack.find((layer) => layer.route?.path === '/checkout-click').route.stack[0].handle;
  await handler({ body: { plan } }, response);
  return response;
}

test('Basic checkout click records exactly one whitelisted funnel event', async () => {
  const calls = [];
  const { router, restore } = loadFunnelRouter({
    recorder: (...args) => calls.push(args),
  });

  try {
    const response = await postCheckoutClick(router, 'basic');
    assert.equal(response.statusCode, 204);
    assert.deepEqual(calls, [[{}, 'checkout_click', { meta: { plan: 'basic' } }]]);
  } finally {
    restore();
  }
});

test('Pro checkout click records exactly one whitelisted funnel event', async () => {
  const calls = [];
  const { router, restore } = loadFunnelRouter({
    recorder: (...args) => calls.push(args),
  });

  try {
    const response = await postCheckoutClick(router, 'pro');
    assert.equal(response.statusCode, 204);
    assert.deepEqual(calls, [[{}, 'checkout_click', { meta: { plan: 'pro' } }]]);
  } finally {
    restore();
  }
});

test('unknown checkout plans are rejected and record nothing', async () => {
  for (const plan of ['enterprise', '', null, 'https://example.com/checkout']) {
    const calls = [];
    const { router, restore } = loadFunnelRouter({
      recorder: (...args) => calls.push(args),
    });

    try {
      const response = await postCheckoutClick(router, plan);
      assert.equal(response.statusCode, 400, String(plan));
      assert.equal(calls.length, 0, String(plan));
    } finally {
      restore();
    }
  }
});

test('a broken recorder still returns 204 to the buyer', async () => {
  const { router, restore } = loadFunnelRouter({
    recorder: () => { throw new Error('analytics unavailable'); },
  });

  try {
    const response = await postCheckoutClick(router, 'basic');
    assert.equal(response.statusCode, 204);
  } finally {
    restore();
  }
});
