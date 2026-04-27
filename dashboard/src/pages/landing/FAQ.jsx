import { useState } from 'react';

export default function FAQ({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="landing-section">
      <div className="landing-shell landing-faq">
        <div className="landing-section__heading landing-reveal">
          <p className="landing-eyebrow">FAQ</p>
          <h2 className="landing-heading">Questions, answered.</h2>
        </div>

        <div className="landing-accordion landing-reveal">
          {items.map((item, index) => {
            const isOpen = index === openIndex;

            return (
              <article className="landing-accordion__item" key={item.question}>
                <button
                  type="button"
                  className="landing-accordion__trigger"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                >
                  <span>{item.question}</span>
                  <span className="landing-accordion__icon" aria-hidden="true">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                <div
                  className={`landing-accordion__content ${
                    isOpen ? 'is-open' : ''
                  }`}
                >
                  <p>{item.answer}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
