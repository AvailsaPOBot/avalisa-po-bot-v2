import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-shell landing-hero__grid">
        <div className="landing-hero__copy landing-reveal is-visible">
          <p className="landing-eyebrow">Chrome extension for Pocket Option</p>
          <h1 className="landing-hero__title">Trade on <em>autopilot.</em></h1>
          <p className="landing-hero__sub">
            Avalisa is a Chrome extension that runs your Pocket Option strategy
            from a live bot panel. Avalisa AI scans the chart, checks the setup,
            and keeps the workflow visible while you stay in control.
          </p>

          <div className="landing-hero__actions">
            <Link className="landing-button landing-button--primary" to="/register">
              Try 10 Free Trades
            </Link>
            <a className="landing-inline-link" href="#step-02">
              Already on Pocket Option? Skip to Step 2 →
            </a>
          </div>

          <div className="landing-proof-row" aria-label="Avalisa proof points">
            <span>PO page overlay</span>
            <span>Avalisa AI</span>
            <span>Demo first</span>
            <span>Pro $120</span>
          </div>
        </div>

        <div className="landing-hero__visual landing-reveal is-visible">
          <div className="landing-product-stage">
            <div
              className="landing-trade-screen"
              aria-label="Pocket Option trading page reference"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(10, 10, 15, 0.04), rgba(10, 10, 15, 0.88)), url('/images/landing/po-graph.png')",
              }}
            >
              <div className="landing-trade-screen__top">
                <span className="landing-trade-screen__brand">
                  <img src="/images/PO_Logo.png" alt="" /> Pocket Option
                </span>
                <span className="landing-trade-screen__pair">EUR/USD OTC · 92%</span>
              </div>
              <div className="landing-trade-screen__actions">
                <span className="landing-trade-screen__put">PUT</span>
                <span className="landing-trade-screen__timer">00:30</span>
                <span className="landing-trade-screen__call">CALL</span>
              </div>
            </div>

            <aside className="landing-bot-panel" aria-label="Avalisa Bot panel reference">
              <div className="landing-bot-panel__head">
                <span className="landing-bot-panel__logo">⚡ Avalisa Bot</span>
                <span className="landing-bot-panel__status">Ready</span>
              </div>
              <div className="landing-bot-panel__grid">
                <span>Mode</span><strong>Avalisa AI</strong>
                <span>Pair Scan</span><strong>Auto</strong>
                <span>Intensity</span><strong>Low</strong>
                <span>Start Amount</span><strong>$1.00</strong>
              </div>
              <div className="landing-bot-panel__decision">
                Signal ready · 3 checks passed
              </div>
              <button type="button">Start</button>
            </aside>

            <div className="landing-proof-console" aria-label="Proof console">
              <span>Chrome Extension</span>
              <strong>Real PO chart proof, account details removed</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
