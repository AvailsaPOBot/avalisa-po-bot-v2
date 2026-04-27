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
              <img
                src={`/images/landing/${step.id}.jpg`}
                alt={step.title}
                className="landing-step-card__image"
                loading="lazy"
              />
              <div className="landing-step-card__body">
                <p className="landing-step-card__number">{step.number}</p>
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
