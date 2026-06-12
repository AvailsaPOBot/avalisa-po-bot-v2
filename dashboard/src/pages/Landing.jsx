import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Check,
  Gauge,
  Gift,
  Laptop,
  Lock,
  MonitorSmartphone,
  Puzzle,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
} from 'lucide-react';
import { useLenis } from '../lib/useLenis';
import '../styles/luxury.css';

const AFFILIATE_URL =
  'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const CHROME_EXTENSION_URL = process.env.REACT_APP_CHROME_STORE_URL || 'https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa';

const deviceCards = [
  { name: 'iPhone', size: '390 x 844', icon: Smartphone },
  { name: 'Android', size: '412 x 915', icon: Smartphone },
  { name: 'iPad', size: '820 x 1080', icon: TabletSmartphone },
  { name: 'Mac / Windows', size: '1180 x 900', icon: Laptop },
];

const signalSteps = [
  ['Account mode', 'Demo or Real confirmed'],
  ['Pair scan', 'Current or favorites'],
  ['Avalisa AI', 'Low / Mid / High'],
  ['Trade lock', 'No duplicate orders'],
];

const plans = [
  {
    id: 'demo',
    name: 'Demo',
    price: '10',
    period: 'trades',
    copy: 'Start with the safest workflow and see the bot panel before upgrading.',
    cta: 'Create Demo Account',
    href: '/register',
    items: ['10 demo trades', 'Martingale mode', 'Dashboard access', 'Support chat'],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: '$69',
    period: 'one-time',
    copy: 'Unlock Martingale plus a starter allocation for Avalisa AI.',
    cta: 'View Basic',
    href: '/pricing#basic',
    featured: true,
    items: ['Unlimited Martingale', '10 Avalisa AI trades', 'Cloud settings', 'Trade history'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$119',
    period: 'one-time',
    copy: 'Everything currently available, including Avalisa AI unlocks.',
    cta: 'View Pro',
    href: '/pricing#pro',
    items: ['Avalisa AI unlocked', 'Current modes included', 'Affiliate unlock path', 'Priority support'],
  },
];

function ButtonLink({ to, href, external, children, variant = 'gold', icon: Icon = ArrowRight }) {
  const className = `lux-button ${variant === 'ghost' ? 'lux-button--ghost' : 'lux-button--gold'}`;
  const content = (
    <>
      <span>{children}</span>
      <Icon size={17} />
    </>
  );
  if (href || external) {
    return <a className={className} href={href || to} target="_blank" rel="noreferrer">{content}</a>;
  }
  return <Link className={className} to={to}>{content}</Link>;
}

function DeviceMockup() {
  const [running, setRunning] = useState(false);

  return (
    <motion.div
      className="phone-launch-stage"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.12 }}
    >
      <img
        className="phone-launch-stage__girl"
        src="/images/landing/avalisa-phone-bot-hero.jpg"
        alt="Avalisa assistant beside a trading screen"
      />
      <div className="device-board" aria-label="Avalisa Phone Bot responsive device preview">
        <div className="device-laptop">
          <div className="device-topbar">
            <span />
            <span />
            <span />
            <strong>Avalisa Phone Bot</strong>
          </div>
          <div className="po-login-card">
            <img src="/images/PO_Logo.png" alt="Pocket Option" />
            <h3>PO Trade</h3>
            <div />
            <div />
            <button type="button">Sign In</button>
          </div>
        </div>
        <div className="device-phone device-phone--left">
          <div className="phone-screen">
            <strong>Avalisa</strong>
            <span>QT Demo</span>
            <div className="mini-chart" />
            <button type="button">Start Bot</button>
          </div>
        </div>
        <div className="device-phone device-phone--right">
          <div className="phone-screen phone-screen--dark">
            <strong>Avalisa AI</strong>
            <label>Pair Scan</label>
            <label>Intensity</label>
            <button type="button" onClick={() => setRunning((value) => !value)}>
              {running ? 'Scanning' : 'Ready'}
            </button>
          </div>
        </div>
      </div>
      <div className="phone-safety-card">
        <ShieldCheck size={18} />
        <span>Real/demo detection fixed</span>
        <strong>Real execution enabled</strong>
      </div>
    </motion.div>
  );
}

