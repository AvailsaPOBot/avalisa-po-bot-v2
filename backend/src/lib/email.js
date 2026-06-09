// Transactional email via Gmail SMTP (nodemailer). Sends from the Avalisa
// support Gmail account. Configure with:
//   GMAIL_USER          — the Gmail address, e.g. avalisapobot@gmail.com
//   GMAIL_APP_PASSWORD  — a Google "App Password" (16 chars, requires 2-Step
//                         Verification enabled on that Google account).
//   EMAIL_FROM          — optional display From, defaults to "Avalisa PO Bot <GMAIL_USER>".
//                         Gmail forces the actual sender to GMAIL_USER regardless.

const nodemailer = require('nodemailer');

let transporter = null;

function emailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) {
    throw new Error('Gmail email not configured (GMAIL_USER / GMAIL_APP_PASSWORD)');
  }
  const from = process.env.EMAIL_FROM || `Avalisa PO Bot <${process.env.GMAIL_USER}>`;
  return getTransporter().sendMail({ from, to, subject, html, text });
}

module.exports = { sendEmail, emailConfigured };
