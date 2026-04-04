import { useState, useEffect } from 'react'
import api from '../api'
import './SettingsScreen.css'

export default function SettingsScreen() {
  const [strategy,             setStrategy]             = useState('fixed')
  const [direction,            setDirection]            = useState('CALL')
  const [startAmount,          setStartAmount]          = useState('1')
  const [timeframe,            setTimeframe]            = useState('60')
  const [delaySeconds,         setDelaySeconds]         = useState('5')
  const [martingaleMultiplier, setMartingaleMultiplier] = useState('2')
  const [martingaleSteps,      setMartingaleSteps]      = useState('3')
  const [notifications,        setNotifications]        = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saved' | 'error'

  const fetchSettings = async () => {
    try {
      const res = await api.get('/api/settings')
      const s   = res.data
      setStrategy(s.strategy             || 'fixed')
      setDirection(s.direction            || 'CALL')
      setStartAmount(String(s.startAmount  ?? '1'))
      setTimeframe(String(s.timeframe      ?? '60'))
      setDelaySeconds(String(s.delaySeconds ?? '5'))
      setMartingaleMultiplier(String(s.martingaleMultiplier ?? '2'))
      setMartingaleSteps(String(s.martingaleSteps      ?? '3'))
    } catch (e) {
      console.warn('Settings fetch failed:', e.message)
    }
  }

  useEffect(() => {
    fetchSettings()
    setNotifications(localStorage.getItem('avalisa_notifications') !== 'false')
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    try {
      await api.put('/api/settings', {
        strategy,
        direction,
        startAmount:          parseFloat(startAmount),
        timeframe,
        delaySeconds:         parseInt(delaySeconds),
        martingaleMultiplier: parseFloat(martingaleMultiplier),
        martingaleSteps:      parseInt(martingaleSteps),
      })
      localStorage.setItem('avalisa_notifications', notifications.toString())
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (e) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } finally {
      setSaving(false)
    }
  }

  // Direction button active styles
  const dirStyle = (d) => {
    if (direction !== d) return {}
    if (d === 'CALL') return { background: '#2ecc71', color: '#0a1628' }
    if (d === 'PUT')  return { background: '#e74c3c', color: '#fff' }
    return { background: '#7c3aed', color: '#fff' }
  }

  const saveBtnLabel = saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error' : 'Save'
  const saveBtnClass = `ss-save-btn${saveStatus === 'saved' ? ' saved' : saveStatus === 'error' ? ' error' : ''}`

  return (
    <div className="ss-root">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="ss-header">
        <span className="ss-header-title">Bot Settings</span>
        <button className={saveBtnClass} onClick={saveSettings} disabled={saving}>
          {saveBtnLabel}
        </button>
      </div>

      {/* ── Scrollable body ───────────────────────────────── */}
      <div className="ss-body">

        {/* ── Section: Trading ────────────────────────────── */}
        <div className="ss-section">
          <p className="ss-section-title">Trading</p>

          {/* Strategy */}
          <div className="ss-row">
            <span className="ss-row-label">Strategy</span>
            <div className="ss-seg">
              <button
                className={`ss-seg-btn${strategy === 'fixed' ? ' active' : ''}`}
                style={strategy === 'fixed' ? { background: '#7c3aed', color: '#fff' } : {}}
                onClick={() => setStrategy('fixed')}
              >Fixed</button>
              <button
                className={`ss-seg-btn${strategy === 'martingale' ? ' active' : ''}`}
                style={strategy === 'martingale' ? { background: '#7c3aed', color: '#fff' } : {}}
                onClick={() => setStrategy('martingale')}
              >Martingale</button>
            </div>
          </div>

          {/* Direction */}
          <div className="ss-row">
            <span className="ss-row-label">Direction</span>
            <div className="ss-seg">
              {['CALL', 'PUT', 'AUTO'].map(d => (
                <button
                  key={d}
                  className={`ss-seg-btn${direction === d ? ' active' : ''}`}
                  style={direction === d ? dirStyle(d) : {}}
                  onClick={() => setDirection(d)}
                >{d}</button>
              ))}
            </div>
          </div>

          {/* Start Amount */}
          <div className="ss-row">
            <span className="ss-row-label">Start Amount</span>
            <div className="ss-input-row">
              <span className="ss-prefix">$</span>
              <input
                type="number"
                className="ss-input"
                value={startAmount}
                min="0.1"
                step="0.1"
                onChange={e => setStartAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Timeframe */}
          <div className="ss-row">
            <span className="ss-row-label">Timeframe</span>
            <select
              className="ss-select"
              value={timeframe}
              onChange={e => setTimeframe(e.target.value)}
            >
              <option value="5">5s</option>
              <option value="10">10s</option>
              <option value="15">15s</option>
              <option value="30">30s</option>
              <option value="60">1m</option>
              <option value="120">2m</option>
              <option value="180">3m</option>
              <option value="300">5m</option>
            </select>
          </div>

          {/* Delay */}
          <div className="ss-row">
            <span className="ss-row-label">Delay Between Trades</span>
            <div className="ss-input-row">
              <input
                type="number"
                className="ss-input"
                value={delaySeconds}
                min="1"
                step="1"
                onChange={e => setDelaySeconds(e.target.value)}
              />
              <span className="ss-suffix">sec</span>
            </div>
          </div>
        </div>

        {/* ── Section: Martingale (conditional) ─────────── */}
        {strategy === 'martingale' && (
          <div className="ss-section">
            <p className="ss-section-title">Martingale</p>

            {/* Multiplier */}
            <div className="ss-row">
              <span className="ss-row-label">Multiplier</span>
              <input
                type="number"
                className="ss-input"
                value={martingaleMultiplier}
                min="1.1"
                max="5"
                step="0.1"
                onChange={e => setMartingaleMultiplier(e.target.value)}
              />
            </div>

            {/* Max Steps */}
            <div className="ss-row">
              <span className="ss-row-label">Max Steps</span>
              <input
                type="number"
                className="ss-input"
                value={martingaleSteps}
                min="1"
                max="10"
                step="1"
                onChange={e => setMartingaleSteps(e.target.value)}
              />
            </div>

            <p className="ss-helper">
              After each loss, amount × multiplier. Resets on win or after max steps.
            </p>
          </div>
        )}

        {/* ── Section: Notifications ────────────────────── */}
        <div className="ss-section">
          <p className="ss-section-title">Notifications</p>

          <div className="ss-row">
            <span className="ss-row-label">Trade notifications</span>
            <button
              className="ss-toggle"
              style={{ background: notifications ? '#7c3aed' : '#2a4060' }}
              onClick={() => setNotifications(v => !v)}
              aria-label="Toggle notifications"
            >
              <span
                className="ss-toggle-knob"
                style={{ transform: notifications ? 'translateX(20px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
