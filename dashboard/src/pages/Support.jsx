import { MessageCircle, PlugZap, Receipt, Settings, ShieldCheck } from 'lucide-react';

const TOPICS = [
  { icon: PlugZap, label: 'Connect PO', text: 'Register, install, and open the overlay.' },
  { icon: Settings, label: 'Bot setup', text: 'Strategy, intensity, start amount, and demo mode.' },
  { icon: Receipt, label: 'Billing', text: 'Basic, Pro, affiliate unlock, and account access.' },
  { icon: ShieldCheck, label: 'Risk', text: 'What Avalisa can control and what it cannot.' },
];

export default function Support() {
  return (
    <div className="support-showcase support-showcase--simple">
      <section className="support-hero-panel">
        <div>
          <p className="support-eyebrow">Support</p>
          <h1>Need help? Use the red Ask button.</h1>
          <p>
            The red Ask button stays in the corner of every page. Open it when you need setup,
            billing, bot settings, or Pocket Option connection help.
          </p>
        </div>
        <div className="support-chat-callout" aria-hidden="true">
          <MessageCircle size={26} />
          <span>Ask Avalisa</span>
        </div>
      </section>

      <div className="support-topic-grid">
        {TOPICS.map(({ icon: Icon, label, text }) => (
          <article key={label} className="support-topic-card">
            <Icon size={22} />
            <h2>{label}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
