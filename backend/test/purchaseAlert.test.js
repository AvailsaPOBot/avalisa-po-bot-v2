const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function mockPrisma({ throws = false, user = { id: 'user_123', email: 'customer@example.com', license: null } } = {}) {
  const created = [];
  const upserts = [];
  const creates = [];
  return {
    created,
    upserts,
    creates,
    funnelEvent: {
      create: async ({ data }) => {
        if (throws) throw new Error('relation "FunnelEvent" does not exist');
        created.push(data);
        return { id: 'evt_1', ...data };
      },
    },
    user: {
      findUnique: async () => user,
    },
    license: {
      findUnique: async () => null,
      create: async (args) => {
        creates.push(args);
        return args;
      },
      upsert: async (args) => {
        upserts.push(args);
        return args;
      },
    },
  };
}

function loadPurchaseAlert(email) {
  const emailPath = require.resolve('../src/lib/email');
  const alertPath = require.resolve('../src/lib/purchaseAlert');
  const originalEmail = require.cache[emailPath];
  delete require.cache[alertPath];
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: email,
  };
  const purchaseAlert = require('../src/lib/purchaseAlert');

  return {
    recordUnmappedPurchase: purchaseAlert.recordUnmappedPurchase,
    restore() {
      delete require.cache[alertPath];
      if (originalEmail) require.cache[emailPath] = originalEmail;
      else delete require.cache[emailPath];
    },
  };
}

function loadWebhooksRouter(prisma, purchaseAlert, paypal = {}) {
  const prismaPath = require.resolve('../src/lib/prisma');
  const alertPath = require.resolve('../src/lib/purchaseAlert');
  const paypalPath = require.resolve('../src/lib/paypal');
  const licenseActivationPath = require.resolve('../src/lib/licenseActivation');
  const webhooksPath = require.resolve('../src/routes/webhooks');
  const originalPrisma = require.cache[prismaPath];
  const originalAlert = require.cache[alertPath];
  const originalPayPal = require.cache[paypalPath];
  const originalLicenseActivation = require.cache[licenseActivationPath];
  const paypalExports = originalPayPal?.exports || require(paypalPath);
  delete require.cache[webhooksPath];
  delete require.cache[licenseActivationPath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  require.cache[alertPath] = {
    id: alertPath,
    filename: alertPath,
    loaded: true,
    exports: purchaseAlert,
  };
  require.cache[paypalPath] = {
    id: paypalPath,
    filename: paypalPath,
    loaded: true,
    exports: { ...paypalExports, ...paypal },
  };
  const router = require('../src/routes/webhooks');

  return {
    router,
    restore() {
      delete require.cache[webhooksPath];
      if (originalPrisma) require.cache[prismaPath] = originalPrisma;
      else delete require.cache[prismaPath];
      if (originalAlert) require.cache[alertPath] = originalAlert;
      else delete require.cache[alertPath];
      if (originalPayPal) require.cache[paypalPath] = originalPayPal;
      else delete require.cache[paypalPath];
      if (originalLicenseActivation) require.cache[licenseActivationPath] = originalLicenseActivation;
      else delete require.cache[licenseActivationPath];
    },
  };
}

async function postWhop(router, data, type = 'membership.activated') {
  const secret = 'test_whop_secret';
  const webhookId = 'evt_webhook_123';
  const webhookTimestamp = '1700000000';
  const body = Buffer.from(JSON.stringify({ type, data }));
  const signedContent = Buffer.concat([
    Buffer.from(`${webhookId}.${webhookTimestamp}.`, 'utf8'),
    body,
  ]);
  const signature = crypto.createHmac('sha256', secret).update(signedContent).digest('base64');
  const previousSecret = process.env.WHOP_WEBHOOK_SECRET;
  process.env.WHOP_WEBHOOK_SECRET = secret;
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(bodyJson) {
      this.body = bodyJson;
      return bodyJson;
    },
  };
  const route = router.stack.find((layer) => layer.route?.path === '/whop').route;

  try {
    await route.stack.at(-1).handle({
      headers: {
        'webhook-signature': signature,
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
      },
      body,
    }, response);
    return response;
  } finally {
    if (previousSecret === undefined) delete process.env.WHOP_WEBHOOK_SECRET;
    else process.env.WHOP_WEBHOOK_SECRET = previousSecret;
  }
}

