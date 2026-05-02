import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Gauge,
  Gift,
  Globe,
  Puzzle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { useLenis } from '../lib/useLenis';
import '../styles/luxury.css';

const AFFILIATE_URL =
  'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const CHROME_EXTENSION_URL = process.env.REACT_APP_CHROME_STORE_URL || 'https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa';

const features = [
  { icon: Bot, title: 'AI Pair Scan', text: 'Avalisa checks the active chart and your favorite pairs before selecting a setup.', decision: ['Pair Scan', 'EUR/USD passed'] },
  { icon: Gauge, title: 'Smart Filters', text: 'Payout, volatility, momentum, RSI, and Bollinger context are checked before execution.', decision: ['Payout Filter', '92%'] },
  { icon: ShieldCheck, title: 'Risk Control', text: 'Start amount, strategy, intensity, and manual stop stay visible in the bot panel.', decision: ['Risk Mode', 'Medium'] },
  { icon: Zap, title: 'Auto Execute', text: 'When the setup passes, Avalisa sends CALL or PUT from the Pocket Option page.', decision: ['Next Action', 'CALL'] },
];

const plans = [
  { name: 'Demo', price: '10', unit: 'trades', text: 'Test Martingale mode first.', cta: 'Start Demo', href: '/register', features: ['10 trades', 'Martingale only', 'No start amount cap', 'Support chat'] },
  { name: 'Basic', price: '$69', text: 'Unlimited Martingale access.', cta: 'Get Basic Plan', href: '/pricing#basic', featured: true, features: ['Unlimited trades', 'Martingale only', 'No start amount cap', 'Email support'] },
  { name: 'Pro', price: '$119', text: 'Martingale plus Avalisa AI.', cta: 'Get Pro Plan', href: '/pricing#pro', features: ['Unlimited trades', 'Martingale mode', 'Avalisa AI mode', 'Affiliate unlock'] },
];

const faqs = [
  ['Is Avalisa a website or extension?', 'Avalisa is a Chrome extension that runs on top of your Pocket Option chart. The website manages account, plans, support, and setup.'],
  ['Can I try it before paying?', 'Yes. Start with Demo and use Martingale mode first so you understand the workflow before risking real money.'],
  ['Does Avalisa guarantee profit?', 'No. Trading involves risk. Avalisa automates a visible process, but market outcomes are never guaranteed.'],
];

const testimonials = [
  ['Alex T.', 'Bangkok', 'Avalisa made my demo sessions feel organized. My win rate improved because I could follow the scan, entry, amount, and result in one clean panel.'],
  ['Sarah K.', 'Singapore', 'The best part is consistency. I can test a strategy, see the trade history, and understand what is working before I increase my start amount.'],
  ['Mike R.', 'Dubai', 'The dashboard feels premium and simple. I can check profit, win rate, and recent trades quickly, then let the bot handle the repetitive steps.'],
  ['Daniel P.', 'London', 'It is much cleaner than signal groups. Avalisa keeps me focused on good setups, controlled amounts, and a calmer Pocket Option workflow.'],
];

const dashboardTabs = {
  Overview: {
    title: 'Dashboard Overview',
    stats: ['Total Trades|128', 'Win Rate|72.3%', 'Profit|+$1,248.00', 'Balance|$10,000.00'],
    chart: '0,150 40,132 80,140 120,118 160,104 200,111 240,86 280,92 320,70 360,55 400,61 440,35 500,24',
  },
  'Bot Panel': {
    title: 'Bot Control',
    stats: ['Pair Scan|Top Pairs', 'Intensity|Medium', 'Start Amount|$100', 'Mode|Demo'],
    chart: '0,120 50,95 95,112 140,75 190,84 230,48 280,63 330,40 380,58 430,26 500,34',
  },
  Trades: {
    title: 'Recent Trades',
    stats: ['Today|18', 'Wins|13', 'Losses|5', 'Payout|+$482.00'],
    chart: '0,140 45,138 95,118 145,130 190,92 245,104 300,74 350,80 405,52 455,68 500,36',
  },
  History: {
    title: 'Trade History',
    stats: ['7 Days|128', 'Best Pair|EUR/USD', 'Avg Payout|87%', 'Net|+$1,248.00'],
    chart: '0,155 45,145 90,132 135,118 180,126 225,100 270,88 315,72 360,68 405,48 455,42 500,24',
  },
  Strategies: {
    title: 'Strategy Room',
    stats: ['Active|Martingale', 'Protection|On', 'AI Signal|Ready', 'Manual Stop|Visible'],
    chart: '0,120 55,124 100,96 150,102 205,80 255,86 305,58 355,68 405,42 455,50 500,30',
  },
  Settings: {
    title: 'Settings Sync',
    stats: ['Theme|Gold', 'Alerts|On', 'Cloud Sync|Ready', 'Security|2FA'],
    chart: '0,130 55,112 110,116 165,92 220,96 275,72 330,76 385,58 440,54 500,42',
  },
  Billing: {
    title: 'Billing',
    stats: ['Plan|Pro', 'Renewal|None', 'Payment|One-time', 'Status|Active'],
    chart: '0,120 65,122 130,110 195,112 260,94 325,96 390,82 455,78 500,66',
  },
  Affiliate: {
    title: 'Affiliate',
    stats: ['Clicks|1,248', 'Signups|142', 'Conversions|27', 'Commission|$480'],
    chart: '0,150 50,134 100,118 150,116 200,94 250,84 300,78 350,56 400,48 450,34 500,26',
  },
};

