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

const fieldError = { color: T.put, fontSize: 12, marginTop: 4, marginBottom: 0 }

export default function PwaRegister({ onLoginSuccess, onNavigate }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [poUserId, setPoUserId] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [showCf, setShowCf]     = useState(false)
  const [errors, setErrors]     = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading]   = useState(false)

  function focusBorder(e)  { e.target.style.borderColor = T.bot }
  function blurBorder(e)   { e.target.style.borderColor = T.border }

  function validate() {
    const e = {}
    if (!email.includes('@'))               e.email    = 'Enter a valid email address'
    if (password.length < 6)               e.password = 'Password must be at least 6 characters'
    if (confirm !== password)              e.confirm  = 'Passwords do not match'
    if (!poUserId || !/^\d+$/.test(poUserId.trim())) e.poUserId = 'Must be a numeric PO user ID'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError('')
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      const res = await api.post('/api/auth/register', { email, password, poUserId: poUserId.trim() })
      const { token, user } = res.data
      localStorage.setItem('pwa_token', token)
      localStorage.setItem('pwa_user', JSON.stringify(user))
      onLoginSuccess(token, user)
    } catch (err) {
      setServerError(err.response?.data?.error || 'Registration failed, please try again')
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

        {/* ── Register card ─────────────────────────────────── */}
        <div style={{
          background: T.card,
          border: `0.5px solid ${T.border}`,
          borderRadius: 16,
          padding: '28px',
        }}>
          <h2 style={{ color: T.textPrimary, fontSize: 18, fontWeight: 600, margin: '0 0 20px' }}>
            Create account
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Email */}
            <div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                style={inputStyle}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
              {errors.email && <p style={fieldError}>{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.textSec, display: 'flex', alignItems: 'center', padding: 0 }}
                >
                  {showPw ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
              {errors.password && <p style={fieldError}>{errors.password}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCf ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
                <button
                  type="button"
                  onClick={() => setShowCf(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.textSec, display: 'flex', alignItems: 'center', padding: 0 }}
                >
                  {showCf ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
              {errors.confirm && <p style={fieldError}>{errors.confirm}</p>}
            </div>

            {/* PO User ID */}
            <div>
              <input
                type="text"
                value={poUserId}
                onChange={e => setPoUserId(e.target.value)}
                placeholder="Your PO numeric user ID"
                style={inputStyle}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
              <p style={{ color: T.textSec, fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                Find your ID in your Pocket Option profile
              </p>
              {errors.poUserId && <p style={fieldError}>{errors.poUserId}</p>}
            </div>

            {/* Server error */}
            {serverError && (
              <p style={{ color: T.put, fontSize: 12, margin: 0 }}>{serverError}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? T.border : T.bot,
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
              onMouseEnter={e => { if (!loading) e.target.style.background = '#6d28d9' }}
              onMouseLeave={e => { if (!loading) e.target.style.background = T.bot }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>

            {/* Free plan note */}
            <p style={{ textAlign: 'center', color: T.textSec, fontSize: 12, margin: '4px 0 0' }}>
              Free plan includes 10 trades · Upgrade anytime
            </p>
          </form>
        </div>

        {/* ── Login link ────────────────────────────────────── */}
        <p style={{ textAlign: 'center', color: T.textSec, fontSize: 14, marginTop: 20 }}>
          Already have an account?{' '}
          <span
            onClick={() => onNavigate('login')}
            style={{ color: T.ai, cursor: 'pointer', fontWeight: 500 }}
          >
            Sign in
          </span>
        </p>

      </div>
    </div>
  )
}
