export default function FAQ({ items }) {
  return (
    <section className="landing-section">
      <div className="landing-shell landing-faq">
        <div className="landing-section__heading landing-reveal">
          <p className="landing-eyebrow">FAQ</p>
          <h2 className="landing-heading">Three quick answers.</h2>
        </div>

        <div className="landing-faq-grid landing-reveal">
          {items.map((item) => (
            <article className="landing-faq-card" key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
