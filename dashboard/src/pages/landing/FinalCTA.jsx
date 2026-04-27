import { Link } from 'react-router-dom';

export default function FinalCTA() {
  return (
    <section className="landing-section landing-final-cta">
      <div
        className="landing-final-cta__background"
        aria-hidden="true"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(10, 10, 15, 0.45), rgba(10, 10, 15, 0.9)), url(${process.env.PUBLIC_URL}/images/landing/cta-bg.jpg)`,
        }}
      />
      <div className="landing-shell landing-final-cta__content landing-reveal">
        <p className="landing-eyebrow">Final call</p>
        <h2 className="landing-final-cta__title">Charles is waiting.</h2>
        <div className="landing-final-cta__actions">
          <Link className="landing-button landing-button--primary" to="/register">
            Start Free
          </Link>
          <Link className="landing-button landing-button--outline" to="/pricing">
            View Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
