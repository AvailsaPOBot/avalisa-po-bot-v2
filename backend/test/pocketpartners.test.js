const test = require('node:test');
const assert = require('node:assert/strict');

function loadPocketPartnersRouter({ recorder = () => {} } = {}) {
  const upserts = [];
  const prisma = {
    affiliateReferral: {
      upsert: async (args) => {
        upserts.push(args);
        return args.create;
      },
    },
    user: { findUnique: async () => null },
    license: { upsert: async () => ({}) },
  };
  const prismaPath = require.resolve('../src/lib/prisma');
  const funnelLibPath = require.resolve('../src/lib/funnel');
  const routePath = require.resolve('../src/routes/pocketpartners');
  const originalPrisma = require.cache[prismaPath];
  const originalFunnelLib = require.cache[funnelLibPath];

  delete require.cache[routePath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  require.cache[funnelLibPath] = {
    id: funnelLibPath,
    filename: funnelLibPath,
    loaded: true,
    exports: { recordFunnelEvent: recorder },
  };
  const router = require('../src/routes/pocketpartners');

  return {
    router,
    upserts,
    restore() {
      delete require.cache[routePath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
      if (originalFunnelLib) require.cache[funnelLibPath] = originalFunnelLib;
      else delete require.cache[funnelLibPath];
    },
  };
}

async function postback(router, query) {
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
  };
  const handler = router.stack.find((layer) => layer.route?.path === '/').route.stack[0].handle;
  await handler({ query }, response);
  return response;
}

async function withPostbackSecret(secret, fn) {
  const original = process.env.POCKETPARTNERS_SECRET;
  if (secret === undefined) delete process.env.POCKETPARTNERS_SECRET;
  else process.env.POCKETPARTNERS_SECRET = secret;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.POCKETPARTNERS_SECRET;
    else process.env.POCKETPARTNERS_SECRET = original;
  }
}

test('missing or invalid PocketPartners token remains opaque and records exactly one rejection event', async () => {
  for (const token of [undefined, 'wrong-secret']) {
    const calls = [];
    const loaded = loadPocketPartnersRouter({ recorder: (...args) => calls.push(args) });
    try {
      await withPostbackSecret('correct-secret', async () => {
        const response = await postback(loaded.router, { event: 'Registration', trader_id: 'po_123', token });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, { ok: true });
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0][1], 'affiliate_postback_rejected');
      assert.equal(loaded.upserts.length, 0);
    } finally {
      loaded.restore();
    }
  }
});

test('a valid PocketPartners postback upserts its referral without recording a rejection', async () => {
  const calls = [];
  const loaded = loadPocketPartnersRouter({ recorder: (...args) => calls.push(args) });
  try {
    await withPostbackSecret('correct-secret', async () => {
      const response = await postback(loaded.router, {
        event: 'Registration',
        trader_id: 'po_123',
        token: 'correct-secret',
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body, { ok: true });
    });
    assert.deepEqual(calls, []);
    assert.deepEqual(loaded.upserts, [{
      where: { poUid: 'po_123' },
      update: { event: 'Registration' },
      create: { poUid: 'po_123', event: 'Registration' },
    }]);
  } finally {
    loaded.restore();
  }
});


// Regression for the case-sensitivity bug found 2026-09-02 by reading our OWN AffiliateReferral
// table: PocketPartners sends BOTH "Registration" (1-9 rows) and "registration" (10-99 rows).
// The grant branch compared exactly, so the MAJORITY of real referrals were stored and then
// silently ignored — those users stayed on demo owing a Pro they had earned.
function loadWithLinkedUser() {
  const licenseUpserts = [];
  const prisma = {
    affiliateReferral: { upsert: async (a) => a.create },
    user: { findUnique: async () => ({ id: 'user_1' }) },
    license: { upsert: async (a) => { licenseUpserts.push(a); return {}; } },
  };
  const prismaPath = require.resolve('../src/lib/prisma');
  const funnelLibPath = require.resolve('../src/lib/funnel');
  const routePath = require.resolve('../src/routes/pocketpartners');
  const originalPrisma = require.cache[prismaPath];
  const originalFunnelLib = require.cache[funnelLibPath];
  delete require.cache[routePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[funnelLibPath] = {
    id: funnelLibPath, filename: funnelLibPath, loaded: true, exports: { recordFunnelEvent: () => {} },
  };
  const router = require('../src/routes/pocketpartners');
  return {
    router,
    licenseUpserts,
    restore() {
      delete require.cache[routePath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma; else delete require.cache[prismaPath];
      if (originalFunnelLib) require.cache[funnelLibPath] = originalFunnelLib; else delete require.cache[funnelLibPath];
    },
  };
}

test('a registration postback grants Pro regardless of the casing PocketPartners sends', async () => {
  // Both casings are REAL: measured in production, "registration" outnumbers "Registration".
  for (const event of ['Registration', 'registration', 'REGISTRATION']) {
    const loaded = loadWithLinkedUser();
    try {
      await withPostbackSecret('correct-secret', async () => {
        await postback(loaded.router, { event, trader_id: 'po_777', token: 'correct-secret' });
      });
      assert.equal(loaded.licenseUpserts.length, 1, `no Pro grant for event "${event}"`);
      assert.equal(loaded.licenseUpserts[0].where.userId, 'user_1');
    } finally {
      loaded.restore();
    }
  }
});

test('a non-registration event is still stored but grants nothing', async () => {
  const loaded = loadWithLinkedUser();
  try {
    await withPostbackSecret('correct-secret', async () => {
      await postback(loaded.router, { event: 'Deposit', trader_id: 'po_888', token: 'correct-secret' });
    });
    assert.equal(loaded.licenseUpserts.length, 0, 'only registration may grant Pro');
  } finally {
    loaded.restore();
  }
});
