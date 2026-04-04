import { useState, useRef, useEffect } from 'react'
import api from '../api'
import './ChatScreen.css'

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)

const INIT_MSG = {
  role: 'assistant',
  content: "Hi! I'm the Avalisa AI assistant. How can I help you with the bot today?",
  id: 'init',
}

export default function ChatScreen({ onBack }) {
  const [messages, setMessages] = useState([INIT_MSG])
  const [input,    setInput]    = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const listRef    = useRef(null)
  const textareaRef = useRef(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isTyping) return

    const userMsg    = { role: 'user', content: text, id: Date.now().toString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsTyping(true)

    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)

    try {
      const res = await api.post('/api/support/chat', {
        message: text,
        history: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      })
      const reply  = res.data.response || res.data.message || 'Sorry, I could not process that.'
      const botMsg = { role: 'assistant', content: reply, id: Date.now().toString() + '_bot' }
      setMessages(prev => [...prev, botMsg])
    } catch (e) {
      const errMsg = {
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting. Please try again in a moment.",
        id: Date.now().toString() + '_err',
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsTyping(false)
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
      }, 50)
    }
  }

  return (
    <div className="cs-root">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="cs-header">
        <button className="cs-back-btn" onClick={onBack}>← Back</button>
        <span className="cs-header-title">AI Support</span>
        <span className="cs-gemini-pill">Powered by Gemini</span>
      </div>

      {/* ── Messages ──────────────────────────────────────── */}
      <div className="cs-list" ref={listRef}>
        {messages.map(msg => (
          msg.role === 'assistant' ? (
            <div key={msg.id} className="cs-msg-bot">
              <span className="cs-bot-label">Avalisa AI</span>
              <div className="cs-bubble-bot">{msg.content}</div>
            </div>
          ) : (
            <div key={msg.id} className="cs-msg-user">
              <div className="cs-bubble-user">{msg.content}</div>
            </div>
          )
        ))}

        {isTyping && (
          <div className="cs-msg-bot">
            <span className="cs-bot-label">Avalisa AI</span>
            <div className="cs-bubble-bot">
              <div className="cs-typing-dots">
                <span className="cs-dot" />
                <span className="cs-dot" />
                <span className="cs-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Input bar ─────────────────────────────────────── */}
      <div className="cs-inputbar">
        <textarea
          ref={textareaRef}
          className="cs-textarea"
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about the bot..."
        />
        <button
          className="cs-send-btn"
          onClick={sendMessage}
          disabled={isTyping || !input.trim()}
        >
          <SendIcon />
        </button>
      </div>

    </div>
  )
}
