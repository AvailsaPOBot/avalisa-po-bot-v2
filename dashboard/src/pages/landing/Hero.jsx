import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-shell landing-hero__grid">
        <div className="landing-hero__copy landing-reveal is-visible">
          <p className="landing-eyebrow">Chrome extension for Pocket Option</p>
          <h1 className="landing-hero__title">Trade on autopilot.</h1>
          <p className="landing-hero__sub">
            Avalisa is a Chrome extension that runs your Pocket Option strategy
            automatically. Charles, our AI bot, watches the market while you live
            your life.
          </p>

          <div className="landing-hero__actions">
            <Link className="landing-button landing-button--primary" to="/register">
              Start Free
            </Link>
            <a className="landing-inline-link" href="#step-02">
              Already on Pocket Option? Skip to Step 2 →
            </a>
          </div>
        </div>

        <div className="landing-hero__visual landing-reveal is-visible">
          <div className="landing-hero__frame">
            <img
              src="/images/landing/hero.jpg"
              alt="Editorial portrait beside glowing trading monitors in a dark studio."
              className="landing-hero__image"
              loading="eager"
              fetchPriority="high"
            />
            <span className="landing-candle landing-candle--one" aria-hidden="true" />
            <span className="landing-candle landing-candle--two" aria-hidden="true" />
            <span className="landing-candle landing-candle--three" aria-hidden="true" />
            <span className="landing-candle landing-candle--four" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
