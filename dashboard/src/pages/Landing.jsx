/*
 * IMAGES — place files in dashboard/public/images/
 *
 * dashboard/public/images/bot-screenshot.png                    — screenshot of the bot overlay on PO
 * dashboard/public/images/PO_Logo.png                           — Pocket Option logo
 * dashboard/public/images/Gemini_Generated_Image_s5k0i1s5k0i1s5k0.jpg — AI promo image
 *
 * Reference in JSX as: <img src="/images/bot-screenshot.png" alt="..." />
 * (React serves public/ folder at root automatically)
 */

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

const steps = [
  { n: '01', title: 'Register Free', desc: 'Create a new Pocket Option account via our affiliate link to unlock full free access.' },
  { n: '02', title: 'Install Extension', desc: 'Add Avalisa Bot to Chrome in one click — no configuration needed to get started.' },
  { n: '03', title: 'Set & Start', desc: 'Choose your strategy, timeframe, and amount. Hit Start and let the bot trade.' },
];

const stats = [
  { value: '10,000+', label: 'Trades Executed' },
  { value: '92%',     label: 'Avg Payout on PO'  },
  { value: '3',       label: 'Strategy Modes'    },
];

/* ─── inline styles ─────────────────────────────────────────────────────────── */
const gridBg = {
  backgroundImage:
    'linear-gradient(rgba(124,58,237,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.08) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

const glowStyle = {
  background: 'radial-gradient(ellipse 60% 45% at 30% 50%, rgba(124,58,237,0.15) 0%, transparent 70%)',
};

const syneHero = { fontFamily: "'Syne', sans-serif", fontWeight: 800 };
const syneNum  = { fontFamily: "'Syne', sans-serif", fontWeight: 700 };
const mono     = { fontFamily: "'IBM Plex Mono', monospace" };

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ─── 1. HERO ──────────────────────────────────────────────────────── */}
      <section className="relative flex items-start overflow-hidden" style={gridBg}>
        {/* radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={glowStyle} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full pt-12 pb-16 md:pt-16 md:pb-24 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

          {/* Left 60% */}
          <div className="flex-1 max-w-2xl min-w-0">
            {/* Badge with PO logo */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: 'rgba(124,58,237,0.15)',
              border: '1px solid rgba(124,58,237,0.4)',
              borderRadius: '999px',
              padding: '6px 16px 6px 8px',
              marginBottom: '24px',
            }}>
              <div style={{ background: '#0a0a1a', borderRadius: '6px', padding: '2px 8px' }}>
                <img src="/images/PO_Logo.png" alt="Pocket Option" style={{ height: '20px', width: 'auto', display: 'block' }} />
              </div>
              <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>
                POWERED BY POCKET OPTION
              </span>
            </div>

            {/* Headline */}
            <h1
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl leading-[1.05] mb-6 text-white"
              style={{ ...syneHero, wordBreak: 'break-word' }}
            >
              Automate Your<br />
              <span style={{ color: '#a78bfa' }}>Pocket Option</span><br />
              Trading Strategy
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-400 mb-10 leading-relaxed max-w-xl">
              Set your strategy. Let the bot execute. Watch results in real time.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mb-6">
              <a
                href={AFFILIATE_LINK}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-sm text-white transition-all hover:brightness-110 active:scale-95"
                style={{ background: '#7c3aed', fontFamily: "'Syne', sans-serif" }}
              >
                Get Free Access →
              </a>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-sm border border-gray-600 text-gray-300 hover:border-purple-500/60 hover:text-white transition-all"
              >
                View Plans
              </Link>
            </div>

            {/* Trust line */}
            <p className="text-xs text-gray-500 flex flex-wrap gap-4">
              <span>✓ Free for new PO accounts</span>
              <span>✓ No subscription</span>
              <span>✓ Chrome Extension</span>
            </p>
          </div>

          {/* Right 40% — bot screenshot */}
          <div className="flex-shrink-0 w-full lg:w-auto lg:max-w-md xl:max-w-lg">
            <div style={{
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.3)',
            }}>
              <img
                src="/images/bot-screenshot.png"
                alt="Avalisa Bot running on Pocket Option"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
              {/* Subtle purple glow overlay at bottom */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
                background: 'linear-gradient(to top, rgba(124,58,237,0.2), transparent)',
                pointerEvents: 'none',
              }} />
            </div>
          </div>

        </div>
      </section>

      {/* ─── PROMO BANNER ─────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '0 16px 48px',
      }}>
        <div style={{
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          <img
            src="/images/Gemini_Generated_Image_s5k0i1s5k0i1s5k0.jpg"
            alt="Unlock your trading potential with Avalisa Bot"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.3) 0%, transparent 60%)',
            pointerEvents: 'none',
          }} />
        </div>
      </section>

      {/* ─── 2. SOCIAL PROOF BAR ──────────────────────────────────────────── */}
      <section className="border-y border-gray-800 bg-gray-900/60">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 divide-x divide-gray-800">
          {stats.map(s => (
            <div key={s.label} className="flex flex-col items-center gap-1 px-4">
              <span
                className="text-3xl md:text-4xl font-semibold"
                style={{ ...mono, color: '#a78bfa' }}
              >
                {s.value}
              </span>
              <span className="text-xs text-gray-500 text-center tracking-wide uppercase">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 3. HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ ...mono, color: '#a78bfa' }}>How it works</p>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-16" style={syneNum}>
          Three steps to automated trading
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map(s => (
            <div key={s.n} className="relative">
              <div
                className="text-6xl md:text-7xl font-extrabold mb-4 leading-none"
                style={{ ...syneNum, color: 'rgba(124,58,237,0.25)' }}
              >
                {s.n}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 4. FREE ACCESS CALLOUT ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div
          className="rounded-2xl p-10 md:p-14 relative overflow-hidden"
          style={{
            background: 'rgba(124,58,237,0.08)',
            border: '1px solid rgba(124,58,237,0.3)',
          }}
        >
          {/* faint grid overlay inside card */}
          <div className="absolute inset-0 pointer-events-none opacity-30" style={gridBg} />
          <div className="relative z-10 max-w-2xl">
            <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ ...mono, color: '#a78bfa' }}>Best deal</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-5" style={syneNum}>
              Get Unlimited Free Access
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-8">
              Register a new Pocket Option account through our link and use Avalisa Bot completely free —
              no trade limits, no subscription. Already have a PO account? Start with our Basic plan.
            </p>
            <a
              href={AFFILIATE_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-lg font-bold text-sm text-white transition-all hover:brightness-110 active:scale-95"
              style={{ background: '#7c3aed', fontFamily: "'Syne', sans-serif" }}
            >
              Register New PO Account — It's Free
            </a>
            <p className="mt-4 text-xs text-gray-500" style={mono}>
              * Must register via our link to qualify for free access
            </p>
          </div>
        </div>
      </section>

      {/* ─── 5. FEATURES GRID ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ ...mono, color: '#a78bfa' }}>Features</p>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-12" style={syneNum}>
          Everything you need to trade smarter
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(f => (
            <div
              key={f.title}
              className="rounded-xl p-6 flex flex-col gap-3 transition-colors"
              style={{
                background: '#0d1117',
                border: '1px solid #1c2730',
                borderLeft: '3px solid rgba(124,58,237,0.6)',
              }}
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="font-semibold text-white text-sm">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 6. POCKET OPTION PARTNERSHIP STRIP ──────────────────────────── */}
      <section className="border-y border-gray-800 bg-gray-900/40 py-12">
        <div className="max-w-3xl mx-auto px-6 text-center flex flex-col items-center gap-5">
          <p className="text-gray-400 text-sm">Avalisa Bot is built exclusively for</p>

          <div style={{
            display: 'inline-block',
            background: '#0a0a1a',
            borderRadius: '8px',
            padding: '6px 16px',
            margin: '0 12px',
          }}>
            <img
              src="/images/PO_Logo.png"
              alt="Pocket Option"
              style={{ height: '32px', width: 'auto', display: 'block' }}
            />
          </div>

          <p className="text-gray-400 text-sm">
            Register under our affiliate link to get free bot access
          </p>
        </div>
      </section>

      {/* ─── 7. RISK DISCLAIMER ───────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-5 text-sm text-yellow-200">
          <strong>⚠️ Risk Disclaimer:</strong> Binary options trading involves significant financial risk. You may lose some or all of your invested capital. This tool does not guarantee profits. Trade responsibly and only with funds you can afford to lose.
        </div>
      </section>

      {/* ─── 8. FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="py-28 text-center relative overflow-hidden" style={gridBg}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 50% 60% at 50% 50%, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
        <div className="relative z-10 max-w-xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4" style={syneHero}>
            Ready to trade smarter?
          </h2>
          <p className="text-gray-400 mb-10 text-sm">
            Join traders already using Avalisa Bot on Pocket Option.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href={AFFILIATE_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-bold text-sm text-white transition-all hover:brightness-110 active:scale-95"
              style={{ background: '#7c3aed', fontFamily: "'Syne', sans-serif" }}
            >
              Get Free Access
            </a>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-sm border border-gray-600 text-gray-300 hover:border-purple-500/60 hover:text-white transition-all"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #1a1a3e',
        marginTop: '40px',
        padding: '40px 16px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Logo / Brand */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '18px' }}>⚡ Avalisa Bot</span>
          </div>

          {/* Social Links */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {/* YouTube */}
            <a href="https://youtube.com/@avalisapobot?si=B0477eY_uwdHelIJ"
              target="_blank" rel="noreferrer"
              style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ff0000'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
              </svg>
              YouTube
            </a>

            {/* TikTok */}
            <a href="https://www.tiktok.com/@avalisa.po.bot?_r=1&_t=ZS-95AWsutNbgT"
              target="_blank" rel="noreferrer"
              style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.6 3a3.5 3.5 0 0 1-3.5-3.5h-2.8v14.7a2.1 2.1 0 1 1-2.8-2v-2.8a4.9 4.9 0 1 0 5.6 4.8V8.3a8.1 8.1 0 0 0 4.9 1.6V7.1A3.5 3.5 0 0 1 19.6 3z"/>
              </svg>
              TikTok
            </a>

            {/* Facebook */}
            <a href="https://www.facebook.com/share/1EGgzWbHv9/?mibextid=wwXIfr"
              target="_blank" rel="noreferrer"
              style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#1877f2'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.1C24 5.4 18.6 0 12 0S0 5.4 0 12.1c0 6 4.4 11 10.1 11.9v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.2h3.3l-.5 3.5h-2.8V24C19.6 23.1 24 18.1 24 12.1z"/>
              </svg>
              Facebook
            </a>

            {/* Email */}
            <a href="mailto:AvalisaPOBot@gmail.com"
              style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#a78bfa'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m2 7 10 7 10-7"/>
              </svg>
              AvalisaPOBot@gmail.com
            </a>
          </div>

          {/* Bottom line */}
          <p style={{ color: '#374151', fontSize: '12px' }}>
            © {new Date().getFullYear()} Avalisa Bot. Trade responsibly.
            <a href="/privacy" style={{ color: '#64748b', fontSize: '12px', textDecoration: 'none', marginLeft: '16px' }}>
              Privacy Policy
            </a>
          </p>
        </div>
      </footer>

    </div>
  );
}
