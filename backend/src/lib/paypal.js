const { PLAN_IDS, getPlanEntitlements } = require('./plans');

const PAYPAL_API_BASE = process.env.PAYPAL_ENV === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://avalisabot.vercel.app').replace(/\/$/, '');
}

function assertPaidPlan(plan) {
  const entitlements = getPlanEntitlements(plan);
  if (!entitlements || entitlements.priceCents <= 0) {
    throw new Error(`Unsupported PayPal plan: ${plan}`);
  }
  return entitlements;
}

function normalizeCheckoutPlan(planId) {
  if (planId === 'pro' || planId === PLAN_IDS.PRO) return PLAN_IDS.PRO;
  if (planId === 'basic' || planId === PLAN_IDS.BASIC) return PLAN_IDS.BASIC;
  return null;
}

function encodeCustomId({ userId, plan }) {
  return `avalisa:${userId}:${plan}`;
}

function decodeCustomId(value = '') {
  const [prefix, userId, plan] = String(value).split(':');
  if (prefix !== 'avalisa' || !userId || !plan) return null;
  return { userId, plan };
}

function formatUsd(priceCents) {
  return (Number(priceCents) / 100).toFixed(2);
}

async function getPayPalAccessToken() {
  if (!paypalConfigured()) {
    throw new Error('PayPal credentials are not configured');
  }

  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'PayPal token request failed');
  }
  return data.access_token;
}

async function createPayPalOrder({ userId, email, plan }) {
  const entitlements = assertPaidPlan(plan);
  const accessToken = await getPayPalAccessToken();
  const frontendUrl = getFrontendUrl();
  const planLabel = entitlements.label || plan;

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `avalisa-${userId}-${plan}-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: encodeCustomId({ userId, plan }),
        description: `Avalisa PO Bot ${planLabel} plan`,
        soft_descriptor: 'AVALISA BOT',
        amount: {
          currency_code: process.env.PAYPAL_CURRENCY || 'USD',
          value: formatUsd(entitlements.priceCents),
          breakdown: {
            item_total: {
              currency_code: process.env.PAYPAL_CURRENCY || 'USD',
              value: formatUsd(entitlements.priceCents),
            },
          },
        },
        items: [{
          name: `Avalisa PO Bot ${planLabel}`,
          description: 'One-time digital license activation',
          quantity: '1',
          unit_amount: {
            currency_code: process.env.PAYPAL_CURRENCY || 'USD',
            value: formatUsd(entitlements.priceCents),
          },
          category: 'DIGITAL_GOODS',
        }],
      }],
      payer: email ? { email_address: email } : undefined,
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Avalisa PO Bot',
            user_action: 'PAY_NOW',
            return_url: `${frontendUrl}/pricing?paypal=approved&plan=${encodeURIComponent(plan)}`,
            cancel_url: `${frontendUrl}/pricing?paypal=cancelled&plan=${encodeURIComponent(plan)}`,
          },
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error_description || 'PayPal order creation failed');
  }

  const approvalUrl = data.links?.find((link) => link.rel === 'approve')?.href;
  if (!approvalUrl) {
    throw new Error('PayPal order did not return an approval URL');
  }

  return { id: data.id, approvalUrl };
}

async function capturePayPalOrder(orderId) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `avalisa-capture-${orderId}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error_description || 'PayPal order capture failed');
  }

  return data;
}

async function verifyPayPalWebhook({ headers, event }) {
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    throw new Error('PAYPAL_WEBHOOK_ID is not configured');
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.verification_status !== 'SUCCESS') {
    throw new Error('PayPal webhook verification failed');
  }
  return true;
}

function getCaptureFromOrder(order) {
  return order?.purchase_units
    ?.flatMap((unit) => unit.payments?.captures || [])
    ?.find((capture) => capture.status === 'COMPLETED');
}

module.exports = {
  createPayPalOrder,
  capturePayPalOrder,
  decodeCustomId,
  getCaptureFromOrder,
  normalizeCheckoutPlan,
  paypalConfigured,
  verifyPayPalWebhook,
};
