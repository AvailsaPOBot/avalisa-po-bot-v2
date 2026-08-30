import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Brain,
  Check,
  Gift,
  Laptop,
  Lock,
  Menu,
  Puzzle,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  X,
} from 'lucide-react';
import { useLenis } from '../lib/useLenis';
import '../styles/luxury.css';

const AFFILIATE_URL =
  'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const CHROME_EXTENSION_URL = process.env.REACT_APP_CHROME_STORE_URL || 'https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa';

// The free demo leads. Measured 2026-08-30: every rival on the Web Store shelf leads with
// "free" - the top result on all four queries tested is literally named "Free Pocket Option
// Bot" and carries 10x the installs of the better-rated listing above it. We already HAVE a
// free tier; we simply never said so first. These three slots were generic feature labels
// ("AI-Assisted Execution") that could describe any bot in the category and asked the visitor
// to take a paid product on trust. No price changes here - only what a visitor reads first.
const heroHighlights = [
  { icon: Brain, title: 'Start Free, No Payment', text: 'Run demo mode on your Pocket Option demo balance first.' },
  { icon: ShieldCheck, title: 'Martingale Strategy Controls', text: 'Your start amount, multiplier and step limit - visible before every trade.' },
  { icon: Lock, title: 'Stop At Any Time', text: 'Payout filter, step ceiling and manual stop stay under your control.' },
];

const deviceLinks = [
  { icon: Smartphone, title: 'iPhone', text: 'PO mobile web', href: '#webapp' },
  { icon: Smartphone, title: 'Android', text: 'PO mobile web', href: '#webapp' },
  { icon: TabletSmartphone, title: 'iPad', text: 'larger mobile view', href: '#webapp' },
  { icon: Laptop, title: 'Mac / Windows', text: 'Chrome extension', href: CHROME_EXTENSION_URL, external: true },
];

const safetyRules = [
  ['Backend access first', 'Paid plan or free-tier limit is checked before the bot starts.'],
  ['No PO password storage', 'Avalisa never asks for or stores the user Pocket Option password.'],
  ['Account mode confirmation', 'Unknown PO state remains locked before any trade action.'],
  ['Trade lock and cooldown', 'Prevents duplicate order attempts while a trade is pending.'],
];

const aiPoints = [
  'Multiple timeframes: S30, M1, M3, M5',
  'Low, Mid, and High intensity modes',
  'Favorite-pair scan when the current pair has no setup',
  'Payout and candle context before execution',
];

const plans = [
  {
    name: 'Demo',
    price: '10',
    period: 'trades',
    text: 'Start safely and learn the workflow before upgrading.',
    href: '/register',
    cta: 'Create Free Account',
    items: ['10 Martingale trades', 'Dashboard access', 'Webapp Bot access', 'Support chat'],
  },
  {
    name: 'Basic',
    price: '$69',
    period: 'one-time',
    text: 'Unlimited Martingale trading, with no starting amount cap.',
    href: '/pricing#basic',
    cta: 'View Basic',
    featured: true,
    items: ['Unlimited Martingale', 'No starting amount cap', 'Cloud settings', 'Trade history'],
  },
  {
    name: 'Pro',
    price: '$119',
    period: 'one-time',
    text: 'All current modes unlocked for the full Avalisa workflow.',
    href: '/pricing#pro',
    cta: 'View Pro',
    items: ['Avalisa Bot unlocked', 'Current modes included', 'Affiliate unlock path', 'Priority support'],
  },
];

function SmartLink({ href, to, external, className, children }) {
  if (external || href) {
    return <a className={className} href={href || to} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{children}</a>;
  }
  return <Link className={className} to={to}>{children}</Link>;
}

function SectionTitle({ children, accent }) {
  return (
    <h2>
      {children}
      {accent && <span>{accent}</span>}
    </h2>
  );
}

function PocketOptionMark() {
  return (
    <span className="pocket-option-mark" aria-hidden="true">
      <img src="/images/PO_Logo.png" alt="" />
    </span>
  );
}

