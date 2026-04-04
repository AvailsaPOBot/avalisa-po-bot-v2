import { useState, useEffect } from 'react'
import api from './api'
import './PwaApp.css'

import TradingScreen  from './screens/TradingScreen'
import HistoryScreen  from './screens/HistoryScreen'
import AccountScreen  from './screens/AccountScreen'
import SettingsScreen from './screens/SettingsScreen'
import ChatScreen     from './screens/ChatScreen'
import PwaLogin       from './screens/PwaLogin'
import PwaRegister    from './screens/PwaRegister'

/* ── Inline SVG icons ─────────────────────────────────────── */
const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3"    y="12" width="5" height="9" rx="1"/>
    <rect x="9.5"  y="7"  width="5" height="14" rx="1"/>
    <rect x="16"   y="3"  width="5" height="18" rx="1"/>
  </svg>
)

const HistoryIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="5"     width="18" height="2.5" rx="1.25"/>
    <rect x="3" y="10.75" width="14" height="2.5" rx="1.25"/>
    <rect x="3" y="16.5"  width="10" height="2.5" rx="1.25"/>
  </svg>
)

const AccountIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7H4z"/>
  </svg>
)

const SettingsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
)

/* ── Nav items config ─────────────────────────────────────── */
const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: HomeIcon    },
  { id: 'history',  label: 'History',  Icon: HistoryIcon },
  { id: 'account',  label: 'Account',  Icon: AccountIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon},
]

/* ── iOS detection ────────────────────────────────────────── */
const isIOS             = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInStandaloneMode = window.navigator.standalone === true

/* ══════════════════════════════════════════════════════════ */
export default function PwaApp() {
  const [authState,  setAuthState]  = useState('checking')
  const [activePage, setActivePage] = useState('home')

  // Install prompt
  const [installPrompt,     setInstallPrompt]     = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)

  /* ── Auth check on mount ────────────────────────────────── */
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/app/register') { setAuthState('register'); return }
    if (path === '/app/login')    { setAuthState('login');    return }
    const token = localStorage.getItem('pwa_token')
    if (!token) { setAuthState('login'); return }
    api.get('/api/auth/me')
      .then(() => setAuthState('authenticated'))
      .catch(() => {
        localStorage.removeItem('pwa_token')
        setAuthState('login')
      })
  }, [])

  /* ── PWA install prompt (Android / Chrome) ──────────────── */
  useEffect(() => {
    if (localStorage.getItem('avalisa_pwa_dismissed')) return
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setShowInstallBanner(false)
  }

  const handleDismissInstall = () => {
    setShowInstallBanner(false)
    localStorage.setItem('avalisa_pwa_dismissed', 'true')
  }

  const showIOSBanner = isIOS && !isInStandaloneMode && !localStorage.getItem('avalisa_pwa_dismissed')

  /* ── Auth handlers ──────────────────────────────────────── */
  function handleLoginSuccess() {
    setAuthState('authenticated')
    setActivePage('home')
    window.history.replaceState(null, '', '/app')
  }

  function handleNavigate(page) {
    if (page === 'register') {
      setAuthState('register')
      window.history.replaceState(null, '', '/app/register')
    } else {
      setAuthState('login')
      window.history.replaceState(null, '', '/app/login')
    }
  }

  function handleLogout() {
    localStorage.removeItem('pwa_token')
    localStorage.removeItem('pwa_user')
    setAuthState('login')
    window.history.replaceState(null, '', '/app/login')
  }

  /* ── Checking ─────────────────────────────────────────── */
  if (authState === 'checking') {
    return (
      <div className="pwa-root">
        <div className="pwa-loading">Loading…</div>
      </div>
    )
  }

  /* ── Login / Register ─────────────────────────────────── */
  if (authState === 'login') {
    return <PwaLogin onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />
  }
  if (authState === 'register') {
    return <PwaRegister onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />
  }

  /* ── Authenticated shell ──────────────────────────────── */
  const isChat = activePage === 'chat'

  return (
    <div className="pwa-root">

      {/* Desktop top nav — hidden on chat */}
      {!isChat && (
        <nav className="pwa-topnav">
          <div className="pwa-topnav-logo">
            <span>AVALISA</span>
            <em> BOT</em>
          </div>
          <div className="pwa-topnav-links">
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                className={`pwa-topnav-link${activePage === id ? ' active' : ''}`}
                onClick={() => setActivePage(id)}
              >
                {label}
              </button>
            ))}
            <button
              className="pwa-topnav-link"
              onClick={handleLogout}
              style={{ marginLeft: 8 }}
            >
              Logout
            </button>
          </div>
        </nav>
      )}

      {/* Content area */}
      <div className="pwa-layout">

        {/* Tablet sidebar — hidden on chat */}
        {!isChat && (
          <nav className="pwa-sidebar">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`pwa-sidebar-item${activePage === id ? ' active' : ''}`}
                onClick={() => setActivePage(id)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}

        <main className="pwa-content" style={(activePage === 'home' || isChat) ? { padding: 0 } : {}}>
          {activePage === 'home'     && <TradingScreen onNavigate={setActivePage} />}
          {activePage === 'history'  && <HistoryScreen />}
          {activePage === 'account'  && (
            <AccountScreen
              onLogout={() => { setAuthState('login'); setActivePage('home') }}
              onNavigate={setActivePage}
            />
          )}
          {activePage === 'settings' && <SettingsScreen />}
          {activePage === 'chat'     && <ChatScreen onBack={() => setActivePage('account')} />}
        </main>
      </div>

      {/* Install banner — above bottom nav, hidden on chat */}
      {!isChat && (showInstallBanner || showIOSBanner) && (
        <div style={{
          background: '#080f1c',
          borderTop: '0.5px solid #1a2a40',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ color: '#8fa8c8', fontSize: 12, flex: 1 }}>
            {isIOS
              ? 'Tap Share then "Add to Home Screen" for the best experience'
              : 'Install Avalisa Bot as an app on your device'
            }
          </span>
          {!isIOS && (
            <button onClick={handleInstall} style={{
              background: '#1a7cfa', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', fontSize: 12,
              fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              Install
            </button>
          )}
          <button onClick={handleDismissInstall} style={{
            background: 'transparent', border: 'none', color: '#4a6080',
            fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}>
            ×
          </button>
        </div>
      )}

      {/* Mobile bottom nav — hidden on chat */}
      {!isChat && (
        <nav className="pwa-bottomnav">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`pwa-bottomnav-item${activePage === id ? ' active' : ''}`}
              onClick={() => setActivePage(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

    </div>
  )
}
