const test = require('node:test');
const assert = require('node:assert/strict');

function mockPrisma({ failApproval = false, claimStatus = 'pending' } = {}) {
  const license = { userId: 'user_123', plan: 'free', claimStatus, claimedPoUid: '987654' };
  const user = { id: 'user_123', email: 'trader@example.com', poUserId: null };
  return {
    affiliateReferral: { findUnique: async () => null },
    user: {
      findUnique: async ({ where }) => {
        if (where.id === user.id) return user;
        return null;
      },
      update: async () => ({ ...user, poUserId: license.claimedPoUid }),
    },
    license: {
      findUnique: async () => license,
      findFirst: async () => null,
      update: async (args) => {
        if (failApproval && args.data.claimStatus === 'approved') throw new Error('database unavailable');
        Object.assign(license, args.data);
        return license;
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
}

function loadClaimNotify(email) {
  const emailPath = require.resolve('../src/lib/email');
  const notifyPath = require.resolve('../src/lib/claimNotify');
  const originalEmail = require.cache[emailPath];
  const originalNotify = require.cache[notifyPath];
  delete require.cache[notifyPath];
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: email,
  };
  const claimNotify = require('../src/lib/claimNotify');

  return {
    claimNotify,
    restore() {
      delete require.cache[notifyPath];
      if (originalNotify) require.cache[notifyPath] = originalNotify;
      if (originalEmail) require.cache[emailPath] = originalEmail;
      else delete require.cache[emailPath];
    },
  };
}

function loadRouter(name, prisma, claimNotify) {
  const prismaPath = require.resolve('../src/lib/prisma');
  const notifyPath = require.resolve('../src/lib/claimNotify');
  const routePath = require.resolve(`../src/routes/${name}`);
  const originalPrisma = require.cache[prismaPath];
  const originalNotify = require.cache[notifyPath];
  delete require.cache[routePath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  require.cache[notifyPath] = {
    id: notifyPath,
    filename: notifyPath,
    loaded: true,
    exports: claimNotify,
  };
  const router = require(`../src/routes/${name}`);

  return {
    router,
    restore() {
      delete require.cache[routePath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
      if (originalNotify) require.cache[notifyPath] = originalNotify;
      else delete require.cache[notifyPath];
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

async function post(router, path, body, userId = 'user_123') {
  const route = router.stack.find((layer) => layer.route?.path === path).route;
  const res = response();
  await route.stack.at(-1).handle({ body, userId }, res);
  await new Promise((resolve) => setImmediate(resolve));
  return res;
}

test('submitting a claim sends one Board alert with the user email and PO UID', async () => {
  const sent = [];
  const notify = loadClaimNotify({ emailConfigured: () => true, sendEmail: (message) => sent.push(message) });
  const route = loadRouter('license', mockPrisma({ claimStatus: 'rejected' }), notify.claimNotify);

  try {
    const res = await post(route.router, '/claim', { poUid: '987654' });
    assert.equal(res.statusCode, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'avalisapobot@gmail.com');
    assert.match(sent[0].text, /User email: trader@example\.com/);
    assert.match(sent[0].text, /Claimed PO UID: 987654/);
  } finally {
    route.restore();
    notify.restore();
  }
});

test('claim submission response remains unchanged when email transport rejects', async () => {
  const notify = loadClaimNotify({
    emailConfigured: () => true,
    sendEmail: async () => { throw new Error('Brevo unavailable'); },
  });
  const route = loadRouter('license', mockPrisma({ claimStatus: 'rejected' }), notify.claimNotify);

  try {
    const res = await post(route.router, '/claim', { poUid: '987654' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: 'Claim submitted. We will review and notify you within 24 hours.' });
  } finally {
    route.restore();
    notify.restore();
  }
});

test('approving a claim emails the claiming user that the account is linked', async () => {
  const sent = [];
  const notify = loadClaimNotify({ emailConfigured: () => true, sendEmail: (message) => sent.push(message) });
  const route = loadRouter('admin', mockPrisma(), notify.claimNotify);

  try {
    const res = await post(route.router, '/claims/approve', { userId: 'user_123' });
    assert.equal(res.statusCode, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'trader@example.com');
    assert.match(sent[0].text, /account is linked/);
  } finally {
    route.restore();
    notify.restore();
  }
});

test('rejecting a claim emails the user and includes the checked PO UID', async () => {
  const sent = [];
  const notify = loadClaimNotify({ emailConfigured: () => true, sendEmail: (message) => sent.push(message) });
  const route = loadRouter('admin', mockPrisma(), notify.claimNotify);

  try {
    const res = await post(route.router, '/claims/reject', { userId: 'user_123', reason: 'uid_mismatch' });
    assert.equal(res.statusCode, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'trader@example.com');
    assert.match(sent[0].text, /PO UID checked: 987654/);
  } finally {
    route.restore();
    notify.restore();
  }
});

test('a failed approval update sends no email', async () => {
  const sent = [];
  const notify = loadClaimNotify({ emailConfigured: () => true, sendEmail: (message) => sent.push(message) });
  const route = loadRouter('admin', mockPrisma({ failApproval: true }), notify.claimNotify);

  try {
    const res = await post(route.router, '/claims/approve', { userId: 'user_123' });
    assert.equal(res.statusCode, 500);
    assert.equal(sent.length, 0);
  } finally {
    route.restore();
    notify.restore();
  }
});

test('claim notifications do nothing when email is not configured', async () => {
  let attempted = false;
  const notify = loadClaimNotify({
    emailConfigured: () => false,
    sendEmail: () => { attempted = true; },
  });

  try {
    await notify.claimNotify.notifyBoardOfClaim(mockPrisma(), {
      userId: 'user_123', email: 'trader@example.com', poUid: '987654',
    });
    await notify.claimNotify.notifyUserOfClaimOutcome(mockPrisma(), {
      userId: 'user_123', email: 'trader@example.com', poUid: '987654', outcome: 'rejected', reason: 'x'.repeat(501),
    });
    assert.equal(attempted, false);
  } finally {
    notify.restore();
  }
});

test('a failed notification user lookup still attempts the Board email', async () => {
  const sent = [];
  const notify = loadClaimNotify({ emailConfigured: () => true, sendEmail: (message) => sent.push(message) });

  try {
    await notify.claimNotify.notifyBoardOfClaim({
      user: { findUnique: async () => { throw new Error('database unavailable'); } },
    }, {
      userId: 'user_123', email: 'trader@example.com', poUid: '987654',
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /User email: trader@example\.com/);
  } finally {
    notify.restore();
  }
});
