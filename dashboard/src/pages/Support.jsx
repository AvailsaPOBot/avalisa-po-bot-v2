import { useState } from 'react';
import { MessageCircle, PlugZap, Receipt, Send, Settings, ShieldCheck } from 'lucide-react';
import '../styles/luxury.css';

const topics = [
  [PlugZap, 'Connect PO', 'Register, install, and open the overlay on Pocket Option.'],
  [Settings, 'Bot setup', 'Strategy, intensity, start amount, and demo mode.'],
  [Receipt, 'Billing', 'Basic, Pro, affiliate unlock, and account access.'],
  [ShieldCheck, 'Risk', 'What Avalisa can automate and what it cannot guarantee.'],
];

export default function Support() {
  const [messages, setMessages] = useState([
    ['assistant', 'Hi, I am Avalisa. Ask me about setup, pricing, account access, or bot controls.'],
  ]);
  const [input, setInput] = useState('');

  function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((items) => [...items, ['user', text], ['assistant', 'For the fastest setup, install the Chrome extension, open Pocket Option, sign in from the Avalisa panel, then test in demo mode first.']]);
    setInput('');
  }

  return (
    <main className="lux-support-page">
      <section className="lux-support-shell">
        <div className="lux-support-copy">
          <p className="lux-kicker">Support</p>
          <h1>Talk to Avalisa.</h1>
          <p>Use support for setup, account access, plan questions, and Pocket Option extension troubleshooting. Avalisa keeps answers focused on the product.</p>
          <div className="lux-topic-grid">
            {topics.map(([Icon, title, text]) => (
              <article key={title}><Icon size={22} /><h2>{title}</h2><p>{text}</p></article>
            ))}
          </div>
        </div>

        <section className="lux-support-chat">
          <header>
            <img src="/images/landing/avalisa-blonde-support.png" alt="" />
            <div><strong>AI Support Chat</strong><span>Powered by Avalisa</span></div>
            <em>Online</em>
          </header>
          <div className="lux-support-feed">
            {messages.map(([role, text], index) => <p key={`${role}-${index}`} className={role === 'user' ? 'is-user' : ''}>{text}</p>)}
          </div>
          <form onSubmit={send}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about setup, strategies, or your account..." />
            <button type="submit"><Send size={16} /></button>
          </form>
          <small><MessageCircle size={13} /> AI responses are informational only. Trading involves risk.</small>
        </section>
      </section>
    </main>
  );
}
