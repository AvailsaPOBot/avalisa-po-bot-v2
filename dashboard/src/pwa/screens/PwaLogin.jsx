import { useState } from 'react'
import api from '../api'
import { T } from '../theme'

/* ── Eye icons ───────────────────────────────────────────── */
const EyeOpen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

/* ── Shared input style ───────────────────────────────────── */
const inputStyle = {
  width: '100%',
  background: T.bg,
  border: `0.5px solid ${T.border}`,
  borderRadius: 8,
  padding: '12px 14px',
  color: T.textPrimary,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

export default function PwaLogin({ onLoginSuccess, onNavigate }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  function focusBorder(e)  { e.target.style.borderColor = T.ai }
  function blurBorder(e)   { e.target.style.borderColor = T.border }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', { email, password })
      const { token, user } = res.data
      localStorage.setItem('pwa_token', token)
      localStorage.setItem('pwa_user', JSON.stringify(user))
      onLoginSuccess(token, user)
    } catch (err) {
      if (!err.response) {
        setError('Server is starting up, please try again in a moment')
      } else {
        setError('Invalid email or password')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* ── Logo block ────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/images/AvalisaBot_Logo.png"
            alt="Avalisa Bot"
            style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 16, marginBottom: 14, display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
          />
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '2px' }}>
            <span style={{ color: T.bot }}>AVALISA</span>
            <span style={{ color: T.textPrimary }}>BOT</span>
          </div>
          <p style={{ color: T.textSec, fontSize: 13, marginTop: 6 }}>
            Trading bot for Pocket Option
          </p>
        </div>

        {/* ── Login card ────────────────────────────────────── */}
        <div style={{
          background: T.card,
          border: `0.5px solid ${T.border}`,
          borderRadius: 16,
          padding: '28px',
        }}>
          <h2 style={{ color: T.textPrimary, fontSize: 18, fontWeight: 600, marginBottom: 20, margin: '0 0 20px' }}>
            Welcome back
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Email */}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              style={{ ...inputStyle, '::placeholder': { color: '#4a6080' } }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />

            {/* Password with show/hide */}
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: T.textSec,
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0,
                }}
              >
                {showPw ? <EyeOff /> : <EyeOpen />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <p style={{ color: T.put, fontSize: 12, margin: 0 }}>{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? T.border : T.ai,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '13px',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 4,
                width: '100%',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!loading) e.target.style.background = '#1565c0' }}
              onMouseLeave={e => { if (!loading) e.target.style.background = T.ai }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* ── Register link ─────────────────────────────────── */}
        <p style={{ textAlign: 'center', color: T.textSec, fontSize: 14, marginTop: 20 }}>
          Don't have an account?{' '}
          <span
            onClick={() => onNavigate('register')}
            style={{ color: T.ai, cursor: 'pointer', fontWeight: 500 }}
          >
            Register
          </span>
        </p>

      </div>
    </div>
  )
}
