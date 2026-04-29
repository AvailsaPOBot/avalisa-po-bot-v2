import { Link } from 'react-router-dom';
import { useLenis } from '../lib/useLenis';
import '../styles/landing.css';

const AFFILIATE_URL =
  'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

const CHROME_EXTENSION_URL =
  process.env.REACT_APP_CHROME_STORE_URL ||
  'https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa';

const START_PATHS = [
  {
    number: '01',
    title: 'New to Pocket Option',
    body: 'Register through the Avalisa affiliate link, then claim Pro access after account confirmation.',
    cta: 'Sign up with PO',
    href: AFFILIATE_URL,
    external: true,
    primary: true,
  },
  {
    number: '02',
    title: 'Already have PO',
    body: 'Install Avalisa from the Chrome Web Store and sign in from the Pocket Option trading page.',
    cta: 'Install extension',
    href: CHROME_EXTENSION_URL,
    external: true,
  },
  {
    number: '03',
    title: 'Want full access',
    body: 'Choose Basic for 100 trades or Pro for unlimited access from the dashboard pricing page.',
    cta: 'Compare plans',
    href: '#pricing',
  },
];

const PLANS = [
  { name: 'Free', price: '$0', body: '10 trades to test the visible workflow.', cta: 'Start Free', href: '/register' },
  { name: 'Basic', price: '$50', body: '100 trades for casual testing and weekend sessions.', cta: 'Buy Basic', href: '/pricing#basic' },
  { name: 'Pro', price: '$120', body: 'Unlimited trades with Avalisa AI controls.', cta: 'Get Pro', href: '/pricing#pro', featured: true },
];

function SmartLink({ href, external, className, children }) {
  if (external) {
    return <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>;
  }
  if (href.startsWith('#')) {
    return <a className={className} href={href}>{children}</a>;
  }
  return <Link className={className} to={href}>{children}</Link>;
}

