function StepVisual({ step }) {
  if (step.visual === 'po') {
    return (
      <div className="landing-step-card__visual landing-step-card__visual--po">
        <img src="/images/PO Logo.png" alt="Pocket Option" loading="lazy" />
        <div>
          <span>Affiliate unlock</span>
          <strong>Pro access after PO account confirmation</strong>
        </div>
      </div>
    );
  }

  if (step.visual === 'chrome') {
    return (
      <div className="landing-step-card__visual landing-step-card__visual--chrome">
        <img src="/images/chrome-web-store.svg" alt="Chrome Web Store" loading="lazy" />
        <div>
          <span>Chrome extension</span>
          <strong>Install once, then run inside Pocket Option</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-step-card__visual landing-step-card__visual--bot" aria-hidden="true">
      <div className="landing-step-mini-window">
        <div className="landing-step-mini-window__bar">
          <span />
          <span />
          <span />
        </div>
        <div className="landing-step-mini-window__body">
          <div>
            <small>Avalisa Bot</small>
            <strong>Avalisa AI</strong>
          </div>
          <p>Pair Scan</p>
          <p>Intensity: Medium</p>
          <button type="button">Start</button>
        </div>
      </div>
      <div className="landing-step-signal-card">
        <span>CALL</span>
        <strong>+$18.70</strong>
      </div>
    </div>
  );
}

export default function HowItWorks({ steps }) {
  return (
    <section className="landing-section" id="how-it-works">
      <div className="landing-shell">
        <div className="landing-section__heading landing-reveal">
          <p className="landing-eyebrow">How it works</p>
          <h2 className="landing-heading">Three steps. One bot. Done.</h2>
        </div>

        <div className="landing-steps">
          {steps.map((step) => (
            <article
              key={step.number}
              className="landing-step-card"
              id={step.id}
            >
              <StepVisual step={step} />
              <div className="landing-step-card__body">
                <p className="landing-step-card__number">{step.number}</p>
                <span className="landing-step-card__kicker">{step.kicker}</span>
                <h3 className="landing-step-card__title">{step.title}</h3>
                <p className="landing-step-card__text">{step.body}</p>
                <a
                  className="landing-inline-link"
                  href={step.ctaHref}
                  {...(step.external
                    ? { target: '_blank', rel: 'noreferrer' }
                    : {})}
                >
                  {step.ctaLabel} {step.external ? '→' : '↓'}
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