function MascotHero() {
  const [productOpen, setProductOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <section className="mascot-hero" id="top" aria-label="Meet Avalisa PO Bot, AI Trading Bot for Pocket Option">
      <div className="mascot-hero__desktop">
        <img
          className="mascot-hero__art"
          src="/images/landing/mascot-redesign/avalisa-command-partner-desktop.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
        />

        <div className="mascot-hero__desktop-copy">
          <h1>
            <span className="mascot-hero__title-line mascot-hero__title-line--light">Meet Avalisa PO Bot,</span>
            <span className="mascot-hero__title-line">AI Trading Bot for</span>
            <span className="mascot-hero__title-line mascot-hero__title-line--light">Pocket Option <PocketOptionMark /></span>
          </h1>
        </div>
        <p className="mascot-hero__sr">
          Run Pocket Option strategies on desktop or mobile with visible settings,
          account-mode checks, and controls before execution.
        </p>

        <Link className="mascot-hero__hotspot mascot-hero__hotspot--logo" to="/" aria-label="Avalisa PO Bot home" />

        <div className="mascot-hero__product-nav">
          <button
            type="button"
            aria-label="Open Product menu"
            aria-expanded={productOpen}
            onClick={() => setProductOpen((open) => !open)}
          />
          {productOpen && (
            <div className="mascot-hero__product-menu">
              <Link to="/webapp">Webapp Bot</Link>
              <a href={CHROME_EXTENSION_URL} target="_blank" rel="noreferrer">Chrome Extension</a>
              <a href="#ai">Avalisa Bot</a>
            </div>
          )}
        </div>

        <Link className="mascot-hero__hotspot mascot-hero__hotspot--pricing" to="/pricing" aria-label="Pricing" />
        <Link className="mascot-hero__hotspot mascot-hero__hotspot--support" to="/support" aria-label="Support" />
        <Link className="mascot-hero__hotspot mascot-hero__hotspot--login" to="/login" aria-label="Log in" />
        <Link className="mascot-hero__hotspot mascot-hero__hotspot--register-nav" to="/register" aria-label="Register for Free Access" />
        <Link className="mascot-hero__hotspot mascot-hero__hotspot--register-hero" to="/register" aria-label="Register for Free Access" />
        <Link className="mascot-hero__hotspot mascot-hero__hotspot--learn" to="/pricing" aria-label="Learn more about affiliate-confirmed Pro access" />
      </div>

      <div className="mascot-hero__mobile">
        <header className="mascot-mobile-nav">
          <Link to="/" aria-label="Avalisa PO Bot home">
            <img src="/images/brand/avalisa-signature-logo-gold.png" alt="Avalisa PO Bot" />
          </Link>
          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </header>

        {mobileNavOpen && (
          <nav className="mascot-mobile-menu" aria-label="Primary navigation">
            <Link to="/webapp" onClick={() => setMobileNavOpen(false)}>Webapp Bot</Link>
            <a href={CHROME_EXTENSION_URL} target="_blank" rel="noreferrer" onClick={() => setMobileNavOpen(false)}>Chrome Extension</a>
            <a href="#ai" onClick={() => setMobileNavOpen(false)}>Avalisa Bot</a>
            <Link to="/pricing" onClick={() => setMobileNavOpen(false)}>Pricing</Link>
            <Link to="/support" onClick={() => setMobileNavOpen(false)}>Support</Link>
            <Link to="/login" onClick={() => setMobileNavOpen(false)}>Log in</Link>
          </nav>
        )}

        <div className="mascot-mobile-copy">
          <h1>
            <span className="mascot-hero__title-line mascot-hero__title-line--light">Meet Avalisa PO Bot,</span>
            <span className="mascot-hero__title-line">AI Trading Bot for</span>
            <span className="mascot-hero__title-line mascot-hero__title-line--light">Pocket Option <PocketOptionMark /></span>
          </h1>
          <p>
            Run Pocket Option strategies on desktop or mobile—with visible settings,
            account-mode checks, and controls before execution.
          </p>
          <Link to="/register" className="avalisa-button avalisa-button--gold">
            Register for Free Access <ArrowRight size={17} />
          </Link>
          <small>Start in Demo. Trading involves risk. Profits are never guaranteed.</small>
          <p className="mascot-mobile-copy__affiliate">
            Affiliate-confirmed Pocket Option registration can unlock Pro.{' '}
            <Link to="/pricing">Learn more</Link>
          </p>
        </div>

        <figure className="mascot-mobile-stage" aria-label="Avalisa PO Bot on desktop and mobile">
          <img
            className="mascot-mobile-stage__approved"
            src="/images/landing/mascot-redesign/avalisa-approved-mobile-stage.webp"
            alt="Avalisa presenting the PO Bot desktop and mobile interfaces"
          />
        </figure>

        <div className="mascot-mobile-highlights">
          {heroHighlights.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <Icon size={24} />
              <div><strong>{title}</strong><span>{text}</span></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// The promo code advertised to customers MUST be the one the affiliate link carries.
// Until 2026-08-27 this page said "50START" while every affiliate link in the product
// sent code=WELCOME50 — so anyone who typed what they were told lost the first-deposit
// bonus, and we lost the FTD behind it. Derive it from the link; never write it twice.
export const AFFILIATE_PROMO_CODE = 'WELCOME50';

export default function Landing() {
  useLenis();

  return (
    <main className="avalisa-site">
      <MascotHero />

      <section className="avalisa-device-band" id="webapp">
        <div className="avalisa-shell avalisa-device-band__grid">
          <div>
            <SectionTitle accent="All your devices.">One Avalisa workflow.</SectionTitle>
            <p>
              The webapp bot is placed as the mobile access path on the Avalisa website,
              while desktop users can keep using the Chrome extension. Same Avalisa account,
              same backend access rules, same product discipline.
            </p>
            <SmartLink to="/webapp" className="avalisa-button avalisa-button--dark">
              Open Webapp Bot Access <ArrowRight size={17} />
            </SmartLink>
          </div>
          <figure>
            <img src="/images/landing/webapp-redesign/device-product-composite.png" alt="Avalisa PO Bot responsive phone tablet and desktop product screens" />
          </figure>
        </div>
        <div className="avalisa-shell avalisa-device-links">
          {deviceLinks.map(({ icon: Icon, title, text, href, external }) => (
            <SmartLink href={href} external={external} className="avalisa-device-link" key={title}>
              <Icon size={22} />
              <strong>{title}</strong>
              <span>{text}</span>
            </SmartLink>
          ))}
        </div>
      </section>

      <section className="avalisa-safety" id="features">
        <div className="avalisa-shell avalisa-safety__grid">
          <figure>
            <img src="/images/landing/webapp-redesign/safety-shield-asset.png" alt="Avalisa safety shield" />
          </figure>
          <div>
            <SectionTitle accent="safety.">Built on</SectionTitle>
            <p>
              Avalisa is automation with controls, not blind execution. The webapp bot checks
              Avalisa backend access and confirms PO account mode before it can run.
            </p>
            <div className="avalisa-rule-list">
              {safetyRules.map(([title, text]) => (
                <article key={title}>
                  <Check size={17} />
                  <strong>{title}</strong>
                  <span>{text}</span>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="avalisa-ai-section" id="ai">
        <div className="avalisa-shell avalisa-ai-section__grid">
          <div>
            <SectionTitle accent="Pair Scan.">Avalisa Bot</SectionTitle>
            <p>
              Avalisa Bot scans the active chart and can review eligible favorites when a setup
              is not clear. Signals stay visible before execution so the user can see what the
              bot is doing.
            </p>
            <ul>
              {aiPoints.map((point) => <li key={point}><Check size={15} /> {point}</li>)}
            </ul>
            <div className="avalisa-inline-actions">
              <SmartLink to="/pricing#basic" className="avalisa-button avalisa-button--dark">
                See AI Plans <ArrowRight size={17} />
              </SmartLink>
              <SmartLink to="/support" className="avalisa-text-link">
                Ask Avalisa support
              </SmartLink>
            </div>
          </div>
          <figure>
            <img src="/images/landing/po-graph.png" alt="Avalisa PO Bot running on a Pocket Option chart" />
          </figure>
        </div>
      </section>

      <section className="avalisa-pricing" id="pricing">
        <div className="avalisa-shell avalisa-pricing__head">
          <SectionTitle accent="Real access.">Simple pricing.</SectionTitle>
          <p>
            Demo starts free. Basic and Pro unlock the paid plan rules already connected
            through Avalisa backend and Supabase/Postgres.
          </p>
        </div>
        <div className="avalisa-shell avalisa-pricing__grid">
          {plans.map((plan) => (
            <article className={plan.featured ? 'is-featured' : ''} key={plan.name}>
              {plan.featured && <b>Most Popular</b>}
              <span>{plan.name}</span>
              <h3>{plan.price}<small>{plan.period}</small></h3>
              <p>{plan.text}</p>
              <ul>
                {plan.items.map((item) => <li key={item}><Check size={14} /> {item}</li>)}
              </ul>
              <SmartLink to={plan.href} className="avalisa-button avalisa-button--pricing">
                {plan.cta}
              </SmartLink>
            </article>
          ))}
          <aside>
            <Gift size={28} />
            <strong>New to Pocket Option?</strong>
            <p>Register through Avalisa and request Pro unlock. The first-deposit bonus code is applied by the link automatically — if Pocket Option asks for it, it&apos;s {AFFILIATE_PROMO_CODE}.</p>
            <SmartLink href={AFFILIATE_URL} external className="avalisa-button avalisa-button--gold">
              Open Pocket Option <ArrowRight size={17} />
            </SmartLink>
          </aside>
        </div>
      </section>

      <section className="avalisa-final">
        <div className="avalisa-shell avalisa-final__grid">
          <div>
            <SectionTitle accent="Avalisa?">Ready to experience</SectionTitle>
            <p>
              Start in demo, confirm your account access, then choose the device path that fits your workflow.
              Trading involves risk and Avalisa does not guarantee profits.
            </p>
          </div>
          <div className="avalisa-final__actions">
            <SmartLink to="/register" className="avalisa-button avalisa-button--gold">
              Start Demo Now <ArrowRight size={17} />
            </SmartLink>
            <SmartLink href={CHROME_EXTENSION_URL} external className="avalisa-button avalisa-button--outline">
              Install Extension <Puzzle size={17} />
            </SmartLink>
          </div>
        </div>
      </section>
    </main>
  );
}