export default function Landing() {
  useLenis();

  return (
    <main className="command-page">
      <section className="command-hero">
        <div className="command-shell command-hero__grid">
          <div className="command-hero__copy">
            <p className="command-eyebrow">Chrome extension for Pocket Option</p>
            <h1>Run your PO bot from one <span>visible control panel.</span></h1>
            <p>
              Avalisa lives on top of your Pocket Option chart. It scans the setup,
              checks payout, lets you choose intensity, and keeps every trade action visible.
            </p>
            <div className="command-actions">
              <a className="command-button command-button--primary" href={AFFILIATE_URL} target="_blank" rel="noreferrer">1. Sign Up</a>
              <a className="command-button" href={CHROME_EXTENSION_URL} target="_blank" rel="noreferrer">2. Install Chrome Extension</a>
            </div>
          </div>

          <div className="command-stage" aria-label="Avalisa product preview">
            <div className="command-po-window">
              <div className="command-po-top">
                <img src="/images/PO_Logo.png" alt="Pocket Option" />
                <span>EUR/USD OTC · payout 92%</span>
              </div>
              <div className="command-chart" aria-hidden="true">
                {['down', 'up', 'up', 'down', 'up', 'down', 'down', 'up', 'up', 'down', 'up', 'up', 'down', 'up', 'up'].map((state, index) => (
                  <i className={`command-candle is-${state}`} key={`${state}-${index}`} />
                ))}
              </div>
              <div className="command-rail" aria-hidden="true">
                <div>Timer<strong>00:30</strong></div>
                <b>CALL</b>
                <em>PUT</em>
              </div>
            </div>

            <aside className="command-bot-panel">
              <div className="command-bot-head">
                <strong>⚡ Avalisa Bot</strong>
                <span>Ready</span>
              </div>
              <dl>
                <div><dt>Mode</dt><dd>Avalisa AI</dd></div>
                <div><dt>Pair Scan</dt><dd>EUR/USD</dd></div>
                <div><dt>Intensity</dt><dd>Medium</dd></div>
                <div><dt>Start Amount</dt><dd>$1.00</dd></div>
              </dl>
              <p>Pair scan ready · payout passed · risk visible</p>
              <button type="button">Start</button>
            </aside>

            <div className="command-proof-card">
              <span>Chrome overlay</span>
              <strong>Bot panel stays visible on the PO chart</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="command-section" id="how">
        <div className="command-shell">
          <div className="command-section-head">
            <div>
              <p className="command-eyebrow">Start paths</p>
              <h2>Three routes. Same bot panel.</h2>
            </div>
            <p>New account, existing PO account, or direct purchase. Pick the route that matches where you are today.</p>
          </div>
          <div className="command-grid-3">
            {START_PATHS.map((path) => (
              <article className="command-card command-route-card" key={path.number}>
                <span className="command-number">{path.number}</span>
                <h3>{path.title}</h3>
                <p>{path.body}</p>
                <SmartLink
                  href={path.href}
                  external={path.external}
                  className={`command-button ${path.primary ? 'command-button--green' : ''}`}
                >
                  {path.cta}
                </SmartLink>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="command-section" id="workflow">
        <div className="command-shell command-workflow">
          <div className="command-card command-engine">
            <p className="command-eyebrow">After you press start</p>
            <h2>Avalisa shows the decision, not just the result.</h2>
            <div className="command-rules">
              <div><span />Payout filter<strong>Passed</strong></div>
              <div><span />Market direction<strong>Trending</strong></div>
              <div><span />RSI + Bollinger check<strong>Clean</strong></div>
              <div><span />Action<strong>CALL</strong></div>
            </div>
          </div>
          <div className="command-flow">
            <article><span>1</span><h3>Scan chart</h3><p>Avalisa checks payout, trend, indicators, and signal conflict before it acts.</p></article>
            <article><span>2</span><h3>Open one trade</h3><p>When the setup is clean, the extension sends CALL or PUT on the PO page.</p></article>
            <article><span>3</span><h3>Record history</h3><p>Each result is counted so users can review performance and adjust risk.</p></article>
          </div>
        </div>
      </section>

      <section className="command-section" id="pricing">
        <div className="command-shell">
          <div className="command-section-head">
            <div>
              <p className="command-eyebrow">Pricing</p>
              <h2>Try free. Upgrade only if the workflow fits.</h2>
            </div>
            <p>One-time payments. No recurring subscription.</p>
          </div>
          <div className="command-grid-3">
            {PLANS.map((plan) => (
              <article className={`command-card command-price-card ${plan.featured ? 'is-featured' : ''}`} key={plan.name}>
                <span className="command-chip">{plan.name}</span>
                <strong>{plan.price}</strong>
                <p>{plan.body}</p>
                <Link className={`command-button ${plan.featured ? 'command-button--primary' : ''}`} to={plan.href}>{plan.cta}</Link>
                {plan.featured && (
                  <a className="command-button command-button--green" href={AFFILIATE_URL} target="_blank" rel="noreferrer">
                    Get Pro with new PO account
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="command-section">
        <div className="command-shell">
          <div className="command-section-head">
            <div>
              <p className="command-eyebrow">Tracked activity</p>
              <h2>Show transparency, not guaranteed profit.</h2>
            </div>
            <p>Review the action, amount, result, and history after each session. Past results never guarantee future results.</p>
          </div>
          <div className="command-ledger">
            <div className="is-head"><span>Pair</span><span>Action</span><span>Amount</span><span>Result</span></div>
            <div><span>EUR/USD</span><b>CALL</b><span>$1.00</span><em>Win +$0.87</em></div>
            <div><span>GBP/JPY</span><b>PUT</b><span>$1.00</span><em>Win +$0.82</em></div>
            <div><span>AUD/USD</span><b>CALL</b><span>$1.00</span><i>Loss -$1.00</i></div>
          </div>
        </div>
      </section>

      <section className="command-section">
        <div className="command-shell">
          <div className="command-section-head">
            <div>
              <p className="command-eyebrow">FAQ</p>
              <h2>Answer the objections before checkout.</h2>
            </div>
          </div>
          <div className="command-grid-3">
            <article className="command-card"><h3>Does Avalisa guarantee profit?</h3><p>No. Pocket Option trading is risky. Avalisa provides a visible workflow, not guaranteed returns.</p></article>
            <article className="command-card"><h3>Do I need a new PO account?</h3><p>No. Existing users can install the extension. New users can register through Avalisa for Pro unlock.</p></article>
            <article className="command-card"><h3>Can I stop the bot?</h3><p>Yes. Avalisa runs while the browser and PO page are open. You stay in control and can stop manually.</p></article>
          </div>
        </div>
      </section>

      <section className="command-final">
        <div className="command-shell command-site-index">
          <div>
            <p className="command-eyebrow">Index</p>
            <h2>Avalisa PO Bot</h2>
            <p>Chrome extension for Pocket Option with a visible bot panel, account tiers, support, and trade history.</p>
          </div>
          <nav aria-label="Avalisa page index">
            <a href={AFFILIATE_URL} target="_blank" rel="noreferrer">Sign Up</a>
            <a href={CHROME_EXTENSION_URL} target="_blank" rel="noreferrer">Chrome Extension</a>
            <Link to="/pricing">Pricing</Link>
            <Link to="/login">Login</Link>
            <Link to="/support">Support</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
          <div className="command-social-links">
            <a href="https://youtube.com/@avalisapobot?si=B0477eY_uwdHelIJ" target="_blank" rel="noreferrer">YouTube</a>
            <a href="https://www.tiktok.com/@avalisa.po.bot?_r=1&_t=ZS-95AWsutNbgT" target="_blank" rel="noreferrer">TikTok</a>
            <a href="https://www.facebook.com/share/1EGgzWbHv9/?mibextid=wwXIfr" target="_blank" rel="noreferrer">Facebook</a>
            <a href="mailto:avalisapobot@gmail.com">Email</a>
          </div>
        </div>
      </section>
    </main>
  );
}
