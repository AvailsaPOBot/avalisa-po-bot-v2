import { useState, useEffect, useRef } from 'react'
import api from '../api'
import './TradingScreen.css'

/* ── SVG icons ────────────────────────────────────────────── */
const WalletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="5" width="22" height="14" rx="2"/>
    <path d="M1 10h22"/>
    <circle cx="17" cy="14.5" r="1" fill="currentColor" stroke="none"/>
  </svg>
)

const UpArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"/>
    <polyline points="5 12 12 5 19 12"/>
  </svg>
)

const DownArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <polyline points="19 12 12 19 5 12"/>
  </svg>
)

/* ── Shared style snippets ────────────────────────────────── */
const pill = {
  background: '#152338',
  border: '0.5px solid #2a4060',
  borderRadius: 20,
  padding: '5px 12px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

const fieldBox = {
  background: '#152338',
  border: '0.5px solid #2a4060',
  borderRadius: 8,
  padding: '6px 10px',
  flex: 1,
}

const lbl = { fontSize: 9, color: '#8fa8c8', display: 'block', lineHeight: 1.3 }
const val = { fontSize: 13, color: '#ffffff', fontWeight: 600, display: 'block', lineHeight: 1.3 }

/* ══════════════════════════════════════════════════════════ */
export default function TradingScreen({ onNavigate }) {
  const [botState, setBotState]           = useState('idle')
  const [sessionTrades, setSessionTrades] = useState(0)
  const [lastTrade, setLastTrade]         = useState(null)
  const [showPopup, setShowPopup]         = useState(false)
  const [settings, setSettings]           = useState(null)
  const [toast, setToast]                 = useState(null)
  const [tradeFeed, setTradeFeed]         = useState([])
  const [sessionPnL, setSessionPnL]       = useState(0)

  const botTimerRef   = useRef(null)
  const tradeCountRef = useRef(0)

  /* ── Fetch settings on mount ────────────────────────────── */
  useEffect(() => {
    api.get('/api/settings')
      .then(res => setSettings(res.data))
      .catch(err => console.warn('Settings fetch failed:', err.message))
  }, [])

  /* ── Cleanup on unmount ─────────────────────────────────── */
  useEffect(() => {
    return () => clearTimeout(botTimerRef.current)
  }, [])

  /* ── Toast helper ───────────────────────────────────────── */
  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  /* ── Bot engine ─────────────────────────────────────────── */
  function scheduleNextTrade(s) {
    const delay = (s.delaySeconds || 5) * 1000
    botTimerRef.current = setTimeout(() => executeTrade(s), delay)
  }

  async function executeTrade(s) {
    const won    = Math.random() > 0.5
    const amount = parseFloat(s.startAmount) || 1
    const profit = won ? parseFloat((amount * 0.92).toFixed(2)) : -amount

    const trade = {
      pair: 'EUR/USD',
      direction: s.direction === 'AUTO'
        ? (tradeCountRef.current % 2 === 0 ? 'CALL' : 'PUT')
        : s.direction,
      amount,
      result: won ? 'win' : 'loss',
      profit,
    }

    // Log to backend (non-blocking)
    try {
      await api.post('/api/trades/log', {
        pair:          trade.pair,
        direction:     trade.direction,
        amount:        trade.amount,
        result:        trade.result,
        balanceBefore: 0,
        balanceAfter:  0,
      })
    } catch (e) {
      console.warn('Trade log failed:', e.message)
    }

    // Update feed + P&L
    setTradeFeed(prev => [trade, ...prev])
    setSessionPnL(prev => parseFloat((prev + trade.profit).toFixed(2)))

    // Show result popup for 3s
    setLastTrade(trade)
    setShowPopup(true)
    setTimeout(() => setShowPopup(false), 3000)

    // Increment counter
    tradeCountRef.current += 1
    setSessionTrades(tradeCountRef.current)

    // Hit 10-trade limit → pause
    if (tradeCountRef.current >= 10) {
      setBotState('paused')
      return
    }

    // Schedule next only if not stopped
    if (botTimerRef.current !== null) {
      scheduleNextTrade(s)
    }
  }

  async function startBot() {
    try {
      const res = await api.get('/api/settings')
      const s   = res.data
      setSettings(s)
      tradeCountRef.current = 0
      setSessionTrades(0)
      setTradeFeed([])
      setSessionPnL(0)
      setBotState('running')
      scheduleNextTrade(s)
    } catch (e) {
      showToast('Failed to load settings — check connection')
    }
  }

  function stopBot() {
    clearTimeout(botTimerRef.current)
    botTimerRef.current   = null
    tradeCountRef.current = 0
    setSessionTrades(0)
    setTradeFeed([])
    setSessionPnL(0)
    setBotState('idle')
    setShowPopup(false)
  }

  function continueBot() {
    if (!settings) return
    tradeCountRef.current = 0
    setSessionTrades(0)
    setBotState('running')
    scheduleNextTrade(settings)
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="ts-root">

      {/* ── TopBar ──────────────────────────────────────────── */}
      <div className="ts-topbar">
        <div style={pill}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>EUR/USD OTC</span>
          <span style={{ color: '#8fa8c8', fontSize: 11 }}> ▼</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ background: '#152338', border: '0.5px solid #2a4060', borderRadius: 8, padding: '4px 10px' }}>
            <span style={lbl}>Balance</span>
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>In PO ↗</span>
          </div>
          <a
            href="https://pocketoption.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: '#1a7cfa', borderRadius: 8, width: 32, height: 32, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, textDecoration: 'none' }}
          >
            <WalletIcon />
          </a>
        </div>
      </div>

      {/* ── BotStrip ────────────────────────────────────────── */}
      {botState === 'idle' && (
        <div className="ts-botstrip" style={{ background: '#152338', borderBottom: '0.5px solid #2a4060' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ts-dot" style={{ background: '#4a6080' }} />
            <span style={{ color: '#8fa8c8', fontSize: 12, fontWeight: 600 }}>BOT IDLE</span>
          </div>
          <button
            onClick={startBot}
            style={{ background: '#2ecc71', color: '#0a1628', fontWeight: 800, fontSize: 12, padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer' }}
          >
            START
          </button>
        </div>
      )}

      {botState === 'running' && (
        <div className="ts-botstrip" style={{ background: 'rgba(124,58,237,0.92)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ts-dot ts-dot-pulse" />
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>BOT RUNNING</span>
            <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${(sessionTrades / 10) * 100}%`, height: '100%', background: '#00ff88', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <span style={{ color: '#ddd6fe', fontSize: 11 }}>{sessionTrades}/10</span>
          </div>
          <button
            onClick={stopBot}
            style={{ background: '#4c1d95', color: '#ddd6fe', fontSize: 11, padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer' }}
          >
            STOP
          </button>
        </div>
      )}

      {botState === 'paused' && (
        <div className="ts-botstrip" style={{ background: '#78350f', borderBottom: '0.5px solid #92400e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ts-dot" style={{ background: '#f59e0b' }} />
            <span style={{ color: '#fde68a', fontSize: 12, fontWeight: 600 }}>PAUSED — 10 trades done</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={continueBot}
              style={{ background: '#2ecc71', color: '#0a1628', fontWeight: 700, fontSize: 11, padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer' }}
            >
              Continue
            </button>
            <button
              onClick={stopBot}
              style={{ background: 'transparent', color: '#fde68a', border: '0.5px solid #92400e', fontSize: 11, padding: '4px 12px', borderRadius: 5, cursor: 'pointer' }}
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* ── Chart zone ──────────────────────────────────────── */}
      <div className="ts-chart-zone">

        {/* Idle — open PO panel */}
        {botState === 'idle' && (
          <div className="ts-chart-placeholder">
            <div className="ts-chart-placeholder-inner">
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <rect x="2"  y="30" width="10" height="20" rx="2" fill="#2a4060"/>
                <rect x="16" y="20" width="10" height="30" rx="2" fill="#2a4060"/>
                <rect x="30" y="8"  width="10" height="42" rx="2" fill="#7c3aed"/>
                <rect x="44" y="14" width="8"  height="36" rx="2" fill="#2a4060"/>
              </svg>
              <p className="ts-chart-title">Ready to trade</p>
              <p className="ts-chart-sub">Open Pocket Option in your browser, log in, then tap START BOT above.</p>
              <a
                href="https://pocketoption.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ts-open-po-btn"
              >
                Open Pocket Option ↗
              </a>
              <p className="ts-chart-hint">Already open? Just tap START BOT</p>
            </div>
          </div>
        )}

        {/* Running / paused — live trade feed */}
        {(botState === 'running' || botState === 'paused') && (
          <div className="ts-live-feed">
            <div className="ts-feed-header">
              <span className="ts-feed-title">Live trades</span>
              <a
                href="https://pocketoption.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ts-feed-po-link"
              >
                PO chart ↗
              </a>
            </div>

            <div className="ts-feed-stats">
              <div className="ts-feed-stat">
                <span className="ts-feed-stat-val">{sessionTrades}</span>
                <span className="ts-feed-stat-label">trades</span>
              </div>
              <div className="ts-feed-stat">
                <span className="ts-feed-stat-val" style={{ color: '#2ecc71' }}>
                  {sessionTrades === 0
                    ? '—'
                    : Math.round((tradeFeed.filter(t => t.result === 'win').length / sessionTrades) * 100) + '%'
                  }
                </span>
                <span className="ts-feed-stat-label">win rate</span>
              </div>
              <div className="ts-feed-stat">
                <span className="ts-feed-stat-val" style={{ color: sessionPnL >= 0 ? '#2ecc71' : '#e74c3c' }}>
                  {sessionPnL >= 0 ? '+' : ''}${Math.abs(sessionPnL).toFixed(2)}
                </span>
                <span className="ts-feed-stat-label">session P&amp;L</span>
              </div>
            </div>

            <div className="ts-feed-list">
              {tradeFeed.length === 0 && (
                <div className="ts-feed-empty">Waiting for first trade...</div>
              )}
              {tradeFeed.map((trade, i) => (
                <div key={i} className={`ts-feed-row ${trade.result === 'win' ? 'ts-feed-win' : 'ts-feed-loss'}`}>
                  <div className="ts-feed-row-left">
                    <span className="ts-feed-pair">{trade.pair}</span>
                    <span className={`ts-feed-dir ${trade.direction === 'CALL' ? 'ts-dir-call' : 'ts-dir-put'}`}>
                      {trade.direction}
                    </span>
                  </div>
                  <div className="ts-feed-row-right">
                    <span className={`ts-feed-result ${trade.result === 'win' ? 'ts-res-win' : 'ts-res-loss'}`}>
                      {trade.result === 'win' ? `+$${trade.profit.toFixed(2)}` : `-$${trade.amount.toFixed(2)}`}
                    </span>
                    <span className="ts-feed-badge">{trade.result.toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result popup — overlays either zone */}
        {showPopup && lastTrade && (
          <div
            className="ts-popup"
            style={{
              background: lastTrade.result === 'win' ? 'rgba(10,46,26,0.96)' : 'rgba(46,10,10,0.96)',
              border: `1.5px solid ${lastTrade.result === 'win' ? '#2ecc71' : '#e74c3c'}`,
              borderRadius: 14,
              padding: '14px 24px',
            }}
          >
            <div style={{ color: lastTrade.result === 'win' ? '#2ecc71' : '#e74c3c', fontSize: 10, fontWeight: 600, letterSpacing: '1px' }}>
              TRADE RESULT
            </div>
            <div style={{ color: lastTrade.result === 'win' ? '#2ecc71' : '#e74c3c', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
              {lastTrade.result === 'win' ? '+' : '-'}${Math.abs(lastTrade.profit).toFixed(2)}
            </div>
            <div style={{ color: '#8fa8c8', fontSize: 11, marginTop: 4 }}>
              {lastTrade.pair} · {lastTrade.direction} · {lastTrade.result.toUpperCase()}
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && <div className="ts-toast">{toast}</div>}
      </div>

      {/* ── Sentiment bar ───────────────────────────────────── */}
      <div className="ts-sentiment">
        <span style={{ color: '#2ecc71', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>29%</span>
        <div style={{ flex: 1, height: 3, background: '#e74c3c', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: '29%', height: '100%', background: '#2ecc71', borderRadius: 2 }} />
        </div>
        <span style={{ color: '#e74c3c', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>71%</span>
      </div>

      {/* ── Trade panel ─────────────────────────────────────── */}
      <div className="ts-panel">

        {/* Row 1 — Time + Amount */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <div style={fieldBox}>
            <span style={lbl}>Time</span>
            <span style={val}>01:00</span>
          </div>
          <div style={fieldBox}>
            <span style={lbl}>Amount</span>
            <span style={val}>
              {settings ? `$${parseFloat(settings.startAmount || 1).toFixed(2)}` : '—'}
            </span>
          </div>
        </div>

        {/* Row 2 — Payout info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <span style={lbl}>Payout</span>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>$1.92</span>
          </div>
          <span style={{ color: '#2ecc71', fontSize: 18, fontWeight: 800 }}>+92%</span>
          <div style={{ textAlign: 'right' }}>
            <span style={lbl}>Profit</span>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>+$0.92</span>
          </div>
        </div>

        {/* Row 3 — Action buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {botState === 'idle' ? (
            <>
              <button
                onClick={() => showToast('Use the bot controls above to trade automatically, or tap the buttons inside the chart')}
                style={{ flex: 1, background: '#2ecc71', borderRadius: 10, height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
              >
                <UpArrow />
              </button>
              <button
                onClick={() => showToast('AI trading coming soon for Lifetime members')}
                style={{ flex: 2, background: '#1a7cfa', borderRadius: 10, height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 11, letterSpacing: '0.5px' }}>AI TRADING</span>
              </button>
              <button
                onClick={() => showToast('Use the bot controls above to trade automatically, or tap the buttons inside the chart')}
                style={{ flex: 1, background: '#e74c3c', borderRadius: 10, height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
              >
                <DownArrow />
              </button>
            </>
          ) : (
            <>
              <button disabled style={{ flex: 1, background: '#152338', border: '0.5px solid #2a4060', borderRadius: 10, height: 40, cursor: 'default', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#4a6080', fontSize: 11 }}>CALL</span>
              </button>
              <button
                onClick={() => onNavigate('settings')}
                style={{ flex: 2, background: '#1a0535', border: '1.5px solid #7c3aed', borderRadius: 10, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', animation: 'pulse 1.2s infinite', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: '#a78bfa', fontWeight: 800, fontSize: 11 }}>BOT AUTO</span>
              </button>
              <button disabled style={{ flex: 1, background: '#152338', border: '0.5px solid #2a4060', borderRadius: 10, height: 40, cursor: 'default', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#4a6080', fontSize: 11 }}>PUT</span>
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