function SignalConsole() {
  const [active, setActive] = useState(1);

  return (
    <div className="signal-console">
      <div className="signal-console__main">
        <div className="signal-console__header">
          <div>
            <span>Avalisa AI</span>
            <strong>{signalSteps[active][1]}</strong>
          </div>
          <button type="button" onClick={() => setActive((value) => (value + 1) % signalSteps.length)}>
            Next check
          </button>
        </div>
        <div className="signal-bars" aria-hidden="true">
          {[38, 62, 45, 78, 55, 88, 64, 72, 48, 84, 67, 91].map((height, index) => (
            <i key={index} style={{ height: `${height}%` }} className={index % 4 === 0 ? 'is-red' : ''} />
          ))}
        </div>
      </div>
      <div className="signal-console__checks">
        {signalSteps.map(([label, value], index) => (
          <button
            type="button"
            className={active === index ? 'is-active' : ''}
            key={label}
            onClick={() => setActive(index)}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const [selectedPlan, setSelectedPlan] = useState('basic');
  useLenis();

  useEffect(() => {
    function scrollToHash() {
      const id = window.location.hash.slice(1);
      if (!id) return;
      window.requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      });
    }

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  return (
    <main className="lux-page phone-launch-page">
      <section className="phone-hero" id="top">
        <div className="lux-shell phone-hero__grid">
          <motion.div
            className="phone-hero__copy"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1>Avalisa Phone Bot for every screen.</h1>
            <p>
              A new Avalisa shell for Pocket Option mobile web, built to fit phone, tablet,
              Mac, and Windows screens while keeping the trading controls visible.
            </p>
            <div className="phone-hero__actions">
              <ButtonLink to="/register">Start Demo</ButtonLink>
              <ButtonLink href={CHROME_EXTENSION_URL} external variant="ghost" icon={Puzzle}>
                Install Chrome Extension
              </ButtonLink>
            </div>
            <ul className="phone-proof-list">
              <li><Check size={16} /> Responsive Phone Bot shell tested across common device sizes</li>
              <li><Check size={16} /> Same Avalisa login, paid plan, and free-tier access as the extension</li>
              <li><Check size={16} /> Real/demo account detection now uses the active PO account</li>
              <li><Check size={16} /> Phone Bot can place Demo or Real trades after account mode is confirmed</li>
            </ul>
          </motion.div>
          <DeviceMockup />
        </div>
      </section>

      <section className="phone-section" id="phone-bot">
        <div className="lux-shell phone-section__head">
          <h2>One Avalisa workflow, sized for every device.</h2>
          <p>
            The Phone Bot beta is designed for the way traders actually open Pocket Option:
            on a phone first, then tablet or desktop when they want a larger view. Access is
            checked through the Avalisa backend before the bot starts.
          </p>
        </div>
        <div className="lux-shell device-card-grid">
          {deviceCards.map(({ name, size, icon: Icon }) => (
            <article key={name}>
              <Icon size={24} />
              <strong>{name}</strong>
              <span>{size}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="phone-section phone-section--split" id="ai">
        <div className="lux-shell phone-split">
          <div>
            <h2>Avalisa AI stays visible before every action.</h2>
            <p>
              Pair scan, payout checks, intensity, trade lock, amount, and account mode are
              surfaced in the bot panel before Demo or Real execution.
            </p>
            <div className="phone-feature-list">
              <div><Bot size={20} /><span><strong>AI Pair Scan</strong> Current pair or favorites scan.</span></div>
              <div><Gauge size={20} /><span><strong>Smart Filters</strong> Payout and candle context before entry.</span></div>
              <div><Lock size={20} /><span><strong>Trade Lock</strong> Blocks duplicate order attempts while a trade is pending.</span></div>
            </div>
          </div>
          <SignalConsole />
        </div>
      </section>

      <section className="phone-section" id="pricing">
        <div className="lux-shell phone-section__head">
          <h2>Start with demo. Upgrade when the workflow fits.</h2>
          <p>
            Existing desktop users can continue with the Chrome extension. Mobile-first users
            should test demo first, then use Real mode only with responsible risk controls.
          </p>
        </div>
        <div className="lux-shell phone-pricing-grid">
          {plans.map((plan) => (
            <article
              className={selectedPlan === plan.id ? 'is-selected' : ''}
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
            >
              {plan.featured && <b>Most Popular</b>}
              <span>{plan.name}</span>
              <h3>{plan.price}<small>{plan.period}</small></h3>
              <p>{plan.copy}</p>
              <ul>
                {plan.items.map((item) => <li key={item}><Check size={14} /> {item}</li>)}
              </ul>
              <Link to={plan.href}>{plan.cta}</Link>
            </article>
          ))}
        </div>
        <div className="lux-shell affiliate-band">
          <div>
            <Gift size={22} />
            <strong>New to Pocket Option?</strong>
            <span>Register through Avalisa and request Pro unlock. Use code 50START for Pocket Option’s first-deposit bonus when available.</span>
          </div>
          <a href={AFFILIATE_URL} target="_blank" rel="noreferrer">Open Pocket Option <ArrowRight size={16} /></a>
        </div>
      </section>

      <section className="phone-section" id="faq">
        <div className="lux-shell phone-faq">
          <div>
            <h2>Ready for public traffic on any device.</h2>
            <p>
              The Phone Bot now supports confirmed Demo and Real account modes. Unknown account
              mode still stays locked so the bot does not trade when PO state cannot be read.
            </p>
          </div>
          <div className="phone-faq__items">
            <article>
              <MonitorSmartphone size={21} />
              <strong>Can the website work on PC and Mac?</strong>
              <span>Yes. The Avalisa website and dashboard are browser responsive, and the Chrome extension remains available for desktop users.</span>
            </article>
            <article>
              <Lock size={21} />
              <strong>Do paid plans work in the Phone Bot?</strong>
              <span>Yes. Users log in with the same Avalisa account. Paid plans and free-tier limits are checked before the bot can run.</span>
            </article>
            <article>
              <Smartphone size={21} />
              <strong>Can the Phone Bot fit iPhone, Android, and iPad?</strong>
              <span>Yes. The current shell has been tested at representative phone, Android, iPad, and desktop sizes.</span>
            </article>
            <article>
              <ShieldCheck size={21} />
              <strong>Does it guarantee profit?</strong>
              <span>No. Trading involves risk. Avalisa should be tested in demo first and used only with responsible risk controls.</span>
            </article>
          </div>
        </div>
      </section>

      <footer className="phone-footer">
        <div className="lux-shell">
          <img src="/images/brand/avalisa-signature-logo-gold.png" alt="Avalisa PO Bot" />
          <nav aria-label="Footer navigation">
            <a href="#phone-bot">Phone Bot</a>
            <a href="#ai">Avalisa AI</a>
            <a href="#pricing">Pricing</a>
            <Link to="/privacy">Privacy</Link>
          </nav>
          <p>Trading involves risk. Use demo mode first. Avalisa does not guarantee profits.</p>
        </div>
      </footer>
    </main>
  );
}
