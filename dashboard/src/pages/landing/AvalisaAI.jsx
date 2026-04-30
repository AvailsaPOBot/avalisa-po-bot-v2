export default function AvalisaAI({ cards }) {
  return (
    <section className="landing-section">
      <div className="landing-shell landing-ai">
        <div className="landing-ai__media landing-reveal">
          <div className="landing-engine-panel">
            <div className="landing-engine-panel__head">
              <span>Avalisa AI</span>
              <strong>Decision Engine</strong>
            </div>
            {[
              ['Payout filter', '92%', true],
              ['Market regime', 'Trending', true],
              ['RSI + Bollinger', 'Pass', true],
              ['Momentum guard', 'Pass', true],
              ['Action', 'CALL', true],
            ].map(([label, value, active]) => (
              <div className="landing-engine-row" key={label}>
                <i className={active ? 'is-active' : ''} />
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-ai__content landing-reveal">
          <p className="landing-eyebrow">The strategy</p>
          <h2 className="landing-heading">Three intensities. One AI.</h2>
          <p className="landing-copy">
            Avalisa AI adapts to market regime — trending or ranging — and picks
            the timeframe with the cleanest signal.
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
