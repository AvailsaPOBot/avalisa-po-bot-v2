import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import '../styles/luxury.css';

const FALLBACK_AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const API_BASE = process.env.REACT_APP_API_URL || 'https://avalisa-backend.onrender.com';

export default function Pricing() {
  const { user } = useAuth();
  const currentPlan = user?.license?.plan || null;
  const [affiliateLink, setAffiliateLink] = useState(FALLBACK_AFFILIATE_LINK);

  useEffect(() => {
    fetch(`${API_BASE}/api/config/affiliate-link`)
      .then((r) => r.json())
      .then((data) => { if (data?.url) setAffiliateLink(data.url); })
      .catch(() => {});
  }, []);

  const email = user?.email || '';
  const appendEmail = (url) => {
    if (!url || url === '#') return '#';
    const separator = url.includes('?') ? '&' : '?';
    return email ? `${url}${separator}checkout[email]=${encodeURIComponent(email)}` : url;
  };

  const plans = [
    {
      id: 'demo',
      name: 'Demo',
      price: '10',
      period: 'trades',
      description: 'Existing users can test Martingale mode before upgrading.',
      cta: 'Open Pocket Option',
      href: affiliateLink,
      external: true,
      features: ['10 trades', 'Martingale mode only', 'No starting amount cap', 'All supported timeframes', 'Basic trade history'],
    },
    {
      id: 'basic',
      name: 'Basic',
      price: '$69',
      period: 'one-time',
      description: 'Unlimited Martingale access plus 10 Avalisa AI trades.',
      cta: 'Buy Basic — $69',
      href: appendEmail(process.env.REACT_APP_WHOP_BASIC_URL),
      external: true,
      featured: true,
      features: ['Unlimited Martingale', '10 Avalisa AI trades', 'No starting amount cap', 'Cloud settings sync', 'Trade history'],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$119',
      period: 'one-time',
      description: 'Unlock everything available in the current product.',
      cta: 'Buy Pro — $119',
      href: appendEmail(process.env.REACT_APP_WHOP_PRO_URL || process.env.REACT_APP_WHOP_LIFETIME_URL),
      external: true,
      features: ['Unlimited Martingale', 'Avalisa AI unlocked', 'Current modes included', 'No starting amount cap', 'Priority support'],
    },
  ];

  return (
    <main className="lux-pricing-page">
      <section className="lux-price-hero lux-shell">
        <div>
          <p className="lux-kicker">Pricing</p>
          <h1>Simple, transparent pricing.</h1>
        </div>
      </section>

      <section className="lux-shell lux-pricing-grid lux-pricing-grid--page">
        {plans.map((plan) => {
          const current = currentPlan === plan.id || (currentPlan === 'free' && plan.id === 'demo') || (currentPlan === 'lifetime' && plan.id === 'pro');
          return (
            <article className={`lux-price ${plan.featured ? 'is-featured' : ''}`} id={plan.id} key={plan.id}>
              {plan.featured && <b>MOST POPULAR</b>}
              <span>{plan.name}</span>
              <h3>{plan.price}<small>{plan.period}</small></h3>
              <p>{plan.description}</p>
              <ul>{plan.features.map((item) => <li key={item}><Check size={14} /> {item}</li>)}</ul>
              {current ? (
                <button type="button" disabled>Current Plan</button>
              ) : plan.external ? (
                <a href={plan.href || '#'} target="_blank" rel="noreferrer">{plan.cta}</a>
              ) : (
                <Link to={plan.href}>{plan.cta}</Link>
              )}
            </article>
          );
        })}
        <aside className="lux-price-guide lux-price-guide--page">
          <img src="/images/landing/avalisa-blonde-pricing.png" alt="Avalisa pricing guide" />
        </aside>
      </section>

      <p className="lux-affiliate-note lux-shell">
        New to Pocket Option? Sign up through us and the <strong>Pro plan unlocks free</strong> — use code <strong>50START</strong> for a 50% first-deposit bonus (Pocket Option offer, terms apply).
      </p>

      <p className="lux-risk-note lux-shell">
        Trading involves risk. Avalisa does not guarantee profits. Use demo mode first and trade responsibly.
      </p>
    </main>
  );
}
