import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Laptop, Monitor, Puzzle, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import '../styles/luxury.css';

const CHROME_EXTENSION_URL =
  process.env.REACT_APP_CHROME_STORE_URL ||
  'https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa';

// Avalisa runs *inside* the Pocket Option page — that is the only way it can read the
// chart and place a trade. So each platform needs a host that can load PO and run the
// bot in it. This page tells the visitor which host applies to the device in their hand
// instead of sending everyone to the signup form.
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  const touchMac = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  // iPadOS reports itself as a Mac; the touch-point check is the only reliable tell,
  // so it must run after the explicit mobile UAs or it swallows them.
  if (/iPad/i.test(ua) || touchMac) return 'ipados';
  const isChromium = /Chrome|Chromium|Edg\//i.test(ua) && !/OPR|SamsungBrowser/i.test(ua);
  return isChromium ? 'desktop-chromium' : 'desktop-other';
}

const COPY = {
  'desktop-chromium': {
    icon: Monitor,
    label: 'Desktop browser',
    status: 'ready',
    headline: 'Your device is ready.',
    body: 'The Chrome extension runs Avalisa directly inside Pocket Option. Install it, open Pocket Option, and the Avalisa panel appears on the trading page.',
  },
  'desktop-other': {
    icon: Laptop,
    label: 'Desktop browser',
    status: 'needs-chrome',
    headline: 'Use a Chromium browser.',
    body: 'Avalisa runs as a browser extension on desktop. Chrome, Brave, or Edge will work — this browser will not load the extension.',
  },
  ios: {
    icon: Smartphone,
    label: 'iPhone',
    status: 'in-development',
    headline: 'Mobile access is in development.',
    body: 'Pocket Option on mobile is a web page, so Avalisa needs an app that loads that page and runs the bot inside it. A browser tab cannot do this — a page on one site is not allowed to control another site. That app is being built. Until it ships, desktop Chrome is the working path.',
  },
  ipados: {
    icon: Smartphone,
    label: 'iPad',
    status: 'in-development',
    headline: 'Mobile access is in development.',
    body: 'Pocket Option on tablet is a web page, so Avalisa needs an app that loads that page and runs the bot inside it. That app is being built. Until it ships, desktop Chrome is the working path.',
  },
  android: {
    icon: Smartphone,
    label: 'Android',
    status: 'in-development',
    headline: 'Mobile access is in development.',
    body: 'Pocket Option on mobile is a web page, so Avalisa needs an app that loads that page and runs the bot inside it. That app is being built. Until it ships, desktop Chrome is the working path.',
  },
  unknown: {
    icon: Laptop,
    label: 'Your device',
    status: 'needs-chrome',
    headline: 'Open this on desktop Chrome.',
    body: 'Avalisa runs as a browser extension on desktop, inside the Pocket Option page.',
  },
};

export default function Webapp() {
  const { user } = useAuth();
  const platform = useMemo(detectPlatform, []);
  const info = COPY[platform] || COPY.unknown;
  const Icon = info.icon;
  const ready = info.status === 'ready';

  return (
    <main className="lux-webapp-page">
      <section className="lux-webapp-shell">
        <p className="lux-kicker">Bot access</p>
        <h1>Run Avalisa on this device.</h1>
        <p className="lux-webapp-intro">
          Avalisa works by running inside the Pocket Option trading page itself. Each device
          needs a host that can open Pocket Option and run the bot in it.
        </p>

        <article className={`lux-webapp-card is-${info.status}`}>
          <header>
            <Icon size={20} />
            <div>
              <strong>{info.label}</strong>
              <span>{info.headline}</span>
            </div>
          </header>
          <p>{info.body}</p>

          {ready ? (
            <a
              className="avalisa-button avalisa-button--gold"
              href={CHROME_EXTENSION_URL}
              target="_blank"
              rel="noreferrer"
            >
              Install the extension <Puzzle size={17} />
            </a>
          ) : (
            <a
              className="avalisa-button avalisa-button--dark"
              href={CHROME_EXTENSION_URL}
              target="_blank"
              rel="noreferrer"
            >
              Get the desktop extension <ArrowRight size={17} />
            </a>
          )}
        </article>

        <article className="lux-webapp-account">
          <ShieldCheck size={18} />
          {user ? (
            <p>
              Signed in as <strong>{user.email}</strong>. Your plan and trade allowance are
              checked by the bot each time it runs — manage them in the{' '}
              <Link to="/dashboard">dashboard</Link>.
            </p>
          ) : (
            <p>
              <Link to="/login">Sign in</Link> or <Link to="/register">create an account</Link>{' '}
              first — the bot checks your Avalisa plan before it can run.
            </p>
          )}
        </article>

        <p className="lux-risk-note">
          Start in demo mode. Trading involves risk and Avalisa does not guarantee profits.
        </p>
      </section>
    </main>
  );
}
