import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

export default function Pricing() {
  const { user } = useAuth();
  const currentPlan = user?.license?.plan || null;

  const email = user?.email || '';
  const appendEmail = (url) => {
    if (!url || url === '#') return '#';
    const separator = url.includes('?') ? '&' : '?';
    return email ? `${url}${separator}checkout[email]=${encodeURIComponent(email)}` : url;
  };
  const LS_BASIC_URL = appendEmail(process.env.REACT_APP_LS_BASIC_URL);
  const LS_LIFETIME_URL = appendEmail(process.env.REACT_APP_LS_LIFETIME_URL);

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      badge: 'badge-free',
      description: 'Get started with Martingale strategy',
      features: [
        '10 free trades (device-linked)',
        'Martingale strategy only',
        'All timeframes (M1–H4)',
        'Basic trade history',
        'AI support chat',
      ],
      cta: 'Register Free PO Account',
      ctaHref: AFFILIATE_LINK,
      ctaExternal: true,
      highlighted: false,
    },
    {
      name: 'Basic',
      price: '$50',
      period: 'one-time',
      badge: 'badge-basic',
      description: '100 trades with full strategy access',
      features: [
        '100 trades total',
        'Max $2 starting trade amount',
        'All strategies unlocked',
        'Anti-Martingale strategy',
        'Fixed Amount strategy',
        'Full trade history & stats',
        'Settings cloud sync',
      ],
      cta: 'Buy Basic — $50',
      ctaHref: LS_BASIC_URL,
      ctaExternal: true,
      highlighted: false,
    },
    {
      name: 'Lifetime',
      price: '$100',
      period: 'one-time',
      badge: 'badge-lifetime',
      description: 'Unlimited everything, forever',
      features: [
        'Unlimited trades',
        'Unlimited starting amount',
        'All strategies unlocked',
        'AI Signal strategy (coming soon)',
        'Full trade history & stats',
        'Settings cloud sync',
        'Priority AI support',
      ],
      cta: 'Buy Lifetime — $100',
      ctaHref: LS_LIFETIME_URL,
      ctaExternal: true,
      highlighted: true,
    },
  ];

  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-extrabold text-white mb-4">Simple, transparent pricing</h1>
          <p className="text-gray-400 text-lg">All plans are one-time payments — no recurring subscriptions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div key={plan.name}
              className={`card flex flex-col relative ${plan.highlighted ? 'border-brand-600 ring-2 ring-brand-600' : ''}`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                  MOST POPULAR
                </div>
              )}
              <div className="mb-4">
                <span className={plan.badge}>{plan.name}</span>
              </div>
              <div className="mb-2">
                <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                <span className="text-gray-400 ml-2 text-sm">{plan.period}</span>
              </div>
              <p className="text-gray-400 text-sm mb-6">{plan.description}</p>

              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-green-400 mt-0.5">✓</span> {f}
                  </li>
                ))}
              </ul>

              {currentPlan === plan.name.toLowerCase() ? (
                <div className="btn-outline text-center py-3 opacity-50 cursor-default">Current Plan</div>
              ) : plan.ctaExternal ? (
                <a href={plan.ctaHref} target="_blank" rel="noreferrer"
                  className={`text-center py-3 rounded-lg font-semibold text-sm transition-colors ${plan.highlighted ? 'btn-primary' : 'btn-outline'}`}>
                  {plan.cta}
                </a>
              ) : (
                <Link to={plan.ctaHref}
                  className={`text-center py-3 rounded-lg font-semibold text-sm transition-colors ${plan.highlighted ? 'btn-primary' : 'btn-outline'}`}>
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 text-center text-sm text-gray-500">
          Payments processed securely by Lemon Squeezy. All sales final.
        </div>

        <div className="mt-8 bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-5 text-sm text-yellow-200 text-center">
          <strong>⚠️ Risk Disclaimer:</strong> Binary options trading carries significant financial risk. This tool does not guarantee profits. Trade responsibly.
        </div>
      </div>
    </div>
  );
}
