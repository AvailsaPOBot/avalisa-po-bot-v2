import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import api from '../lib/api';
import { HUMAN_FOLLOW_UP_LABEL, createAssistantMessage } from '../lib/supportChat';

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi, I'm Avalisa. Ask me about setup, pricing, Pocket Option, or bot settings." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/api/support/chat', { messages: nextMessages });
      setMessages((items) => [...items, createAssistantMessage(res.data)]);
    } catch {
      setMessages((items) => [...items, { role: 'assistant', content: 'Sorry, I could not reach support. Try again in a moment or email avalisapobot@gmail.com.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open && (
        <section className="floating-chat" aria-label="Talk to Avalisa">
          <header>
            <img src="/images/landing/avalisa-blonde-pricing.png" alt="" />
            <div>
              <strong>Talk to Avalisa</strong>
              <span>AI support assistant</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat"><X size={18} /></button>
          </header>

          <div className="floating-chat__feed">
            {messages.map((message, index) => (
              <p
                key={`${message.role}-${index}`}
                className={[
                  message.role === 'user' ? 'is-user' : '',
                  message.escalation ? 'is-escalation' : '',
                ].filter(Boolean).join(' ')}
              >
                {message.escalation && <span className="floating-chat__escalation-label">{HUMAN_FOLLOW_UP_LABEL}</span>}
                <span>{message.content}</span>
              </p>
            ))}
            {loading && <p>Thinking...</p>}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={sendMessage}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={loading}
              placeholder="Ask anything about Avalisa..."
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Send message">
              <Send size={16} />
            </button>
          </form>
        </section>
      )}

      <button className="floating-chat-button" type="button" onClick={() => setOpen((value) => !value)} aria-label="Ask Avalisa">
        {open ? <X size={22} /> : <><MessageCircle size={20} /><span>Ask</span></>}
      </button>
    </>
  );
}
