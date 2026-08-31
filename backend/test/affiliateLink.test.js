const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { AFFILIATE_LINK } = require('../src/lib/affiliateLink');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
  });
}

function loadConfigRouter(prisma) {
  const prismaPath = require.resolve('../src/lib/prisma');
  const funnelPath = require.resolve('../src/lib/funnel');
  const configPath = require.resolve('../src/routes/config');
  const originalPrisma = require.cache[prismaPath];
  const originalFunnel = require.cache[funnelPath];

  delete require.cache[configPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[funnelPath] = {
    id: funnelPath,
    filename: funnelPath,
    loaded: true,
    exports: { recordFunnelEvent: () => {} },
  };

  return {
    router: require('../src/routes/config'),
    restore() {
      delete require.cache[configPath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
      if (originalFunnel) require.cache[funnelPath] = originalFunnel;
      else delete require.cache[funnelPath];
    },
  };
}

async function getAffiliateLink(router) {
  const response = { body: null, json(body) { this.body = body; } };
  const handler = router.stack.find((layer) => layer.route?.path === '/affiliate-link').route.stack[0].handle;
  await handler({}, response);
  return response.body.url;
}

test('affiliate URL literal appears exactly once across backend source', () => {
  const sourceDirectory = path.join(__dirname, '../src');
  const occurrences = sourceFiles(sourceDirectory)
    .filter((file) => file.endsWith('.js'))
    .flatMap((file) => fs.readFileSync(file, 'utf8').match(/u3\.shortink\.io/g) || []);

  assert.equal(occurrences.length, 1);
});

test('backend affiliate consumers use the shared URL', async () => {
  const { getRegisterUrl } = require('../src/lib/claimGuidance');
  const { router, restore } = loadConfigRouter({
    appConfig: { findUnique: async () => null },
  });
  const supportPath = require.resolve('../src/routes/support');
  delete require.cache[supportPath];
  const support = require('../src/routes/support');

  try {
    assert.equal(await getAffiliateLink(router), AFFILIATE_LINK);
    assert.equal(await getRegisterUrl({ appConfig: { findUnique: async () => null } }), AFFILIATE_LINK);
    assert.match(support.__test.SYSTEM_PROMPT, new RegExp(AFFILIATE_LINK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    restore();
    delete require.cache[supportPath];
  }
});