async function postPayPal(router, resource, eventType = 'PAYMENT.CAPTURE.COMPLETED') {
  const body = Buffer.from(JSON.stringify({ event_type: eventType, resource }));
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(bodyJson) {
      this.body = bodyJson;
      return bodyJson;
    },
  };
  const route = router.stack.find((layer) => layer.route?.path === '/paypal').route;
  await route.stack.at(-1).handle({ headers: {}, body }, response);
  return response;
}

const unmappedDetails = {
  reason: 'no_plan_match',
  userId: 'user_123',
  customerEmail: 'customer@example.com',
  priceInCents: 5000,
  planName: 'Avalisa Starter',
  planId: 'plan_new_starter',
  membershipId: 'mem_123',
  eventType: 'membership.activated',
};

test('an unmappable purchase records an event and sends an email', async () => {
  const sent = [];
  const prisma = mockPrisma();
  const { recordUnmappedPurchase, restore } = loadPurchaseAlert({
    emailConfigured: () => true,
    sendEmail: (message) => sent.push(message),
  });

  try {
    const wrote = await recordUnmappedPurchase(prisma, unmappedDetails);
    assert.equal(wrote, true);
    assert.deepEqual(prisma.created, [{
      type: 'unmapped_purchase',
      userId: 'user_123',
      meta: unmappedDetails,
    }]);
    assert.equal(sent.length, 1);
  } finally {
    restore();
  }
});

test('a mappable Whop purchase triggers no unmapped-purchase alert', async () => {
  const prisma = mockPrisma();
  const alerts = [];
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: (injectedPrisma, details) => alerts.push({ injectedPrisma, details }),
  });

  try {
    const response = await postWhop(router, {
      id: 'mem_basic_123',
      user: { email: 'customer@example.com' },
      plan: { id: 'plan_basic', name: 'Basic', price_cents: 6900 },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(alerts.length, 0);
    assert.equal(prisma.upserts.length, 1);
  } finally {
    restore();
  }
});

test('a DB write that throws still sends the unmapped-purchase email', async () => {
  const sent = [];
  const { recordUnmappedPurchase, restore } = loadPurchaseAlert({
    emailConfigured: () => true,
    sendEmail: (message) => sent.push(message),
  });

  try {
    const wrote = await recordUnmappedPurchase(mockPrisma({ throws: true }), unmappedDetails);
    assert.equal(wrote, false);
    assert.equal(sent.length, 1);
  } finally {
    restore();
  }
});

test('an unmapped-purchase email contains manual-grant identifiers', async () => {
  const sent = [];
  const { recordUnmappedPurchase, restore } = loadPurchaseAlert({
    emailConfigured: () => true,
    sendEmail: (message) => sent.push(message),
  });

  try {
    await recordUnmappedPurchase(mockPrisma(), unmappedDetails);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, '[Avalisa] PAID BUT NOT ACTIVATED (no_plan_match) - manual grant needed');
    assert.match(sent[0].text, /Reason: no_plan_match/);
    assert.match(sent[0].text, /5000 cents \(\$50\.00\)/);
    assert.match(sent[0].text, /Plan Name: Avalisa Starter/);
    assert.match(sent[0].text, /Membership ID: mem_123/);
    assert.match(sent[0].text, /Customer Email: customer@example\.com/);
    assert.match(sent[0].text, /User ID: user_123/);
    assert.match(sent[0].text, /Whop Event Type: membership\.activated/);
    assert.match(sent[0].text, /Timestamp \(UTC\): \d{4}-\d{2}-\d{2}T/);
  } finally {
    restore();
  }
});

test('the unmappable Whop webhook branch invokes the alert with purchase identifiers', async () => {
  const prisma = mockPrisma();
  const alerts = [];
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: (injectedPrisma, details) => alerts.push({ injectedPrisma, details }),
  });

  try {
    const response = await postWhop(router, {
      id: 'mem_123',
      user: { email: 'customer@example.com' },
      plan: { id: 'plan_new_starter', name: 'Avalisa Starter', price_cents: 5000 },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].injectedPrisma, prisma);
    assert.deepEqual(alerts[0].details, unmappedDetails);
    assert.equal(prisma.upserts.length, 0);
    assert.equal(prisma.creates.length, 0);
  } finally {
    restore();
  }
});

test('a paid Whop event with no customer email raises one no_customer_email alert without granting a licence', async () => {
  const prisma = mockPrisma();
  const alerts = [];
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: (injectedPrisma, details) => alerts.push({ injectedPrisma, details }),
  });

  try {
    const response = await postWhop(router, {
      id: 'mem_no_email',
      plan: { id: 'plan_basic', name: 'Basic', price_cents: 6900 },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].injectedPrisma, prisma);
    assert.equal(alerts[0].details.reason, 'no_customer_email');
    assert.equal(prisma.upserts.length, 0);
    assert.equal(prisma.creates.length, 0);
  } finally {
    restore();
  }
});

