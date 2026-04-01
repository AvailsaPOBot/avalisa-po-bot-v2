import { useState, useRef, useEffect } from 'react';
import api from '../lib/api';

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm Avalisa's support assistant. Ask me anything about setup, strategies, or troubleshooting!" }
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

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/api/support/chat', { messages: newMessages });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Chat Window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '90px', right: '24px', zIndex: 999998,
          width: '340px', height: '480px',
          background: '#0d0d1a',
          border: '1px solid #1a1a3e',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            background: '#111128',
            borderBottom: '1px solid #1a1a3e',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#00ff88', boxShadow: '0 0 6px #00ff88',
              }} />
              <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '14px' }}>Avalisa Support</span>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#64748b',
              cursor: 'pointer', fontSize: '18px', lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? '#7c3aed' : '#1a1a3e',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  border: m.role === 'assistant' ? '1px solid #2d2d5b' : 'none',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '14px 14px 14px 4px',
                  background: '#1a1a3e', border: '1px solid #2d2d5b',
                  color: '#64748b', fontSize: '13px',
                }}>
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} style={{
            padding: '12px', borderTop: '1px solid #1a1a3e',
            display: 'flex', gap: '8px',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              placeholder="Ask anything..."
              style={{
                flex: 1, background: '#1a1a3e', border: '1px solid #2d2d5b',
                borderRadius: '8px', padding: '8px 12px',
                color: '#e2e8f0', fontSize: '13px', outline: 'none',
              }}
            />
            <button type="submit" disabled={loading || !input.trim()} style={{
              background: '#00ff88', color: '#0d0d1a', border: 'none',
              borderRadius: '8px', padding: '8px 14px',
              fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              opacity: loading || !input.trim() ? 0.4 : 1,
            }}>
              →
            </button>
          </form>
        </div>
      )}

      {/* Floating Bubble Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 999999,
          width: '56px', height: '56px', borderRadius: '50%',
          background: open ? '#1a1a3e' : '#00ff88',
          border: open ? '2px solid #00ff88' : 'none',
          boxShadow: '0 4px 24px rgba(0,255,136,0.4)',
          cursor: 'pointer', fontSize: '22px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}
        title="Chat with AI Support"
      >
        {open ? '✕' : '💬'}
      </button>
    </>
  );
}
