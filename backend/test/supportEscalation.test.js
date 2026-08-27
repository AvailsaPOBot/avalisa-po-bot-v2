const test = require('node:test');
const assert = require('node:assert/strict');

function mockPrisma({ throws = false } = {}) {
  const created = [];
  return {
    created,
    funnelEvent: {
      create: async ({ data }) => {
        if (throws) throw new Error('relation "FunnelEvent" does not exist');
        created.push(data);
        return { id: 'evt_1', ...data };
      },
    },
  };
}

function loadSupportEscalation(email) {
  const emailPath = require.resolve('../src/lib/email');
  const escalationPath = require.resolve('../src/lib/supportEscalation');
  const originalEmail = require.cache[emailPath];
  delete require.cache[escalationPath];
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: email,
  };
  const supportEscalation = require('../src/lib/supportEscalation');

  return {
    recordSupportEscalation: supportEscalation.recordSupportEscalation,
    restore() {
      delete require.cache[escalationPath];
      if (originalEmail) require.cache[emailPath] = originalEmail;
      else delete require.cache[emailPath];
    },
  };
}

function loadSupportRouter(prisma) {
  const prismaPath = require.resolve('../src/lib/prisma');
  const supportPath = require.resolve('../src/routes/support');
  const originalPrisma = require.cache[prismaPath];
  delete require.cache[supportPath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  const router = require('../src/routes/support');

  return {
    router,
    restore() {
      delete require.cache[supportPath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
    },
  };
}

function getChatHandler(router) {
  return router.stack.find((layer) => layer.route?.path === '/chat').route.stack[0].handle;
}

async function postChat(router, message) {
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
  await getChatHandler(router)({ body: { message } }, response);
  await new Promise((resolve) => setImmediate(resolve));
  return response;
}

test('sensitive support complaints are routed to human follow-up before provider use', () => {
  const { router, restore } = loadSupportRouter(mockPrisma());
  const { getSensitiveSupportEscalation, HUMAN_FOLLOW_UP_REPLY } = router.__test;
  const sensitivePrompts = [
    'I want a refund because this did not work for me',
    'Is Avalisa a scam?',
    'I lost money using the bot',
    'I lost $500 using the bot',
    'I lost 500 dollars after starting real mode',
    'I lost my deposit today',
    'This blew up my account',
    'Please delete my account',
    'I will do a chargeback',
    'This feels fraudulent and I need legal help',
  ];

  for (const prompt of sensitivePrompts) {
    assert.equal(
      getSensitiveSupportEscalation([{ role: 'user', content: prompt }]),
      HUMAN_FOLLOW_UP_REPLY,
      prompt
    );
  }
  restore();
});

test('ordinary setup and pricing questions still go to the AI support provider', () => {
  const { router, restore } = loadSupportRouter(mockPrisma());
  const { getSensitiveSupportEscalation } = router.__test;
  const ordinaryPrompts = [
    'How do I install the Chrome extension?',
    'What is included in the Basic plan?',
    'Where do I find my Pocket Option ID?',
  ];

  for (const prompt of ordinaryPrompts) {
    assert.equal(
      getSensitiveSupportEscalation([{ role: 'user', content: prompt }]),
      null,
      prompt
    );
  }
  restore();
});

test('a refund chat records its named escalation through the real support handler', async () => {
  const prisma = mockPrisma();
  const { router, restore } = loadSupportRouter(prisma);

  try {
    const response = await postChat(router, 'I need a refund for my purchase.');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.provider, 'avalisa-escalation');
    assert.deepEqual(prisma.created, [{
      type: 'support_escalation',
      userId: null,
      meta: { reason: 'refund', excerpt: 'I need a refund for my purchase.' },
    }]);
  } finally {
    restore();
  }
});

test('a normal chat records nothing', async () => {
  const prisma = mockPrisma();
  const { router, restore } = loadSupportRouter(prisma);
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_AI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;

  try {
    const response = await postChat(router, 'How do I install the Chrome extension?');
    assert.equal(response.statusCode, 503);
    assert.equal(prisma.created.length, 0);
  } finally {
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_AI_API_KEY;
    else process.env.GOOGLE_AI_API_KEY = originalGoogleKey;
    restore();
  }
});

test('a failed escalation write does not break the human follow-up reply', async () => {
  const { router, restore } = loadSupportRouter(mockPrisma({ throws: true }));

  try {
    const response = await postChat(router, 'I was scammed.');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.reply, router.__test.HUMAN_FOLLOW_UP_REPLY);
    assert.equal(response.body.escalate, true);
  } finally {
    restore();
  }
});

test('support escalation excerpts are truncated to 500 characters', async () => {
  const prisma = mockPrisma();
  const { recordSupportEscalation, restore } = loadSupportEscalation({
    emailConfigured: () => false,
    sendEmail: () => {},
  });

  try {
    const wrote = await recordSupportEscalation(prisma, {
      userId: 'u1',
      reason: 'refund',
      excerpt: 'x'.repeat(501),
    });

    assert.equal(wrote, true);
    assert.equal(prisma.created[0].meta.excerpt.length, 500);
  } finally {
    restore();
  }
});

test('support escalations send an alert email when email is configured', async () => {
  const sent = [];
  const { recordSupportEscalation, restore } = loadSupportEscalation({
    emailConfigured: () => true,
    sendEmail: (message) => sent.push(message),
  });

  try {
    const wrote = await recordSupportEscalation(mockPrisma(), {
      userId: 'u1',
      reason: 'refund',
      excerpt: 'Please refund my purchase.',
    });

    assert.equal(wrote, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'avalisapobot@gmail.com');
    assert.equal(sent[0].subject, '[Avalisa] Support escalation: refund');
    assert.match(sent[0].text, /User ID: u1/);
    assert.match(sent[0].text, /Excerpt: Please refund my purchase\./);
    assert.match(sent[0].text, /Timestamp \(UTC\): \d{4}-\d{2}-\d{2}T/);
    assert.match(sent[0].html, /<strong>Reason:<\/strong> refund/);
  } finally {
    restore();
  }
});

test('support escalations do not attempt email when it is not configured', async () => {
  let emailAttempted = false;
  const { recordSupportEscalation, restore } = loadSupportEscalation({
    emailConfigured: () => false,
    sendEmail: () => { emailAttempted = true; },
  });

  try {
    await recordSupportEscalation(mockPrisma(), { reason: 'scam', excerpt: 'This is a scam.' });
    assert.equal(emailAttempted, false);
  } finally {
    restore();
  }
});

test('a rejected support escalation email does not break recording', async () => {
  const { recordSupportEscalation, restore } = loadSupportEscalation({
    emailConfigured: () => true,
    sendEmail: async () => { throw new Error('Brevo unavailable'); },
  });

  try {
    const wrote = await recordSupportEscalation(mockPrisma(), {
      reason: 'chargeback',
      excerpt: 'I will dispute this charge.',
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(wrote, true);
  } finally {
    restore();
  }
});

test('a failed escalation write still attempts an alert email', async () => {
  const sent = [];
  const { recordSupportEscalation, restore } = loadSupportEscalation({
    emailConfigured: () => true,
    sendEmail: (message) => sent.push(message),
  });

  try {
    const wrote = await recordSupportEscalation(mockPrisma({ throws: true }), {
      reason: 'scam',
      excerpt: 'I was scammed.',
    });
    assert.equal(wrote, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, '[Avalisa] Support escalation: scam');
  } finally {
    restore();
  }
});
