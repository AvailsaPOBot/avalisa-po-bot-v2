import { useEffect } from 'react';
import Hero from './landing/Hero';
import HowItWorks from './landing/HowItWorks';
import BotDemo from './landing/BotDemo';
import CharlesAI from './landing/CharlesAI';
import PricingTeaser from './landing/PricingTeaser';
import RealResults from './landing/RealResults';
import FAQ from './landing/FAQ';
import FinalCTA from './landing/FinalCTA';
import Footer from './landing/Footer';
import { useLenis } from '../lib/useLenis';
import '../styles/landing.css';

const AFFILIATE_URL =
  'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/PENDING';

const HOW_IT_WORKS_STEPS = [
  {
    id: 'step-01',
    number: '01',
    title: 'Connect Pocket Option',
    body: 'New here? Register a Pocket Option account through our affiliate link — Lifetime tier comes free. Already trade on PO? Skip to step 2.',
    ctaLabel: 'Register PO',
    ctaHref: AFFILIATE_URL,
    external: true,
  },
  {
    id: 'step-02',
    number: '02',
    title: 'Install the extension',
    body: 'Add Avalisa to Chrome in 30 seconds. Sign up at avalisabot.vercel.app to claim your tier.',
    ctaLabel: 'Add to Chrome',
    ctaHref: CHROME_STORE_URL,
    external: true,
  },
  {
    id: 'step-03',
    number: '03',
    title: 'Let Charles trade',
    body: 'Open Pocket Option, click the Avalisa button, pick a strategy, hit Start. Charles takes over.',
    ctaLabel: 'See it in action',
    ctaHref: '#demo',
  },
];

const STRATEGY_CARDS = [
  {
    level: 'LOW',
    pitch: 'More trades. Forex + OTC. Best for weekends.',
    detail: 'RSI 30/70, BB k=2.0, momentum optional',
  },
  {
    level: 'MID',
    badge: 'default',
    pitch: 'Balanced. Forex only.',
    detail: 'RSI 25/75, BB k=2.2, OTC filter on',
  },
  {
    level: 'HIGH',
    pitch: 'Selective. Strict filters. Higher conviction.',
    detail: 'RSI 20/80, BB k=2.5, OTC filter on, conflict guard',
  },
];

const PRICING_TIERS = [
  {
    name: 'FREE',
    price: '$0',
    trades: '10 trades',
    tagline: 'Try Charles risk-free',
    ctaLabel: 'Start Free',
    ctaHref: '/register',
  },
  {
    name: 'BASIC',
    price: '$50 once',
    trades: '100 trades',
    tagline: 'For weekend traders',
    ctaLabel: 'Buy Basic',
    ctaHref: '/pricing#basic',
  },
  {
    name: 'LIFETIME',
    price: '$100 once',
    trades: 'Unlimited',
    tagline: 'Most popular',
    ctaLabel: 'Get Lifetime',
    ctaHref: '/pricing#lifetime',
    highlighted: true,
  },
];

const RESULTS = [
  { value: '61%', label: 'win rate' },
  { value: '12,847', label: 'trades executed' },
  { value: '184', label: 'active traders' },
];

const FAQ_ITEMS = [
  {
    question: 'Is Avalisa safe to use on my real PO account?',
    answer: 'Yes. The extension only reads market data and clicks buy/sell on your behalf. No password, no API key, no money leaves PO.',
  },
  {
    question: "What's the minimum I need to start?",
    answer: '$10 USD on Pocket Option and the free Avalisa tier. Try 10 trades on demo first.',
  },
  {
    question: 'Do I need to know how to trade?',
    answer: 'No. Pick an intensity, hit Start. Charles handles entries and exits.',
  },
  {
    question: 'What happens if I close my browser?',
    answer: 'Charles stops. Re-open Pocket Option, click the Avalisa button, hit Start. Resumes instantly.',
  },
  {
    question: 'How does Charles decide CALL vs PUT?',
    answer: 'Regime detection (trending vs ranging) + RSI + Bollinger Bands + momentum confirm. Skips trades when signals conflict.',
  },
  {
    question: 'Can I switch between strategies?',
    answer: 'Yes. Charles (AI) and Martingale modes coexist. Switch any time.',
  },
  {
    question: "What's the difference between Free / Basic / Lifetime?",
    answer: 'Free: 10 trades to test. Basic: 100 trades for $50. Lifetime: unlimited for $100. All tiers include Charles AI.',
  },
  {
    question: 'How do I get Lifetime free?',
    answer: 'Register a Pocket Option account through our affiliate link. We grant Lifetime automatically once your PO account confirms.',
  },
  {
    question: 'Is this gambling or trading?',
    answer: "Binary options is high-risk speculation. Charles improves your odds with disciplined rules — it doesn't eliminate risk. Trade only what you can afford to lose.",
  },
  {
    question: 'How do refunds work?',
    answer: 'All sales final. We offer a free tier so you can validate Charles on your account before paying.',
  },
];

export default function Landing() {
  useLenis();

  useEffect(() => {
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    const allReveals = Array.from(document.querySelectorAll('.landing-reveal'));
    const stepCards = Array.from(document.querySelectorAll('.landing-step-card'));

    const showAll = () => {
      [...allReveals, ...stepCards].forEach((element, index) => {
        element.style.setProperty('--landing-delay', `${index * 70}ms`);
        element.classList.add('is-visible');
      });
    };

    const setup = () => {
      root.toggleAttribute('data-reduced-motion', reduceMotionQuery.matches);

      if (reduceMotionQuery.matches) {
        showAll();
        return () => {};
      }

      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.16, rootMargin: '0px 0px -100px 0px' }
      );

      allReveals.forEach((element, index) => {
        element.style.setProperty('--landing-delay', `${index * 70}ms`);
        revealObserver.observe(element);
      });

      const ladderObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            stepCards.forEach((card, index) => {
              window.setTimeout(() => card.classList.add('is-visible'), index * 120);
            });
            ladderObserver.disconnect();
          });
        },
        { threshold: 0.22 }
      );

      const ladder = document.getElementById('how-it-works');
      if (ladder) {
        ladderObserver.observe(ladder);
      }

      return () => {
        revealObserver.disconnect();
        ladderObserver.disconnect();
      };
    };

    let cleanup = setup();
    const handleChange = () => {
      cleanup();
      cleanup = setup();
    };

    reduceMotionQuery.addEventListener('change', handleChange);

    return () => {
      cleanup();
      reduceMotionQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <main className="landing-page">
      <Hero />
      <HowItWorks steps={HOW_IT_WORKS_STEPS} />
      <BotDemo />
      <CharlesAI cards={STRATEGY_CARDS} />
      <PricingTeaser tiers={PRICING_TIERS} affiliateUrl={AFFILIATE_URL} />
      <RealResults results={RESULTS} />
      <FAQ items={FAQ_ITEMS} />
      <FinalCTA />
      <Footer />
    </main>
  );
}
