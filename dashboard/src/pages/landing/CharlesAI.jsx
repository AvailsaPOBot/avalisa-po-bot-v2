export default function CharlesAI({ cards }) {
  return (
    <section className="landing-section">
      <div className="landing-shell landing-charles">
        <div className="landing-charles__media landing-reveal">
          <img
            src="/images/landing/charles.jpg"
            alt="Profile portrait lit by warm candles and cool chart light."
            className="landing-charles__image"
            loading="lazy"
          />
        </div>

        <div className="landing-charles__content landing-reveal">
          <p className="landing-eyebrow">The strategy</p>
          <h2 className="landing-heading">Three intensities. One AI.</h2>
          <p className="landing-copy">
            Charles adapts to market regime — trending or ranging — and picks the
            timeframe with the cleanest signal.
          </p>

          <div className="landing-intensity-list">
            {cards.map((card) => (
              <article className="landing-intensity-card" key={card.level}>
                <div className="landing-intensity-card__head">
                  <h3>{card.level}</h3>
                  {card.badge ? (
                    <span className="landing-intensity-card__badge">
                      {card.badge}
                    </span>
                  ) : null}
                </div>
                <p className="landing-intensity-card__pitch">{card.pitch}</p>
                <p className="landing-intensity-card__detail">{card.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
