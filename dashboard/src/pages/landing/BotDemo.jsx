const FLOW = [
  {
    label: 'Scan the chart',
    text: 'Avalisa checks payout, trend, RSI, Bollinger Bands, and signal conflict before it acts.',
    meta: 'Pair scan',
  },
  {
    label: 'Open one trade',
    text: 'When the setup is clean, the bot sends CALL or PUT from the Pocket Option page.',
    meta: 'CALL / PUT',
  },
  {
    label: 'Record the result',
    text: 'Each trade is counted in your history so you can review performance and adjust risk.',
    meta: 'Win / Loss',
  },
];

export default function BotDemo() {
  return (
    <section className="landing-section" id="demo">
      <div className="landing-shell landing-demo">
        <div className="landing-section__heading landing-reveal">
          <p className="landing-eyebrow">After you press Start</p>
          <h2 className="landing-heading">A simple trading workflow.</h2>
          <p className="landing-copy">
            Avalisa turns market checks into three actions users can understand.
          </p>
        </div>

        <div className="landing-demo__panel landing-demo__panel--workflow landing-reveal">
          <div className="landing-demo__mock">
            <div className="landing-demo__mock-chart" aria-hidden="true">
              <span className="is-down" />
              <span />
              <span />
              <span className="is-down" />
              <span />
              <span />
              <span className="is-down" />
              <span />
            </div>
            <div className="landing-demo__mock-bot">
              <span>Avalisa Bot</span>
              <strong>Ready to start</strong>
              <small>Pair scan · Payout check · Risk control</small>
              <button type="button">Start</button>
            </div>
          </div>

          <div className="landing-demo__flow">
            {FLOW.map((item, index) => (
              <article key={item.label} className="landing-demo__flow-card">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <small>{item.meta}</small>
                <h3>{item.label}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
