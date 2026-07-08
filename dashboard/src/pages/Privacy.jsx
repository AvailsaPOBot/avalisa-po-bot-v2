import { Mail, ShieldCheck } from 'lucide-react';
import '../styles/luxury.css';

export default function Privacy() {
  const sections = [
    {
      title: '1. Information We Collect',
      content: [
        {
          subtitle: 'Account Data',
          text: 'When you register, we collect your email address and a securely hashed version of your password (bcrypt). Your plaintext password is never stored.',
        },
        {
          subtitle: 'Authentication Tokens',
          text: 'We issue a JSON Web Token (JWT) stored in your browser\'s local storage to keep you logged in. This token contains your user ID and license tier — no sensitive personal data.',
        },
        {
          subtitle: 'Trade History',
          text: 'When the Avalisa Bot extension is active, trade records are logged to your account. Each record includes: timestamp, direction (call/put), amount, result (win/loss), and strategy used. No account credentials from Pocket Option are ever collected.',
        },
        {
          subtitle: 'Device Fingerprint',
          text: 'For Demo usage tracking, a one-way hash is derived from non-identifying browser properties (user-agent, screen resolution, language, CPU cores). This fingerprint cannot be used to identify you personally.',
        },
        {
          subtitle: 'Settings',
          text: 'Your bot configuration (strategy, timeframe, martingale settings, etc.) is stored server-side to enable cloud sync across devices.',
        },
      ],
    },
    {
      title: '2. How We Use Your Data',
      content: [
        {
          subtitle: 'Authentication',
          text: 'Your email and password hash are used solely to verify your identity when you log in.',
        },
        {
          subtitle: 'License & Usage Tracking',
          text: 'Your license tier (Demo, Basic, or Pro) is tracked to enforce plan limits. The device fingerprint is used only to count Demo trades per device — it is not linked to your account.',
        },
        {
          subtitle: 'Trade Logging',
          text: 'Trade history is stored so you can review your performance statistics on the dashboard. It is not used for any profiling or marketing purposes.',
        },
        {
          subtitle: 'Service Improvement',
          text: 'Aggregate, anonymised usage data may be used to improve the bot\'s reliability and features.',
        },
      ],
    },
    {
      title: '3. Third-Party Services',
      content: [
        {
          subtitle: 'Whop / PayPal (Payments)',
          text: 'Paid plans may be processed by Whop or PayPal. We do not store your credit card details. When you purchase a plan, the payment provider sends us a payment confirmation, which we use to activate your license. The selected payment provider\'s privacy policy applies to payment processing.',
        },
        {
          subtitle: 'Render (Backend Hosting)',
          text: 'Our API server is hosted on Render. Your data is stored on Render\'s infrastructure. Render does not have access to your account data beyond infrastructure-level hosting.',
        },
        {
          subtitle: 'Google AI / Anthropic (Talk to Avalisa)',
          text: 'Messages sent to Talk to Avalisa are forwarded to Google Gemini (Gemini Flash) or Anthropic Claude. Do not include sensitive personal information in chat messages. These providers\' usage policies apply to chat content.',
        },
        {
          subtitle: 'Vercel (Dashboard Hosting)',
          text: 'The dashboard frontend is hosted on Vercel. Vercel may collect standard access logs (IP address, browser type) as part of normal CDN operation.',
        },
      ],
    },
    {
      title: '4. Data Retention & Deletion',
      content: [
        {
          subtitle: 'Retention',
          text: 'Your account data is retained for as long as your account is active. Trade history is retained indefinitely to provide you with historical statistics.',
        },
        {
          subtitle: 'Account Deletion',
          text: 'You can request deletion of your account and all associated data (email, trade history, settings, device fingerprints) by emailing us at AvalisaPOBot@gmail.com. We will process deletion requests within 30 days.',
        },
      ],
    },
    {
      title: '5. Data Security',
      content: [
        {
          subtitle: '',
          text: 'Passwords are hashed with bcrypt before storage. All data is transmitted over HTTPS. JWTs are signed and expire after a set period. We do not store Pocket Option credentials — the extension operates entirely within your browser.',
        },
      ],
    },
    {
      title: '6. Data Sharing & Sale',
      content: [
        {
          subtitle: '',
          text: 'We do not sell, rent, or trade your personal data to any third parties. Data is only shared with the service providers listed in Section 3 as strictly necessary to operate the service.',
        },
      ],
    },
    {
      title: '7. Cookies & Local Storage',
      content: [
        {
          subtitle: '',
          text: 'The dashboard uses browser local storage to hold your JWT session token. No third-party tracking cookies are set. The Chrome extension stores your JWT and settings in chrome.storage.local, which is sandboxed to the extension.',
        },
      ],
    },
    {
      title: '8. Children\'s Privacy',
      content: [
        {
          subtitle: '',
          text: 'Avalisa Bot is not intended for users under the age of 18. We do not knowingly collect data from minors. Binary options trading is restricted to adults in most jurisdictions.',
        },
      ],
    },
    {
      title: '9. Changes to This Policy',
      content: [
        {
          subtitle: '',
          text: 'We may update this Privacy Policy from time to time. Material changes will be noted by updating the "Last Updated" date below. Continued use of the service after changes constitutes acceptance of the updated policy.',
        },
      ],
    },
    {
      title: '10. Contact',
      content: [
        {
          subtitle: '',
          text: 'For any privacy-related questions, data deletion requests, or concerns, contact us at:',
        },
      ],
      contact: true,
    },
  ];

  return (
    <main className="lux-privacy-page">
      <section className="lux-privacy-hero lux-shell">
        <div>
          <p className="lux-kicker">Privacy</p>
          <h1>Privacy Policy</h1>
          <p className="lux-privacy-updated">Last updated: April 2026</p>
          <p>
            This Privacy Policy explains how Avalisa Bot ("we", "us", "our") collects, uses, and protects
            your information when you use our Chrome extension and dashboard. By using Avalisa Bot, you agree
            to the practices described in this policy.
          </p>
        </div>
        <aside>
          <ShieldCheck size={34} />
          <strong>No Pocket Option password storage.</strong>
          <span>Avalisa uses backend account access and plan checks, but does not collect Pocket Option credentials.</span>
        </aside>
      </section>

      <section className="lux-privacy-content lux-shell">
          {sections.map(section => (
            <article key={section.title} className="lux-privacy-card">
              <h2>{section.title}</h2>
              <div className="lux-privacy-card__body">
                {section.content.map((item, i) => (
                  <div key={i}>
                    {item.subtitle && (
                      <h3>{item.subtitle}</h3>
                    )}
                    <p>{item.text}</p>
                  </div>
                ))}
                {section.contact && (
                  <a
                    href="mailto:AvalisaPOBot@gmail.com"
                    className="lux-privacy-email"
                  >
                    <Mail size={15} />
                    AvalisaPOBot@gmail.com
                  </a>
                )}
              </div>
            </article>
          ))}

        <aside className="lux-privacy-risk">
          <strong>Risk Disclaimer:</strong> Binary options trading carries significant financial risk. This tool does not guarantee profits. Trade responsibly.
        </aside>
      </section>
    </main>
  );
}
