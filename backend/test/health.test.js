const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.WHOP_WEBHOOK_SECRET ||= 'test-whop-webhook-secret';

function loadHealthHandler({ event = null, eventError = null } = {}) {
  let eventQueries = 0;
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
    restore() {
      delete require.cache[indexPath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
      if (originalIndex) require.cache[indexPath] = originalIndex;
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