function LogoMark() {
  return (
    <span className="lux-logo">
      <img className="brand-signature brand-signature--lux" src="/images/brand/avalisa-signature-logo-gold.png" alt="Avalisa PO Bot" />
    </span>
  );
}

function ButtonLink({ children, className = '', to, href, external, icon: Icon }) {
  const content = (
    <>
      <span>{children}</span>
      {Icon && <Icon size={16} />}
    </>
  );
  const classes = `lux-button ${className}`;
  if (href || external) {
    return <a className={classes} href={href || to} target="_blank" rel="noreferrer">{content}</a>;
  }
  return <Link className={classes} to={to}>{content}</Link>;
}

function TradingStage() {
  const [running, setRunning] = useState(false);
  const [pairScan, setPairScan] = useState('Top Pairs');
  const [intensity, setIntensity] = useState('Medium');
  const [amount, setAmount] = useState('$100');
  const [lastAction, setLastAction] = useState('Ready');
  const activeLabel = running ? `Scanning ${pairScan}` : lastAction;

  function markTrade(direction) {
    setRunning(true);
    setLastAction(`${direction} queued at ${amount}`);
  }

  return (
    <motion.div
      className="lux-trading-stage"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        event.currentTarget.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
      }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15 }}
    >
      <div className="lux-stage-halo" aria-hidden="true" />
      <div className="lux-po-window">
        <img
          className="lux-po-graph"
          src="/images/landing/po-graph.png"
          alt="Pocket Option chart with Avalisa Bot overlay"
        />
        <div className="lux-po-window__shade" aria-hidden="true" />
        <div className="lux-po-bar" aria-hidden="true">
          <span className="lux-po-brand"><img src="/images/PO_Logo.png" alt="" /> Pocket Option</span>
          <span>QT Demo $10,000.00</span>
          <button type="button">Top-Up</button>
        </div>
        <div className="lux-trade-rail" aria-hidden="true">
          <small>Time<strong>00:30</strong></small>
          <small>Amount<strong>$100</strong></small>
          <small>Payout<strong>+87%</strong></small>
          <button className="is-call" type="button" onClick={() => markTrade('CALL')}>CALL</button>
          <button className="is-put" type="button" onClick={() => markTrade('PUT')}>PUT</button>
        </div>
      </div>

      <motion.img
        className="lux-mascot lux-mascot--hero"
        src="/images/landing/generated/avalisa-hero-girl-gemini.png"
        alt="Avalisa AI brand ambassador"
        draggable="false"
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.aside className="lux-bot-panel" animate={{ y: running ? [0, -4, 0] : 0 }} transition={{ duration: 1.5, repeat: running ? Infinity : 0 }}>
        <div className="lux-bot-head">
          <strong><Zap size={18} fill="currentColor" /> Avalisa Bot</strong>
          <span>{running ? 'Live' : 'Ready'}</span>
        </div>
        <h3>Avalisa AI</h3>
        <label>Pair Scan<select value={pairScan} onChange={(event) => setPairScan(event.target.value)}><option>Top Pairs</option><option>EUR/USD</option><option>Current Pair</option></select></label>
        <label>Intensity<select value={intensity} onChange={(event) => setIntensity(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label>Start Amount<select value={amount} onChange={(event) => setAmount(event.target.value)}><option>$1</option><option>$10</option><option>$100</option></select></label>
        <button type="button" onClick={() => setRunning((value) => !value)}>{running ? 'Pause Scan' : 'Start'}</button>
        <p><span /> Status: {activeLabel}</p>
        <div className="lux-signal-tape">
          <span>Risk {intensity}</span>
          <span>{amount}</span>
          <span>{running ? 'Live scan' : 'Standby'}</span>
        </div>
      </motion.aside>

    </motion.div>
  );
}

