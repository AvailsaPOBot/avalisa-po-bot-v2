import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Brain,
  Check,
  Gift,
  Laptop,
  Lock,
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

const proofItems = [
  { icon: Puzzle, title: 'Chrome Extension', text: 'Desktop trading control for Pocket Option.' },
  { icon: Smartphone, title: 'Webapp Bot', text: 'Mobile-web shell for phone and tablet access.' },
  { icon: Brain, title: 'Avalisa AI Pair Scan', text: 'Current pair or favorites scan with confidence filters.' },
  { icon: Lock, title: 'Backend Plan Access', text: 'Same Avalisa login, paid plan, and free-tier gate.' },
  { icon: ShieldCheck, title: 'Confirmed Account Mode', text: 'Demo or Real only after PO account mode is readable.' },
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
    text: 'Unlimited Martingale plus starter Avalisa AI access.',
    href: '/pricing#basic',
    cta: 'View Basic',
    featured: true,
    items: ['Unlimited Martingale', '10 Avalisa AI trades', 'Cloud settings', 'Trade history'],
  },
  {
    name: 'Pro',
    price: '$119',
    period: 'one-time',
    text: 'All current modes unlocked for the full Avalisa workflow.',
    href: '/pricing#pro',
    cta: 'View Pro',
    items: ['Avalisa AI unlocked', 'Current modes included', 'Affiliate unlock path', 'Priority support'],
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

export default function Landing() {
  useLenis();

  return (
    <main className="avalisa-site">
      <section className="avalisa-hero" id="top">
        <div className="avalisa-shell avalisa-hero__grid">
          <motion.div
            className="avalisa-hero__copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1>
              Introducing
              <span className="avalisa-title-desktop">Avalisa PO Bot</span>
              <span className="avalisa-title-mobile">Avalisa PO<br />Bot</span>
            </h1>
            <p>
              Pocket Option automation refined through years of real product work. Use the
              Chrome extension on desktop, or open the webapp bot for mobile web access
              without installing an extension.
            </p>
            <div className="avalisa-hero__actions">
              <SmartLink to="/register" className="avalisa-button avalisa-button--gold">
                Start Free Demo <ArrowRight size={17} />
              </SmartLink>
              <SmartLink href={CHROME_EXTENSION_URL} external className="avalisa-button avalisa-button--outline">
                Install Extension <Puzzle size={17} />
              </SmartLink>
            </div>
            <div className="avalisa-proof-strip">
              {proofItems.map(({ icon: Icon, title, text }) => (
                <a href={title === 'Chrome Extension' ? CHROME_EXTENSION_URL : title === 'Backend Plan Access' ? '/login' : '#webapp'} target={title === 'Chrome Extension' ? '_blank' : undefined} rel={title === 'Chrome Extension' ? 'noreferrer' : undefined} key={title}>
                  <Icon size={21} />
                  <strong>{title}</strong>
                  <span>{text}</span>
                </a>
              ))}
            </div>
          </motion.div>

          <motion.figure
            className="avalisa-hero__visual"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.08 }}
          >
            <img src="/images/landing/webapp-redesign/hero-product-composite.png" alt="Avalisa PO Bot on desktop and mobile Pocket Option screens" />
          </motion.figure>
        </div>
      </section>

      <section className="avalisa-device-band" id="webapp">
        <div className="avalisa-shell avalisa-device-band__grid">
          <div>
            <SectionTitle accent="All your devices.">One Avalisa workflow.</SectionTitle>
            <p>
              The webapp bot is placed as the mobile access path on the Avalisa website,
              while desktop users can keep using the Chrome extension. Same Avalisa account,
              same backend access rules, same product discipline.
            </p>
            <SmartLink to="/register" className="avalisa-button avalisa-button--dark">
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
            <SectionTitle accent="Pair Scan.">Avalisa AI</SectionTitle>
            <p>
              Avalisa AI scans the active chart and can review eligible favorites when a setup
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
            <p>Register through Avalisa and request Pro unlock. Use code 50START when the Pocket Option first-deposit bonus is available.</p>
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
