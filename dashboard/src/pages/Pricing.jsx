import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';
import '../styles/luxury.css';
import { AVALISA_CHARACTER_IMAGE } from '../lib/brandAssets';
import {
  appendCheckoutEmail,
  WHOP_BASIC_CHECKOUT_URL,
  WHOP_PRO_CHECKOUT_URL,
} from '../lib/checkout';

const FALLBACK_AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const API_BASE = process.env.REACT_APP_API_URL || 'https://avalisa-backend.onrender.com';

export function trackCheckoutClick(plan) {
  const url = `${API_BASE}/api/funnel/checkout-click`;
  const body = JSON.stringify({ plan });

  try {
    const beacon = typeof navigator !== 'undefined' ? navigator.sendBeacon : null;
    if (typeof beacon === 'function' && beacon.call(navigator, url, new Blob([body], { type: 'application/json' }))) {
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch (err) {
    // Checkout navigation must not depend on analytics.
  }
}

export default function Pricing() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentPlan = user?.license?.plan || null;
  const [affiliateLink, setAffiliateLink] = useState(FALLBACK_AFFILIATE_LINK);
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [paypalBusyPlan, setPaypalBusyPlan] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const captureStarted = useRef(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/config/affiliate-link`)
      .then((r) => r.json())
      .then((data) => { if (data?.url) setAffiliateLink(data.url); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/payments/paypal/status`)
      .then((r) => r.json())
      .then((data) => setPaypalEnabled(Boolean(data?.enabled)))
      .catch(() => setPaypalEnabled(false));
  }, []);

  useEffect(() => {
    if (!location.hash) return;

    const targetId = location.hash.slice(1);
    const target = document.getElementById(targetId);
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [location.hash]);

  useEffect(() => {
    const search = new URLSearchParams(location.search || '');
    const paypalState = search.get('paypal');
    const orderId = search.get('token');
    if (paypalState === 'cancelled') {
      toast('PayPal checkout cancelled.');
      return;
    }
    if (paypalState !== 'approved' || !orderId || captureStarted.current) return;

    captureStarted.current = true;
    toast.loading('Confirming PayPal payment...', { id: 'paypal-capture' });
    api.post(`/api/payments/paypal/orders/${encodeURIComponent(orderId)}/capture`)
      .then(async () => {
        const { data: refreshedUser } = await api.get('/api/auth/me');
        localStorage.setItem('user', JSON.stringify(refreshedUser));
        toast.success('Payment confirmed. Your Avalisa access is active.', { id: 'paypal-capture' });
        window.location.href = '/dashboard';
      })
      .catch((err) => {
        toast.error(err.response?.data?.error || 'PayPal payment could not be confirmed. Contact support.', { id: 'paypal-capture' });
      });
  }, [location.search]);

  const email = user?.email || '';
  async function startPayPalCheckout(planId) {
    if (!user) {
      toast.error('Sign in or create an Avalisa account before PayPal checkout.');
      navigate('/login?authError=sign_in_before_paypal_checkout');
      return;
    }

    setPaypalBusyPlan(planId);
    try {
      const { data } = await api.post('/api/payments/paypal/orders', { plan: planId });
      window.location.href = data.approvalUrl;
    } catch (err) {
      toast.error(err.response?.data?.error || 'PayPal checkout is not available yet.');
      setPaypalBusyPlan(null);
    }
  }

  const plans = [
    {
      id: 'demo',
      name: 'Demo',
      price: '10',
      period: 'trades',
      description: 'Existing users can test the workflow before upgrading.',
      cta: 'Open Pocket Option',
      href: affiliateLink,
      external: true,
      features: ['10 Martingale trades', 'Webapp Bot access', 'Dashboard access', 'All supported timeframes', 'Basic trade history'],
    },
    {
      id: 'basic',
      name: 'Basic',
      price: '$69',
      period: 'one-time',
      description: 'Unlimited Martingale trading, with no starting amount cap.',
      cta: 'Buy Basic — $69',
      href: appendCheckoutEmail(WHOP_BASIC_CHECKOUT_URL, email),
      paypalPlan: 'basic',
      external: true,
      featured: true,
      features: ['Unlimited Martingale', 'No starting amount cap', 'Cloud settings sync', 'Trade history'],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$119',
      period: 'one-time',
      // Whop sells Pro at BOTH $119 once and $29/month (added 2026-08-27). The buyer
      // picks at checkout ("Choose your plan"). The site showed only $119, so nobody
      // learned the cheaper entry point existed — a silent conversion loss.
      altBilling: 'or $29 / month',
      description: 'Unlock Martingale and Avalisa Bot with no trade limit.',
      cta: 'Buy Pro — $119',
      href: appendCheckoutEmail(WHOP_PRO_CHECKOUT_URL, email),
      paypalPlan: 'lifetime',
      external: true,
      features: ['Unlimited trades', 'Martingale mode', 'Avalisa Bot mode', 'No starting amount cap', 'Affiliate users get this plan'],
    },
  ];

  const selectedPaymentPlan = plans.find((plan) => plan.id === selectedPlan);

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
          const targeted = location.hash === `#${plan.id}`;
          return (
            <article
              aria-current={current ? 'true' : undefined}
              className={`lux-price ${plan.featured ? 'is-featured' : ''} ${targeted ? 'is-targeted' : ''}`}
              id={plan.id}
              key={plan.id}
            >
              {plan.featured && <b>MOST POPULAR</b>}
              <span>{plan.name}</span>
              <h3>{plan.price}<small>{plan.period}</small></h3>
              {plan.altBilling && <p className="lux-price__alt">{plan.altBilling}</p>}
              <p>{plan.description}</p>
              <ul>{plan.features.map((item) => <li key={item}><Check size={14} /> {item}</li>)}</ul>
              {current ? (
                <button type="button" disabled>Current Plan</button>
              ) : plan.external ? (
                plan.paypalPlan ? (
                  <button type="button" onClick={() => setSelectedPlan(plan.id)}>Choose payment method</button>
                ) : (
                  plan.href ? (
                    <a href={plan.href} target="_blank" rel="noreferrer">{plan.cta}</a>
                  ) : (
                    <button type="button" disabled>Checkout temporarily unavailable</button>
                  )
                )
              ) : (
                <Link to={plan.href}>{plan.cta}</Link>
              )}
            </article>
          );
        })}
        <aside className="lux-price-guide lux-price-guide--page">
          <img src={AVALISA_CHARACTER_IMAGE} alt="Avalisa, the Avalisa PO Bot brand ambassador" />
          <div>
            <strong>Want Pro through Pocket Option?</strong>
            <p>Register through Avalisa, then submit your PO UID in the dashboard to request Pro access.</p>
            <a href={affiliateLink} target="_blank" rel="noreferrer">Open Pocket Option</a>
          </div>
        </aside>
      </section>

      <p className="lux-risk-note lux-shell">
        Trading involves risk. Avalisa does not guarantee profits. Use demo mode first and trade responsibly.
      </p>

      {selectedPaymentPlan && (
        <div className="lux-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-choice-title">
          <button type="button" className="lux-payment-modal__backdrop" aria-label="Close payment choices" onClick={() => setSelectedPlan(null)} />
          <section className="lux-payment-modal__panel">
            <button type="button" className="lux-payment-modal__close" onClick={() => setSelectedPlan(null)}>Close</button>
            <p className="lux-kicker">Payment Method</p>
            <h2 id="payment-choice-title">{selectedPaymentPlan.name} {selectedPaymentPlan.price}</h2>
            {selectedPaymentPlan.altBilling && (
              // Say it here too: the buyer chooses one-time vs monthly on Whop's page,
              // so the modal must not imply $119 is the only option.
              <p className="lux-payment-modal__alt">{selectedPaymentPlan.altBilling} — choose at checkout</p>
            )}
            <p className="lux-payment-modal__copy">Choose the checkout provider you prefer. Your Avalisa license activates after payment confirmation.</p>
            <div className="lux-payment-choice-grid">
              {selectedPaymentPlan.href ? (
                <a
                  href={selectedPaymentPlan.href}
                  target="_blank"
                  rel="noreferrer"
                  className="lux-payment-choice"
                  onClick={() => trackCheckoutClick(selectedPaymentPlan.id)}
                >
                  <strong>Whop</strong>
                  <span>Current checkout path</span>
                </a>
              ) : (
                /* No Whop URL configured -> say so, exactly as the PayPal option does.
                   Previously this rendered href="#", so the button looked live and did
                   nothing; before that it pointed at a removed product and sent buyers
                   to Whop's "Product not found" page. Both lie to a paying customer. */
                <div className="lux-payment-choice lux-payment-choice--disabled" aria-disabled="true">
                  <strong>Whop</strong>
                  <span>Whop checkout is temporarily unavailable</span>
                </div>
              )}
              <button
                type="button"
                className="lux-payment-choice lux-payment-choice--paypal"
                disabled={!paypalEnabled || paypalBusyPlan === selectedPaymentPlan.paypalPlan}
                onClick={() => startPayPalCheckout(selectedPaymentPlan.paypalPlan)}
              >
                <CreditCard size={16} />
                <strong>PayPal</strong>
                <span>{paypalEnabled ? 'Pay with PayPal account or supported card' : 'PayPal will appear after backend setup'}</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
