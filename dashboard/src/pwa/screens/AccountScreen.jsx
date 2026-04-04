import { useState, useEffect } from 'react'
import api from '../api'
import './AccountScreen.css'

const LS_BASIC_URL    = process.env.REACT_APP_LS_BASIC_URL    || ''
const LS_LIFETIME_URL = process.env.REACT_APP_LS_LIFETIME_URL || ''

function appendEmail(url, email) {
  if (!url || !email) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}checkout[email]=${encodeURIComponent(email)}`
}

export default function AccountScreen({ onLogout, onNavigate }) {
  const [user,       setUser]       = useState(null)
  const [plan,       setPlan]       = useState('free')
  const [tradesUsed, setTradesUsed] = useState(0)
  const [tradesLimit, setTradesLimit] = useState(10)

  const fetchAccount = async () => {
    try {
      const userStr = localStorage.getItem('pwa_user')
      if (userStr) setUser(JSON.parse(userStr))
      const res  = await api.get('/api/license/status')
      const data = res.data
      setPlan(data.plan         || 'free')
      setTradesUsed(data.tradesUsed  || 0)
      setTradesLimit(data.tradesLimit || 10)
    } catch (e) {
      console.warn('Account fetch failed:', e.message)
    }
  }

  useEffect(() => { fetchAccount() }, [])

  function handleLogout() {
    localStorage.removeItem('pwa_token')
    localStorage.removeItem('pwa_user')
    onLogout()
  }

  const email   = user?.email || ''
  const initial = email ? email[0].toUpperCase() : '?'

  const planBadgeClass = plan === 'lifetime' ? 'as-plan-badge as-plan-lifetime'
                        : plan === 'basic'    ? 'as-plan-badge as-plan-basic'
                        :                       'as-plan-badge as-plan-free'
  const planLabel = plan === 'lifetime' ? 'LIFETIME' : plan === 'basic' ? 'BASIC' : 'FREE'

  const usagePct   = tradesLimit ? Math.min((tradesUsed / tradesLimit) * 100, 100) : 0
  const fillColor  = usagePct >= 80 ? '#e74c3c' : '#7c3aed'

  const showUpgrade = plan === 'free' || plan === 'basic'

  return (
    <div className="as-root">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="as-header">
        <span className="as-header-title">Account</span>
        <button className="as-logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      {/* ── Scrollable body ───────────────────────────────── */}
      <div className="as-body">

        {/* Profile card */}
        <div className="as-card">
          <div className="as-avatar">
            <span className="as-avatar-letter">{initial}</span>
          </div>
          <p className="as-email">{email || '—'}</p>
          <span className={planBadgeClass}>{planLabel}</span>
        </div>

        {/* Usage card */}
        <div className="as-card">
          <p className="as-usage-title">Trade Usage</p>
          {plan === 'lifetime' ? (
            <span className="as-unlimited">Unlimited trades</span>
          ) : (
            <>
              <div className="as-usage-row">
                <span className="as-usage-text">{tradesUsed} / {tradesLimit} trades used</span>
                <span className="as-usage-count">{Math.round(usagePct)}%</span>
              </div>
              <div className="as-progress-track">
                <div className="as-progress-fill" style={{ width: `${usagePct}%`, background: fillColor }} />
              </div>
            </>
          )}
        </div>

        {/* Upgrade card (free or basic only) */}
        {showUpgrade && (
          <div className="as-card-upgrade">
            <p className="as-upgrade-title">Upgrade Plan</p>

            {/* Basic plan */}
            {plan !== 'basic' && (
              <button
                className="as-plan-btn"
                onClick={() => window.open(appendEmail(LS_BASIC_URL, email), '_blank', 'noopener')}
              >
                <div className="as-plan-btn-left">
                  <span className="as-plan-name">Basic</span>
                  <span className="as-plan-trades">100 trades</span>
                </div>
                <div className="as-plan-btn-right">
                  <span className="as-plan-price">$50</span>
                  <span className="as-plan-cta" style={{ color: '#1a7cfa' }}>Upgrade →</span>
                </div>
              </button>
            )}

            {/* Lifetime plan */}
            <button
              className="as-plan-btn"
              style={{ borderColor: '#f59e0b' }}
              onClick={() => window.open(appendEmail(LS_LIFETIME_URL, email), '_blank', 'noopener')}
            >
              <div className="as-plan-btn-left">
                <span className="as-plan-name" style={{ color: '#f59e0b' }}>Lifetime</span>
                <span className="as-plan-trades">Unlimited</span>
              </div>
              <div className="as-plan-btn-right">
                <span className="as-best-badge">Best Value</span>
                <span className="as-plan-price">$100</span>
                <span className="as-plan-cta" style={{ color: '#f59e0b' }}>Upgrade →</span>
              </div>
            </button>

            <button className="as-refresh-btn" onClick={fetchAccount}>
              Refresh Plan
            </button>
            <p className="as-upgrade-note">After payment your plan updates automatically within a few minutes</p>
          </div>
        )}

        {/* AI Support card */}
        <div className="as-support-card">
          <div>
            <p className="as-support-title">AI Support</p>
            <p className="as-support-sub">Powered by Gemini</p>
          </div>
          <button className="as-chat-btn" onClick={() => onNavigate('chat')}>
            Chat →
          </button>
        </div>

      </div>
    </div>
  )
}
