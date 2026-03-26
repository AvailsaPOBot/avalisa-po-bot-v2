import { Link } from 'react-router-dom';

const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

const features = [
  { icon: '🤖', title: 'Automated Strategy Execution', desc: 'Run Martingale, Anti-Martingale, Fixed Amount, and AI-guided strategies hands-free.' },
  { icon: '📊', title: 'Real-Time Trade Tracking', desc: 'Full trade history with win rate, P&L stats, and per-session analytics.' },
  { icon: '🔒', title: 'Safe DOM-Click Approach', desc: 'No external APIs or unofficial PO endpoints — works directly inside the browser.' },
  { icon: '🧠', title: 'AI-Powered Support', desc: 'Built-in chat assistant (Gemini/Claude) for setup help and strategy advice.' },
  { icon: '⚙️', title: 'Fully Customizable', desc: 'Set timeframe, delay, Martingale multiplier, steps, and starting amount.' },
  { icon: '📱', title: 'Cloud Settings Sync', desc: 'Settings saved to your account and synced instantly to the extension.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-24 pb-20 text-center">
        <div className="inline-block bg-brand-900 text-brand-400 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
          Trading Strategy Tool for Pocket Option
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 leading-tight">
          Trade smarter with<br />
          <span className="text-brand-400">Avalisa Bot</span>
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
          A powerful Chrome extension that automates your Pocket Option strategies.
          Start free — no subscription required.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a href={AFFILIATE_LINK} target="_blank" rel="noreferrer" className="btn-primary text-base px-8 py-3">
            Get Started Free
          </a>
          <Link to="/pricing" className="btn-outline text-base px-8 py-3">View Plans</Link>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Free plan available — register a new PO account under our affiliate link
        </p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-12">Everything you need</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <div key={f.title} className="card hover:border-brand-600 transition-colors">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Risk Disclaimer */}
      <section className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-5 text-sm text-yellow-200">
          <strong>⚠️ Risk Disclaimer:</strong> Binary options trading involves significant financial risk. You may lose some or all of your invested capital. This tool does not guarantee profits. Trade responsibly and only with funds you can afford to lose.
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">Ready to start?</h2>
        <p className="text-gray-400 mb-8">Join traders already using Avalisa Bot on Pocket Option.</p>
        <div className="flex flex-wrap justify-center gap-4">
          <a href={AFFILIATE_LINK} target="_blank" rel="noreferrer" className="btn-primary text-base px-8 py-3">
            Register Free PO Account
          </a>
          <Link to="/register" className="btn-outline text-base px-8 py-3">Create Dashboard Account</Link>
        </div>
      </section>
    </div>
  );
}
