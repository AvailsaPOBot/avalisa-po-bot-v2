export default function RealResults({ results }) {
  return (
    <section className="landing-section">
      <div className="landing-shell">
        <div className="landing-section__heading landing-reveal">
          <p className="landing-eyebrow">Real results</p>
          <h2 className="landing-heading">Numbers don&apos;t lie.</h2>
          <p className="landing-copy">
            Aggregated win rates across all Avalisa users this week.
          </p>
        </div>

        <div className="landing-stats-grid">
          {results.map((result) => (
            <article className="landing-stat-card landing-reveal" key={result.label}>
              <strong className="landing-stat-card__value">{result.value}</strong>
              <span className="landing-stat-card__label">{result.label}</span>
            </article>
          ))}
        </div>

        <p className="landing-note landing-reveal">
          Stats refresh hourly. Past performance is not a guarantee of future
          results.
        </p>
      </div>
    </section>
  );
}