function DashboardPreview() {
  const tabNames = Object.keys(dashboardTabs);
  const [activeTab, setActiveTab] = useState('Overview');
  const [botRunning, setBotRunning] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const tab = dashboardTabs[activeTab];
  const tourCopy = [
    'Let Avalisa guide your first demo setup.',
    'Choose pair scan, intensity, and amount.',
    'Keep the panel visible while the scan runs.',
  ];

  return (
    <div className="lux-shell lux-dashboard-preview">
      <div className="lux-dash-nav">
        {tabNames.map((item) => (
          <button
            type="button"
            className={activeTab === item ? 'is-active' : ''}
            key={item}
            onClick={() => setActiveTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <motion.div
        className="lux-dash-main"
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <div className="lux-dash-head"><h2>{tab.title}</h2><img src="/images/PO_Logo.png" alt="Pocket Option" /></div>
        <div className="lux-stat-row">
          {tab.stats.map((item) => {
            const [label, value] = item.split('|');
            return <div key={label}><span>{label}</span><strong>{value}</strong></div>;
          })}
        </div>
        <div className="lux-performance">
          <h3>{activeTab === 'Overview' ? 'Performance Chart' : `${activeTab} Signal Flow`}</h3>
          <svg viewBox="0 0 500 180" preserveAspectRatio="none"><motion.polyline points={tab.chart} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} /></svg>
        </div>
        <div className="lux-table">
          <div><span>Time</span><span>Pair</span><span>Direction</span><span>Result</span><span>Payout</span></div>
          <div><span>14:32:21</span><span>EUR/USD</span><b>CALL</b><em>Win</em><strong>+$187.00</strong></div>
          <div><span>14:30:12</span><span>GBP/JPY</span><i>PUT</i><em>Win</em><strong>+$187.00</strong></div>
          <div><span>14:28:04</span><span>AUD/USD</span><b>CALL</b><small>{botRunning ? 'Review' : 'Loss'}</small><mark>{botRunning ? '+$92.00' : '-$100.00'}</mark></div>
        </div>
      </motion.div>
      <div className="lux-dash-side">
        <div className={`lux-mini-bot ${botRunning ? 'is-running' : ''}`}>
          <h3>Avalisa Bot</h3>
          <p>Avalisa AI</p>
          <button type="button" onClick={() => setBotRunning((value) => !value)}>{botRunning ? 'Pause' : 'Start'}</button>
          <small>Status: {botRunning ? 'Scanning EUR/USD' : 'Ready'}</small>
        </div>
        <div className="lux-tour">
          <div>
            <strong>New here?</strong>
            <span>{tourCopy[tourStep]}</span>
          </div>
          <button type="button" onClick={() => setTourStep((step) => (step + 1) % tourCopy.length)}>
            {tourStep === tourCopy.length - 1 ? 'Restart Tour' : 'Take the Tour'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState('Basic');
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  useLenis();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveTestimonial((index) => (index + 1) % testimonials.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

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
    <main className="lux-page">
      <section className="lux-hero" id="top">
        <img
          className="lux-mascot lux-mascot--mobile-hero"
          src="/images/landing/generated/avalisa-hero-girl-gemini.png"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <div className="lux-shell lux-hero-grid">
          <motion.div className="lux-hero-copy" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.65 }}>
            <p className="lux-kicker">Chrome extension for Pocket Option</p>
            <h1>Trade on <span>Autopilot.</span></h1>
            <p className="lux-lede">
              Avalisa scans your Pocket Option chart, finds high-quality setups,
              and executes from a visible bot panel while you stay in control.
            </p>
            <ul className="lux-checks">
              <li><Globe size={16} /> Works directly inside Pocket Option</li>
              <li><Sparkles size={16} /> AI scans 24/7 for high-probability setups</li>
              <li><Gift size={16} /> Test first with 10 demo trades</li>
            </ul>
            <div className="lux-actions">
              <ButtonLink href={AFFILIATE_URL} external className="lux-button--gold" icon={ArrowRight}>Sign Up</ButtonLink>
              <ButtonLink href={CHROME_EXTENSION_URL} external className="lux-button--ghost" icon={Puzzle}>Chrome Extension</ButtonLink>
            </div>
            <p className="lux-micro">No credit card required. Demo first.</p>
          </motion.div>
          <TradingStage />
        </div>
      </section>

      <section className="lux-section" id="features">
        <div className="lux-shell lux-feature-layout">
          <div className="lux-feature-panel">
            <p className="lux-kicker">Powered by Avalisa AI</p>
            <h2>Precision meets automation.</h2>
            <p>Avalisa is designed to feel like a premium control room, not a black box. Every key decision is surfaced before execution.</p>
            <div className="lux-decision">
              {features.map((feature, index) => (
                <button
                  type="button"
                  className={activeFeature === index ? 'is-active' : ''}
                  key={feature.title}
                  onClick={() => setActiveFeature(index)}
                >
                  {feature.decision[0]} <strong>{feature.decision[1]}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="lux-feature-grid">
            {features.map(({ icon: Icon, title, text }, index) => (
              <motion.article
                whileHover={{ scale: 1.025 }}
                className={`lux-card ${activeFeature === index ? 'is-active' : ''}`}
                key={title}
                onClick={() => setActiveFeature(index)}
              >
                <Icon size={24} />
                <h3>{title}</h3>
                <p>{text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="lux-section" id="pricing">
        <div className="lux-shell lux-split-head">
          <div>
            <p className="lux-kicker">Pricing plans</p>
            <h2>Simple, transparent pricing.</h2>
          </div>
          <p>All plans are one-time payments. Start on demo, upgrade when the workflow fits your trading style.</p>
        </div>
        <div className="lux-shell lux-pricing-grid">
          {plans.map((plan) => (
            <motion.article
              whileHover={{ y: -8 }}
              className={`lux-price ${plan.featured ? 'is-featured' : ''} ${selectedPlan === plan.name ? 'is-selected' : ''}`}
              key={plan.name}
              onClick={() => setSelectedPlan(plan.name)}
            >
              {plan.featured && <b>MOST POPULAR</b>}
              <span>{plan.name}</span>
              <h3>{plan.price}<small>{plan.unit || 'one-time'}</small></h3>
              <p>{plan.text}</p>
              <ul>{plan.features.map((item) => <li key={item}>✓ {item}</li>)}</ul>
              <Link to={plan.href}>{plan.cta}</Link>
            </motion.article>
          ))}
          <aside className="lux-price-guide">
            <div className="lux-price-guide__portrait">
              <img src="/images/landing/generated/avalisa-pricing-guide-gemini.png" alt="Avalisa pricing guide" />
            </div>
            <div className="lux-price-guide__panel">
              <h3>Why Traders Choose Avalisa</h3>
              <ul>
                <li><Bot size={21} /><span><strong>AI Market Scan</strong>24/7 monitoring</span></li>
                <li><Gauge size={21} /><span><strong>Smart Entries</strong>High probability setups</span></li>
                <li><ShieldCheck size={21} /><span><strong>Risk Management</strong>Built-in protection</span></li>
                <li><Zap size={21} /><span><strong>Autopilot Mode</strong>Execute with confidence</span></li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <section className="lux-section" id="dashboard">
        <DashboardPreview />
      </section>

      <section className="lux-section">
        <div className="lux-shell lux-split-head">
          <div>
            <p className="lux-kicker">Trader reviews</p>
            <h2>Confidence, automated.</h2>
          </div>
          <p>Realistic trader feedback focused on demo testing, win-rate discipline, and profit control. Results vary, so start small and verify your own numbers.</p>
        </div>
        <div className="lux-shell lux-testimonial-grid">
          {testimonials.map(([name, location, quote], index) => (
            <motion.article
              whileHover={{ y: -6 }}
              className={`lux-testimonial ${activeTestimonial === index ? 'is-active' : ''}`}
              key={name}
              onClick={() => setActiveTestimonial(index)}
            >
              <div>
                {[0, 1, 2, 3, 4].map((star) => <Star key={star} size={14} fill="currentColor" />)}
              </div>
              <p>“{quote}”</p>
              <footer><strong>{name}</strong><span>{location}</span></footer>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="lux-section" id="faq">
        <div className="lux-shell lux-faq-layout">
          <div>
            <p className="lux-kicker">FAQ</p>
            <h2>Clear answers before you install.</h2>
          </div>
          <div className="lux-faq-list">
            {faqs.map(([question, answer], index) => (
              <button key={question} type="button" className={openFaq === index ? 'is-open' : ''} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                <strong>{question}<RefreshCcw size={16} /></strong>
                <span>{answer}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="lux-footer">
        <div className="lux-shell">
          <LogoMark />
          <nav aria-label="Footer index">
            <div><strong>Index</strong><a href="#top">Home</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></div>
            <div><strong>Account</strong><Link to="/login">Login</Link><Link to="/register">Sign up Avalisa</Link><a href={AFFILIATE_URL} target="_blank" rel="noreferrer">Pocket Option</a></div>
            <div><strong>Legal</strong><Link to="/privacy">Privacy</Link><span>Trading risk notice</span></div>
          </nav>
          <p>Trading involves risk. Past performance is not indicative of future results. Use demo mode first and never trade with money you cannot afford to lose.</p>
        </div>
      </footer>
    </main>
  );
}
