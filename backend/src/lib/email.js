// Transactional email via Brevo HTTP API (https — works on Render, which blocks
// outbound SMTP). Sends from the verified single sender (avalisapobot@gmail.com).
// Configure with:
//   BREVO_API_KEY   — Brevo API key (SMTP & API → API Keys)
//   EMAIL_FROM      — "Name <email>" of a VERIFIED Brevo sender. Defaults to
//                     GMAIL_USER / avalisapobot@gmail.com.
//
// NOTE: Gmail SMTP (nodemailer) does NOT work on Render — outbound port 465 is
// blocked (ENETUNREACH). That's why this uses Brevo's HTTPS API instead.

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 15000;

function emailConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

// Parse "Avalisa PO Bot <avalisapobot@gmail.com>" → { name, email }.
function parseSender() {
  const raw = process.env.EMAIL_FROM || '';
  const m = raw.match(/^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/);
  if (m) return { name: m[1] || 'Avalisa PO Bot', email: m[2] };
  const email = raw.trim() || process.env.GMAIL_USER || 'avalisapobot@gmail.com';
  return { name: 'Avalisa PO Bot', email };
}

async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) {
    throw new Error('BREVO_API_KEY not configured');
  }
  const sender = parseSender();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendEmail, emailConfigured };
