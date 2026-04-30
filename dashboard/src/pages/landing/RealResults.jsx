export default function RealResults({ results }) {
  return (
    <section className="landing-section landing-results-section">
      <div className="landing-shell landing-results-panel landing-reveal">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Proof board</p>
          <h2 className="landing-heading">Track every trade.</h2>
          <p className="landing-copy">
            Avalisa keeps the trading workflow visible: signal, action, result, and history.
          </p>
        </div>

        <div className="landing-results-layout">
          <div className="landing-results-ledger">
            <div className="landing-results-ledger__row is-head">
              <span>Pair</span>
              <span>Action</span>
              <span>Result</span>
            </div>
            <div className="landing-results-ledger__row">
              <span>EUR/USD</span>
              <strong>CALL</strong>
              <em>Win +$18.70</em>
            </div>
            <div className="landing-results-ledger__row">
              <span>GBP/JPY</span>
              <strong>PUT</strong>
              <em>Win +$17.90</em>
            </div>
            <div className="landing-results-ledger__row">
              <span>AUD/USD</span>
              <strong>CALL</strong>
              <b>Loss -$10.00</b>
            </div>
          </div>

          <div className="landing-stats-grid">
            {results.map((result) => (
              <article className="landing-stat-card" key={result.label}>
                <strong className="landing-stat-card__value">{result.value}</strong>
                <span className="landing-stat-card__label">{result.label}</span>
                <p>{result.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <p className="landing-note">
          Past performance is not a guarantee. Test first, control your amount, and stop anytime.
        </p>
      </div>
    </section>
  );
}