test('a paid Whop event with no matching account raises one actionable alert without granting a licence', async () => {
  const sent = [];
  const prisma = mockPrisma({ user: null });
  const purchaseAlert = loadPurchaseAlert({
    emailConfigured: () => true,
    sendEmail: (message) => sent.push(message),
  });
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: purchaseAlert.recordUnmappedPurchase,
  });

  try {
    const response = await postWhop(router, {
      id: 'mem_no_account',
      user: { email: 'different-checkout@example.com' },
      plan: { id: 'plan_basic', name: 'Basic', price_cents: 6900 },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(response.statusCode, 200);
    assert.equal(prisma.created.length, 1);
    assert.equal(prisma.created[0].type, 'unmapped_purchase');
    assert.equal(prisma.created[0].meta.reason, 'no_matching_account');
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /different-checkout@example\.com/);
    assert.equal(prisma.upserts.length, 0);
    assert.equal(prisma.creates.length, 0);
  } finally {
    restore();
    purchaseAlert.restore();
  }
});

test('a completed PayPal capture with no custom_id raises one alert without granting a licence', async () => {
  const prisma = mockPrisma();
  const alerts = [];
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: (injectedPrisma, details) => alerts.push({ injectedPrisma, details }),
  }, {
    verifyPayPalWebhook: async () => true,
  });

  try {
    const response = await postPayPal(router, {
      id: 'capture_missing_custom_123',
      status: 'COMPLETED',
      amount: { value: '69.00', currency_code: 'USD' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].injectedPrisma, prisma);
    assert.deepEqual(alerts[0].details, {
      reason: 'paypal_missing_custom_id',
      paypalCaptureId: 'capture_missing_custom_123',
      amount: '69.00',
      currency: 'USD',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
    });
    assert.equal(prisma.upserts.length, 0);
    assert.equal(prisma.creates.length, 0);
  } finally {
    restore();
  }
});

test('a completed PayPal capture with an unsupported plan alerts with its capture ID', async () => {
  const sent = [];
  const prisma = mockPrisma();
  const purchaseAlert = loadPurchaseAlert({
    emailConfigured: () => true,
    sendEmail: (message) => sent.push(message),
  });
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: purchaseAlert.recordUnmappedPurchase,
  }, {
    verifyPayPalWebhook: async () => true,
  });

  try {
    const response = await postPayPal(router, {
      id: 'capture_unsupported_plan_456',
      status: 'COMPLETED',
      custom_id: 'avalisa:user_123:enterprise',
      amount: { value: '199.00', currency_code: 'USD' },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(response.statusCode, 200);
    assert.equal(prisma.created.length, 1);
    assert.equal(prisma.created[0].meta.reason, 'paypal_unsupported_plan');
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /PayPal Capture ID: capture_unsupported_plan_456/);
    assert.equal(prisma.upserts.length, 0);
    assert.equal(prisma.creates.length, 0);
  } finally {
    restore();
    purchaseAlert.restore();
  }
});

test('a pending PayPal capture raises no alert', async () => {
  const prisma = mockPrisma();
  const alerts = [];
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: (injectedPrisma, details) => alerts.push({ injectedPrisma, details }),
  }, {
    verifyPayPalWebhook: async () => true,
  });

  try {
    const response = await postPayPal(router, {
      id: 'capture_pending_789',
      status: 'PENDING',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(alerts.length, 0);
    assert.equal(prisma.upserts.length, 0);
    assert.equal(prisma.creates.length, 0);
  } finally {
    restore();
  }
});

test('a completed, mappable PayPal capture grants a licence without an alert', async () => {
  const prisma = mockPrisma();
  const alerts = [];
  const { router, restore } = loadWebhooksRouter(prisma, {
    recordUnmappedPurchase: (injectedPrisma, details) => alerts.push({ injectedPrisma, details }),
  }, {
    verifyPayPalWebhook: async () => true,
  });

  try {
    const response = await postPayPal(router, {
      id: 'capture_basic_012',
      status: 'COMPLETED',
      custom_id: 'avalisa:user_123:basic',
      amount: { value: '69.00', currency_code: 'USD' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(alerts.length, 0);
    assert.equal(prisma.upserts.length, 1);
  } finally {
    restore();
  }
});
