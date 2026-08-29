const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.WHOP_WEBHOOK_SECRET ||= 'test-whop-webhook-secret';

function loadHealthHandler({ event = null, eventError = null, referral = null, referralError = null, postbackSecret } = {}) {
  let eventQueries = 0;
  let referralQueries = 0;
  const originalPostbackSecret = process.env.POCKETPARTNERS_SECRET;
  if (postbackSecret === undefined) delete process.env.POCKETPARTNERS_SECRET;
  else process.env.POCKETPARTNERS_SECRET = postbackSecret;
  const prisma = {
    $queryRaw: async () => 1,
    appConfig: {
      findUnique: async () => ({ value: 'true' }),
    },
    funnelEvent: {
      findFirst: async (args) => {
        eventQueries += 1;
        assert.deepEqual(args, { select: { id: true } });
        if (eventError) throw eventError;
        return event;
      },
    },
    affiliateReferral: {
      findFirst: async (args) => {
        referralQueries += 1;
        assert.deepEqual(args, { select: { id: true } });
        if (referralError) throw referralError;
        return referral;
      },
    },
  };
  const prismaPath = require.resolve('../src/lib/prisma');
  const indexPath = require.resolve('../src/index');
  const originalPrisma = require.cache[prismaPath];
  const originalIndex = require.cache[indexPath];

  delete require.cache[indexPath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  const { app } = require('../src/index');
  const handler = app._router.stack.find((layer) => layer.route?.path === '/health').route.stack[0].handle;

  return {
    async health() {
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
      await handler({}, response);
      return response;
    },
    eventQueries: () => eventQueries,
    referralQueries: () => referralQueries,
    restore() {
      delete require.cache[indexPath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
      if (originalIndex) require.cache[indexPath] = originalIndex;
      else delete require.cache[indexPath];
      if (originalPostbackSecret === undefined) delete process.env.POCKETPARTNERS_SECRET;
      else process.env.POCKETPARTNERS_SECRET = originalPostbackSecret;
    },
  };
}

test('health reports an existing funnel table with recorded events', async () => {
  const loaded = loadHealthHandler({ event: { id: 'evt_1' } });
  try {
    const response = await loaded.health();
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.funnel, { enabled: true, table: 'ok', everRecorded: true });
  } finally {
    loaded.restore();
  }
});

test('health reports an empty but available funnel table', async () => {
  const loaded = loadHealthHandler();
  try {
    const response = await loaded.health();
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.funnel, { enabled: true, table: 'ok', everRecorded: false });
  } finally {
    loaded.restore();
  }
});

test('a missing FunnelEvent table does not degrade health', async () => {
  const loaded = loadHealthHandler({ eventError: new Error('relation "FunnelEvent" does not exist') });
  try {
    const response = await loaded.health();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'ok');
    assert.deepEqual(response.body.funnel, { enabled: false, table: 'missing', everRecorded: false });
  } finally {
    loaded.restore();
  }
});

test('health funnel response contains liveness values only', async () => {
  const loaded = loadHealthHandler({ event: { id: 'evt_1' } });
  try {
    const { funnel } = (await loaded.health()).body;
    assert.deepEqual(Object.keys(funnel).sort(), ['enabled', 'everRecorded', 'table']);
    for (const value of Object.values(funnel)) {
      assert.ok(typeof value === 'boolean' || value === 'ok' || value === 'missing');
    }
  } finally {
    loaded.restore();
  }
});

test('health caches funnel liveness for 60 seconds', async () => {
  const loaded = loadHealthHandler({ event: { id: 'evt_1' } });
  try {
    await loaded.health();
    await loaded.health();
    assert.equal(loaded.eventQueries(), 1);
  } finally {
    loaded.restore();
  }
});

test('health reports whether the affiliate postback secret is configured', async () => {
  const configured = loadHealthHandler({ postbackSecret: 'test-postback-secret' });
  try {
    assert.equal((await configured.health()).body.affiliate.postbackSecretSet, true);
  } finally {
    configured.restore();
  }

  const unconfigured = loadHealthHandler();
  try {
    assert.equal((await unconfigured.health()).body.affiliate.postbackSecretSet, false);
  } finally {
    unconfigured.restore();
  }
});

test('health reports whether any affiliate referral has been received', async () => {
  const referred = loadHealthHandler({ referral: { id: 'ref_1' } });
  try {
    const response = await referred.health();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.affiliate.everReferred, true);
  } finally {
    referred.restore();
  }

  const empty = loadHealthHandler();
  try {
    assert.equal((await empty.health()).body.affiliate.everReferred, false);
  } finally {
    empty.restore();
  }
});

test('a failed affiliate referral probe does not degrade health', async () => {
  const loaded = loadHealthHandler({ referralError: new Error('relation "AffiliateReferral" does not exist') });
  try {
    const response = await loaded.health();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'ok');
    assert.deepEqual(response.body.affiliate, { postbackSecretSet: false, everReferred: false });
  } finally {
    loaded.restore();
  }
});

test('health affiliate response contains booleans only', async () => {
  const loaded = loadHealthHandler({ postbackSecret: 'test-postback-secret', referral: { id: 'ref_1' } });
  try {
    const { affiliate } = (await loaded.health()).body;
    assert.deepEqual(Object.keys(affiliate).sort(), ['everReferred', 'postbackSecretSet']);
    for (const value of Object.values(affiliate)) {
      assert.equal(typeof value, 'boolean');
    }
  } finally {
    loaded.restore();
  }
});

test('health caches affiliate liveness for 60 seconds', async () => {
  const loaded = loadHealthHandler({ referral: { id: 'ref_1' } });
  try {
    await loaded.health();
    await loaded.health();
    assert.equal(loaded.referralQueries(), 1);
  } finally {
    loaded.restore();
  }
});
