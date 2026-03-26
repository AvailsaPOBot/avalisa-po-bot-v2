import { useState, useRef, useEffect } from 'react';
import api from '../lib/api';

export default function Support() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm the Avalisa Bot support assistant. Ask me anything about setup, strategies, or troubleshooting. How can I help?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again in a moment.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">AI Support Chat</h1>
        <p className="text-gray-400 text-sm mt-1">Powered by Gemini (free) — ask anything about Avalisa Bot</p>
      </div>

      <div className="card flex flex-col" style={{ height: '520px' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-dark-700 border border-dark-600 text-gray-200 rounded-bl-sm'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-dark-700 border border-dark-600 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="flex gap-2 border-t border-dark-600 pt-4">
          <input
            className="input flex-1 text-sm"
            placeholder="Ask about setup, strategies, or your account..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}
            className="btn-primary px-4 py-2 text-sm whitespace-nowrap">
            Send
          </button>
        </form>
      </div>

      <p className="text-xs text-gray-600 mt-4 text-center">
        AI responses are for informational purposes only. Trading involves risk — always trade responsibly.
      </p>
    </div>
  );
}
