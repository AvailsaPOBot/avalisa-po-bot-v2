import { useEffect, useState } from 'react';

const STATES = [
  { label: 'Loading', value: '30/30', tone: 'neutral', duration: 1000 },
  {
    label: 'Charles',
    value: 'action=CALL  regime=trending  tf=M1  rules=3',
    tone: 'neutral',
    duration: 2000,
  },
  {
    label: 'Trade open',
    value: 'waiting 60s for result',
    tone: 'neutral',
    duration: 2000,
  },
  { label: 'Result', value: '+$19.20', tone: 'success', duration: 2000 },
];

export default function BotDemo() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % STATES.length);
    }, STATES[index].duration);

    return () => window.clearTimeout(timer);
  }, [index]);

  const currentState = STATES[index];

  return (
    <section className="landing-section" id="demo">
      <div className="landing-shell landing-demo">
        <div className="landing-section__heading landing-reveal">
          <p className="landing-eyebrow">Bot demo</p>
          <h2 className="landing-heading">Watch Charles work.</h2>
          <p className="landing-copy">
            This is the actual bot panel that lives on your Pocket Option page.
          </p>
        </div>

        <div className="landing-demo__panel landing-reveal">
          <div className="landing-demo__topbar">
            <span className="landing-demo__dot" />
            <span className="landing-demo__dot" />
            <span className="landing-demo__dot" />
            <span className="landing-demo__badge">AVALISA // CHARLES</span>
          </div>

          <div className="landing-demo__screen">
            <div className="landing-demo__column">
              <span className="landing-demo__label">{currentState.label}</span>
              <strong
                className={`landing-demo__value ${
                  currentState.tone === 'success' ? 'is-success' : ''
                }`}
              >
                {currentState.value}
              </strong>
            </div>
            <div className="landing-demo__timeline" aria-hidden="true">
              {STATES.map((state, stateIndex) => (
                <span
                  key={state.label}
                  className={`landing-demo__tick ${
                    stateIndex === index ? 'is-active' : ''
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="landing-chip-row">
            <span className="landing-chip">WebSocket-based</span>
            <span className="landing-chip">Real-time signals</span>
            <span className="landing-chip">No external servers</span>
          </div>
        </div>
      </div>
    </section>
  );
}
