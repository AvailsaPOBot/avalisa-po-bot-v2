import { useState } from 'react';
import { BookOpen, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/api';
import '../styles/luxury.css';

const STORE_URL =
  'https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa';

// Every number and label on this page is taken from the shipped extension, not from marketing
// copy: panel labels from overlayView.js, defaults from state.js getDefaultSettings(), the
// candle gate from state.js REQUIRED_CANDLES_BY_INTENSITY, the rule gate from signalEngine.js
// RULES_REQUIRED, and the plan limits from backend/src/lib/plans.js PLAN_ENTITLEMENTS.
// If any of those change, this page is wrong and must change with them.
// #137 — the question a doubting buyer actually asks, answerable without an email.
// A paying Pro customer sent us his PO ID and waited 13 days for this exact lookup;
// the route already existed and nothing on the web let a human call it.
// Entitlement only: POST /api/license/po-entitlement returns plan + allowance and
// never a token, email, id or history (guarded by backend/test/poEntitlement.test.js),
// so this box cannot leak anyone's personal data and cannot sign anybody in.
const PLAN_LABELS = { lifetime: 'Pro', basic: 'Basic' };

function LicenceCheck() {
  const [uid, setUid] = useState('');
  const [result, setResult] = useState({ status: 'idle' });

  async function check(event) {
    event.preventDefault();
    const trimmed = uid.trim();
    // Mirror the server's own validator rather than inventing a looser one.
    if (!/^\d{3,20}$/.test(trimmed)) {
      setResult({ status: 'invalid' });
      return;
    }
    setResult({ status: 'loading' });
    try {
      const res = await fetch(`${API_BASE}/api/license/po-entitlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poUid: trimmed }),
      });
      if (!res.ok) {
        setResult({ status: 'invalid' });
        return;
      }
      const data = await res.json();
      setResult({ status: 'done', linked: Boolean(data.linked), plan: data.plan });
    } catch (_) {
      // Never render a failed lookup as "you have no licence" — that is the same
      // false negative that told a paying customer his purchase was gone.
      setResult({ status: 'unreachable' });
    }
  }

  const label = result.status === 'done' ? PLAN_LABELS[result.plan] : null;
  const paid = result.status === 'done' && result.linked && Boolean(label);

  return (
    <article className="lux-privacy-card">
      <h2>Already bought? Check your Pocket Option ID</h2>
      <div className="lux-privacy-card__body">
        <p>
          If you have paid and the bot still looks locked, check here before buying anything a
          second time. Enter the Pocket Option account ID you use for trading.
        </p>
        <form onSubmit={check}>
          <input
            type="text"
            inputMode="numeric"
            value={uid}
            onChange={e => setUid(e.target.value)}
            aria-label="Pocket Option ID"
            placeholder="e.g. 5131350"
          />{' '}
          <button className="lux-button lux-button--gold" type="submit" disabled={result.status === 'loading'}>
            {result.status === 'loading' ? 'Checking…' : 'Check'}
          </button>
        </form>

        {result.status === 'invalid' && (
          <p>Enter the numeric Pocket Option account ID — digits only, no email address.</p>
        )}
        {result.status === 'unreachable' && (
          <p>
            We could not reach our server just now, so this is not an answer either way. Please
            try again in a moment, or email us and we will check it by hand.
          </p>
        )}
        {paid && (
          <p>
            <strong>That account already has {label}.</strong> You do not need to buy anything.
            Open Chrome&apos;s extensions page and press Update so you are on the current version,
            then open Pocket Option signed in to this account — the panel unlocks on its own.
            Automatic unlocking arrived in August, so an older copy of the extension cannot see it.
            If it still looks locked, email us and say what the panel status line reads.
          </p>
        )}
        {result.status === 'done' && !paid && (
          <p>
            We have no paid licence linked to that ID. If you have paid for Avalisa, email{' '}
            <a href="mailto:avalisapobot@gmail.com">avalisapobot@gmail.com</a> with that ID and we
            will sort it out — do not buy a second time. Otherwise the free demo needs no payment,
            and the plans are on the <Link to="/pricing">pricing page</Link>.
          </p>
        )}
        <p>
          This only reports whether a licence is attached to that ID. It shows no personal details,
          and it does not sign you in to anything.
        </p>
      </div>
    </article>
  );
}

export default function Guide() {
  const sections = [
    {
      title: '1. Install and sign in',
      content: [
        {
          subtitle: 'Add the extension',
          text: 'Install Avalisa PO Bot from the Chrome Web Store. It runs in your own browser on the Pocket Option page — there is nothing to download and nothing to install on your computer.',
        },
        {
          subtitle: 'Create an Avalisa account',
          text: 'Open the panel and register with an email and password. This is an Avalisa account for your licence and settings sync. It is not your Pocket Option login, and the two are unrelated.',
        },
        {
          subtitle: 'Your Pocket Option password is never involved',
          text: 'Avalisa never asks for, types, or stores your Pocket Option password. It works inside the page you are already signed in to, the same way you would click the buttons yourself.',
        },
      ],
    },
    {
      title: '2. Your first run — use the demo balance',
      content: [
        {
          subtitle: 'Switch Pocket Option to its demo balance first',
          text: 'Do this before anything else. Pocket Option\'s demo balance is not real money, so you can watch exactly what the bot does with no financial risk. Everything below behaves identically on demo and on real.',
        },
        {
          subtitle: 'Open a pair, then open the Avalisa panel',
          text: 'The panel appears on the Pocket Option trading page. It reads the chart and the trade controls that are already on screen.',
        },
        {
          subtitle: 'Press Start, and watch one full cycle',
          text: 'Let it place a few trades before you change anything. Press "Stop bot" at any time — it halts immediately and places nothing further.',
        },
      ],
    },
    {
      title: '3. Every setting, explained',
      content: [
        {
          subtitle: 'Strategy — Martingale or Avalisa Bot',
          text: 'Martingale places trades and increases the amount after a loss. Avalisa Bot instead waits for its own rule-based signals from live price data before entering. Martingale is the default and is available on every plan; Avalisa Bot mode requires Pro.',
        },
        {
          subtitle: 'Start Amount ($) — default $1.00',
          text: 'The first trade of every sequence. This is the number that matters most: with a 2.0x multiplier, a sequence that loses several trades in a row grows from this figure very quickly. Start small.',
        },
        {
          subtitle: 'Martingale × — default 2.0x, up to 3.0x',
          text: 'How much the amount is multiplied after a loss. Higher recovers a loss in fewer steps and grows the exposure faster. 2.0x is the default for a reason.',
        },
        {
          subtitle: 'Martingale Steps — default Infinite, and you should change it',
          text: 'How many times in a row the amount is allowed to escalate before the sequence resets. The default is Infinite, which puts no ceiling on how far a losing run can go. Setting 10 or 12 caps the worst case. We recommend choosing a limit rather than leaving it Infinite.',
        },
        {
          subtitle: 'Direction — Alternating, Always Buy, or Always Sell',
          text: 'Alternating (the default) switches between buy and sell. Always Buy and Always Sell hold one direction.',
        },
        {
          subtitle: 'Timeframe — 30s, 1min, 3min, 5min',
          text: 'The expiry of each trade placed. The default is 1min.',
        },
        {
          subtitle: 'Minimum payout % and Pair Scan',
          text: 'Pair Scan set to "Auto scan favorites" rotates through your Pocket Option favourites and takes the ones meeting your minimum payout; "Current pair only" never leaves the pair you are on.',
        },
      ],
    },
    {
      title: '4. Avalisa Bot mode, and why it says "Loading"',
      content: [
        {
          subtitle: 'Intensity is an agreement threshold',
          text: 'Avalisa Bot evaluates four independent rules against live price data. Intensity sets how many of the four must agree before it will enter: Low needs 2 of 4, Mid needs 3 of 4, High needs all 4. Higher intensity means fewer trades, not better ones.',
        },
        {
          subtitle: 'It also needs enough price history',
          text: 'Before it will evaluate anything it needs a minimum number of candles: 12 on Low, 16 on Mid, 20 on High. Until it has them the status reads "Loading: 8/16 (mid)" — that is the bot refusing to act on insufficient data, not a fault.',
        },
        {
          subtitle: 'Why it can take a minute after switching pairs',
          text: 'Pocket Option only sends roughly eleven minutes of price history at a time, and it cannot be asked for more. Each new pair therefore has to build its buffer up from live prices. "Waiting for pair data..." then "Loading: n/16" then "Ready" is the normal sequence.',
        },
      ],
    },
    {
      title: '5. What the status messages mean',
      content: [
        {
          subtitle: '"Avalisa stopped safely — Pocket Option changed or page error"',
          text: 'Pocket Option changed something on the page that the bot depends on, so it stopped instead of guessing. Reload the page and press Start again. It stops rather than continuing blind, on purpose.',
        },
        {
          subtitle: '"Server offline. Try again in 1 min."',
          text: 'Our licence server did not answer. Your trades and settings are unaffected; wait a moment and press Start again.',
        },
        {
          subtitle: '"Trades: 7 / 10 demo"',
          text: 'You are on the free demo, which includes 10 trades in total. See the next section.',
        },
      ],
    },
    {
      title: '6. Free demo versus paid plans',
      content: [
        {
          subtitle: 'Free demo — 10 trades, no payment and no card',
          text: 'The free demo includes 10 trades of Martingale mode so you can see the bot work on your own account before paying anything. Avalisa Bot mode is not included in the demo.',
        },
        {
          subtitle: 'Basic — $69 one-time',
          text: 'Unlimited Martingale trading and cloud settings sync. A one-time purchase, not a subscription.',
        },
        {
          subtitle: 'Pro — $119 one-time, or $29 per month',
          text: 'Everything in Basic plus Avalisa Bot mode. The one-time and monthly options are both offered at checkout; pick whichever suits you.',
        },
      ],
    },
    {
      title: '7. Common questions',
      content: [
        {
          subtitle: 'Will this make me money?',
          text: 'No. It automates the strategy and the settings you choose. It does not predict the market, and no automated strategy removes risk. A Martingale sequence can lose several trades in a row.',
        },
        {
          subtitle: 'Can I leave it running unattended?',
          text: 'We do not recommend it. Watch it, especially on a real balance, and use a step limit rather than Infinite.',
        },
        {
          subtitle: 'Does it work on the Pocket Option mobile app?',
          text: 'No. It is a Chrome extension and runs on the Pocket Option website in a desktop Chrome browser.',
        },
        {
          subtitle: 'Is my licence tied to one computer?',
          text: 'No. Sign in with your Avalisa account on another Chrome browser and your licence and settings follow you.',
        },
        {
          subtitle: 'Something is not working',
          text: 'Email us and include what the panel status line said. That one line usually identifies the problem immediately.',
        },
      ],
      contact: true,
    },
  ];

  return (
    <main className="lux-privacy-page">
      <section className="lux-privacy-hero lux-shell">
        <div>
          <p className="lux-kicker">Setup Guide</p>
          <h1>How to set up Avalisa PO Bot</h1>
          <p className="lux-privacy-updated">Written for the current version</p>
          <p>
            A complete walkthrough: installing, your first run on a demo balance, what every
            setting actually does, and what to do when something looks wrong. Start on the free
            demo — it needs no payment and no card.
          </p>
          <p>
            <a className="lux-button lux-button--gold" href={STORE_URL} target="_blank" rel="noreferrer">
              Get the extension
            </a>{' '}
            <Link className="lux-button lux-button--ghost" to="/pricing">See pricing</Link>
          </p>
        </div>
        <aside>
          <BookOpen size={34} />
          <strong>Try it on demo money first.</strong>
          <span>
            Pocket Option&apos;s demo balance costs nothing and behaves the same. Watch a full
            cycle there before any real money is involved.
          </span>
        </aside>
      </section>

      <section className="lux-privacy-content lux-shell">
        <LicenceCheck />
        {sections.map(section => (
          <article key={section.title} className="lux-privacy-card">
            <h2>{section.title}</h2>
            <div className="lux-privacy-card__body">
              {section.content.map((item, i) => (
                <div key={i}>
                  {item.subtitle && <h3>{item.subtitle}</h3>}
                  <p>{item.text}</p>
                </div>
              ))}
              {section.contact && (
                <a href="mailto:avalisapobot@gmail.com" className="lux-privacy-email">
                  <Mail size={15} />
                  avalisapobot@gmail.com
                </a>
              )}
            </div>
          </article>
        ))}

        <aside className="lux-privacy-risk">
          <strong>Risk Disclaimer:</strong> This automates a strategy you choose on a real-money
          binary options account. It does not predict the market and does not guarantee profits.
          A Martingale sequence can lose several trades in a row. Binary options are restricted or
          banned for retail traders in some countries — check the rules where you live. Start on
          the demo balance, use a small start amount, and set a step limit.
        </aside>
      </section>
    </main>
  );
}
