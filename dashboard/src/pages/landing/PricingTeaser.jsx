import { Link } from 'react-router-dom';

export default function PricingTeaser({ tiers, affiliateUrl }) {
  return (
    <section className="landing-section">
      <div className="landing-shell">
        <div className="landing-callout landing-reveal">
          <p>
            Register Pocket Option through us → Lifetime is free. We earn from PO,
            not from you.
          </p>
          <a href={affiliateUrl} target="_blank" rel="noreferrer">
            Register PO
          </a>
        </div>

        <div className="landing-section__heading landing-reveal">
          <p className="landing-eyebrow">Pricing</p>
          <h2 className="landing-heading">Pay once. Let Charles keep working.</h2>
        </div>

        <div className="landing-pricing-grid">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={`landing-price-card ${
                tier.highlighted ? 'is-highlighted' : ''
              } landing-reveal`}
            >
              <p className="landing-price-card__name">{tier.name}</p>
              <h3 className="landing-price-card__price">{tier.price}</h3>
              <p className="landing-price-card__trades">{tier.trades}</p>
              <p className="landing-price-card__tagline">{tier.tagline}</p>
              <Link
                className={`landing-button ${
                  tier.highlighted
                    ? 'landing-button--primary'
                    : 'landing-button--ghost'
                }`}
                to={tier.ctaHref}
              >
                {tier.ctaLabel}
              </Link>
            </article>
          ))}
        </div>

        <p className="landing-note landing-reveal">
          One-time payment. No subscription. Pay once, own it.
        </p>
      </div>
    </section>
  );
}
