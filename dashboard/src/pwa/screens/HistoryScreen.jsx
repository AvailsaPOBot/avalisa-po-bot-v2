import { useState, useEffect } from 'react'
import api from '../api'
import './HistoryScreen.css'

const RefreshIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
)

const EmptyIcon = () => (
  <svg width="40" height="40" viewBox="0 0 52 52" fill="none">
    <rect x="2"  y="30" width="10" height="20" rx="2" fill="#2a4060"/>
    <rect x="16" y="20" width="10" height="30" rx="2" fill="#2a4060"/>
    <rect x="30" y="8"  width="10" height="42" rx="2" fill="#2a4060"/>
    <rect x="44" y="14" width="8"  height="36" rx="2" fill="#2a4060"/>
  </svg>
)

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function HistoryScreen() {
  const [trades, setTrades]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [spinning, setSpinning] = useState(false)

  const fetchTrades = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/trades/history')
      const data = res.data.trades || res.data || []
      setTrades(data)
    } catch (e) {
      setError('Failed to load trades')
    } finally {
      setLoading(false)
      setSpinning(false)
    }
  }

  useEffect(() => { fetchTrades() }, [])

  function handleRefresh() {
    setSpinning(true)
    fetchTrades()
  }

  // Computed stats
  const totalTrades = trades.length
  const wins        = trades.filter(t => t.result === 'win').length
  const winRate     = totalTrades === 0 ? '—' : Math.round((wins / totalTrades) * 100) + '%'
  const totalPnL    = trades.reduce((sum, t) => {
    return sum + (t.result === 'win' ? parseFloat(t.amount) * 0.92 : -parseFloat(t.amount))
  }, 0)

  const pnlColor = totalPnL >= 0 ? '#2ecc71' : '#e74c3c'
  const pnlText  = (totalPnL >= 0 ? '+' : '') + '$' + Math.abs(totalPnL).toFixed(2)

  return (
    <div className="hs-root">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="hs-header">
        <span className="hs-header-title">Trade History</span>
        <button
          className={`hs-refresh-btn${spinning ? ' spinning' : ''}`}
          onClick={handleRefresh}
          aria-label="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>

      {/* ── Summary bar ───────────────────────────────────── */}
      <div className="hs-summary">
        <div className="hs-stat-card">
          <span className="hs-stat-val">{totalTrades}</span>
          <span className="hs-stat-lbl">Total Trades</span>
        </div>
        <div className="hs-stat-card">
          <span className="hs-stat-val" style={{ color: '#2ecc71' }}>{winRate}</span>
          <span className="hs-stat-lbl">Win Rate</span>
        </div>
        <div className="hs-stat-card">
          <span className="hs-stat-val" style={{ color: totalTrades === 0 ? '#fff' : pnlColor }}>
            {totalTrades === 0 ? '—' : pnlText}
          </span>
          <span className="hs-stat-lbl">Total P&amp;L</span>
        </div>
      </div>

      {/* ── List area ─────────────────────────────────────── */}
      <div className="hs-list">

        {/* Loading skeletons */}
        {loading && [0,1,2,3,4].map(i => (
          <div key={i} className="hs-skeleton" />
        ))}

        {/* Error */}
        {!loading && error && (
          <div className="hs-error">
            <p className="hs-error-msg">{error}</p>
            <button className="hs-retry-btn" onClick={fetchTrades}>Retry</button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && trades.length === 0 && (
          <div className="hs-empty">
            <EmptyIcon />
            <p className="hs-empty-title">No trades yet</p>
            <p className="hs-empty-sub">Start the bot to begin trading</p>
          </div>
        )}

        {/* Trade rows */}
        {!loading && !error && trades.map((trade, i) => (
          <div key={trade.id || i} className="hs-row">
            <div className="hs-row-left">
              <span className="hs-pair">{trade.pair || 'EUR/USD'}</span>
              <span className={`hs-dir ${trade.direction === 'CALL' ? 'hs-dir-call' : 'hs-dir-put'}`}>
                {trade.direction}
              </span>
              <span className="hs-time">{formatDate(trade.createdAt)}</span>
            </div>
            <div className="hs-row-right">
              <span className={`hs-badge ${trade.result === 'win' ? 'hs-badge-win' : 'hs-badge-loss'}`}>
                {trade.result.toUpperCase()}
              </span>
              <span className="hs-amount">${parseFloat(trade.amount).toFixed(2)}</span>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
