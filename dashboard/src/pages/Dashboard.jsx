import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const STRATEGIES = [
  { id: 'martingale', label: 'Martingale', free: true, desc: 'Double on loss to recover' },
  { id: 'anti-martingale', label: 'Anti-Martingale', free: false, desc: 'Double on win, reset on loss' },
  { id: 'fixed', label: 'Fixed Amount', free: false, desc: 'Same amount every trade' },
  { id: 'ai-signal', label: 'AI Signal', free: false, desc: 'Gemini-powered CALL/PUT signals (Lifetime)' },
];

const TIMEFRAMES = ['M1', 'M3', 'M5', 'M30', 'H1', 'H4'];
const DIRECTIONS = [{ id: 'alternating', label: 'Alternating' }, { id: 'call', label: 'Always Call' }, { id: 'put', label: 'Always Put' }];
const DELAYS = [4, 6, 8, 10, 12];
const MULTIPLIERS = [1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0];
const STEPS = ['infinite', 1, 2, 3, 4, 5, 6, 8, 10, 12];

export default function Dashboard() {
  const { user } = useAuth();
  const plan = user?.license?.plan || 'free';
  const isAdmin = user?.isAdmin || false;

  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [historyType, setHistoryType] = useState('real');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');

  // Admin state
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPlan, setAdminPlan] = useState('lifetime');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminResult, setAdminResult] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);

  // Claim state (settings tab)
  const [claimPoUid, setClaimPoUid] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [claimStatus, setClaimStatus] = useState(null); // null | 'pending' | 'approved' | 'rejected'
  const [, setClaimNote] = useState(null);

  // Admin claims state
  const [pendingClaims, setPendingClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);

  // Edit user modal state
  const [editingUser, setEditingUser] = useState(null); // { id, email, poUserId, plan }
  const [editPoUid, setEditPoUid] = useState('');
  const [editPlan, setEditPlan] = useState('free');
  const [editSaving, setEditSaving] = useState(false);

  // User trade history modal state
  const [tradeHistoryUser, setTradeHistoryUser] = useState(null); // { id, email }
  const [userTrades, setUserTrades] = useState([]);
  const [userTradesLoading, setUserTradesLoading] = useState(false);

  // AI settings state
  const AI_TF = ['S30', 'M1', 'M3', 'M5', 'M30', 'H1'];
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTokenBudget, setAiTokenBudget] = useState('10000');
  const [aiWinRates, setAiWinRates] = useState({});
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(null);
  const [tokenResetting, setTokenResetting] = useState(false);

  const loadAdminUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/api/admin/users');
      setAdminUsers(res.data.users || []);
    } catch (err) {
      console.error('Failed to load admin users:', err);
    }
  }, [isAdmin]);

  const loadPendingClaims = useCallback(async () => {
    if (!isAdmin) return;
    setClaimsLoading(true);
    try {
      const res = await api.get('/api/admin/claims');
      setPendingClaims(res.data || []);
    } catch (err) {
      console.error('Failed to load claims:', err);
    } finally {
      setClaimsLoading(false);
    }
  }, [isAdmin]);

  const loadClaimStatus = useCallback(async () => {
    if (plan !== 'free') return;
    try {
      const res = await api.get('/api/license/claim/status');
      setClaimStatus(res.data.claimStatus || 'none');
      setClaimNote(res.data.claimNote || null);
    } catch (err) {
      // silent
    }
  }, [plan]);

  const loadAiSettings = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/api/admin/ai-settings');
      setAiPrompt(res.data.ai_strategy_prompt || '');
      setAiTokenBudget(res.data.ai_token_budget_per_user || '10000');
      const wr = res.data.timeframe_winrates ? JSON.parse(res.data.timeframe_winrates) : {};
      setAiWinRates(wr);
    } catch (err) { /* silent */ }
  }, [isAdmin]);

  const loadTokenUsage = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/api/admin/token-usage');
      setTokenUsage(res.data);
    } catch (err) { /* silent */ }
  }, [isAdmin]);

  async function loadUserTrades(u) {
    setTradeHistoryUser(u);
    setUserTrades([]);
    setUserTradesLoading(true);
    try {
      const res = await api.get(`/api/admin/users/${u.id}/trades`);
      setUserTrades(res.data.trades || []);
    } catch (err) {
      toast.error('Failed to load trades');
    } finally {
      setUserTradesLoading(false);
    }
  }

  async function saveAiSettings() {
    setAiSettingsSaving(true);
    try {
      await api.put('/api/admin/ai-settings', {
        ai_strategy_prompt: aiPrompt,
        ai_token_budget_per_user: aiTokenBudget,
        timeframe_winrates: JSON.stringify(aiWinRates),
      });
      toast.success('AI settings saved.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setAiSettingsSaving(false);
    }
  }

  function updateWinRate(tf, field, value) {
    setAiWinRates(prev => ({
      ...prev,
      [tf]: { ...(prev[tf] || { manual: 50, real: null, mode: 'manual' }), [field]: value },
    }));
  }

  async function resetTokens() {
    if (!window.confirm('Reset ALL users token usage for this month?')) return;
    setTokenResetting(true);
    try {
      const res = await api.post('/api/admin/token-reset');
      toast.success(`Reset complete — ${res.data.recordsDeleted} records deleted.`);
      loadTokenUsage();
    } catch (err) {
      toast.error('Failed to reset tokens');
    } finally {
      setTokenResetting(false);
    }
  }

  async function grantAccess() {
    if (!adminIdentifier.trim()) return;
    setAdminLoading(true);
    setAdminResult(null);
    try {
      const res = await api.post('/api/admin/grant-access', {
        identifier: adminIdentifier.trim(),
        plan: adminPlan,
      });
      setAdminResult({ success: true, message: res.data.message });
      setAdminIdentifier('');
      loadAdminUsers();
    } catch (err) {
      setAdminResult({
        success: false,
        message: err.response?.data?.error || 'Failed to grant access',
      });
    } finally {
      setAdminLoading(false);
    }
  }

  async function submitClaim() {
    if (!claimPoUid.trim()) return;
    setClaimLoading(true);
    setClaimResult(null);
    try {
      const res = await api.post('/api/license/claim', { poUid: claimPoUid.trim() });
      setClaimResult({ success: true, message: res.data.message });
      setClaimStatus('pending');
    } catch (err) {
      setClaimResult({ success: false, message: err.response?.data?.error || 'Failed to submit claim' });
    } finally {
      setClaimLoading(false);
    }
  }

  async function approveClaim(userId) {
    try {
      await api.post('/api/admin/claims/approve', { userId });
      toast.success('Claim approved. User now has lifetime access.');
      loadPendingClaims();
      loadAdminUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  }

  async function rejectClaim(userId) {
    try {
      await api.post('/api/admin/claims/reject', { userId, reason: 'not_found' });
      toast.success('Claim rejected.');
      setRejectingId(null);
      loadPendingClaims();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reject');
    }
  }

  function openEditModal(u) {
    setEditingUser(u);
    setEditPoUid(u.poUserId || '');
    setEditPlan(u.license?.plan || 'free');
  }

  async function saveUser() {
    if (!editingUser) return;
    setEditSaving(true);
    try {
      await api.patch(`/api/admin/users/${editingUser.id}`, {
        poUserId: editPoUid,
        plan: editPlan,
      });
      toast.success('User updated.');
      setEditingUser(null);
      loadAdminUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteUser() {
    if (!editingUser) return;
    if (!window.confirm('Delete this user and all their data? This cannot be undone.')) return;
    try {
      await api.delete(`/api/admin/users/${editingUser.id}`);
      toast.success('User deleted.');
      setEditingUser(null);
      loadAdminUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  }

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/api/settings');
      setSettings(res.data);
    } catch (err) { /* silent */ }
  }, []);

  // Stats always use real trades only
  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/api/trades/history?type=real&limit=500');
      setStats(res.data.stats);
    } catch (err) { /* silent */ }
  }, []);

  const loadHistory = useCallback(async (type) => {
    try {
      const res = await api.get(`/api/trades/history?type=${type}&limit=50`);
      setHistory(res.data.trades || []);
    } catch (err) { /* silent */ }
  }, []);

  useEffect(() => { loadSettings(); loadStats(); }, [loadSettings, loadStats]);
  useEffect(() => { loadHistory(historyType); }, [loadHistory, historyType]);
  useEffect(() => { loadAdminUsers(); }, [loadAdminUsers]);
  useEffect(() => { loadPendingClaims(); }, [loadPendingClaims]);
  useEffect(() => { loadClaimStatus(); }, [loadClaimStatus]);
  useEffect(() => { loadAiSettings(); loadTokenUsage(); }, [loadAiSettings, loadTokenUsage]);


  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await api.put('/api/settings', settings);
      setSettings(res.data);
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(key, value) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  if (!settings) return <div className="flex items-center justify-center min-h-screen text-brand-400">Loading dashboard...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge-${plan}`}>{plan} plan</span>
          {plan !== 'lifetime' && (
            <Link to="/pricing" className="btn-primary text-sm py-1.5 px-4">Upgrade</Link>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Trades', value: (stats.wins || 0) + (stats.losses || 0) },
            { label: 'Win Rate', value: `${stats.winRate || 0}%` },
            { label: 'Wins', value: stats.wins || 0 },
            { label: 'Total P&L', value: `$${stats.totalProfit || '0.00'}`, color: parseFloat(stats.totalProfit) >= 0 ? 'text-green-400' : 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <div className={`text-2xl font-bold ${s.color || 'text-white'}`}>{s.value}</div>
              <div className="text-gray-400 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-dark-800 border border-dark-600 rounded-lg p-1 w-fit">
        {['settings', 'history', ...(isAdmin ? ['admin'] : [])].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Strategy picker */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Strategy</h2>
            <div className="space-y-3">
              {STRATEGIES.map(s => {
                const locked = !s.free && plan === 'free';
                const selected = settings.strategy === s.id;
                return (
                  <button key={s.id} disabled={locked || s.comingSoon}
                    onClick={() => !locked && !s.comingSoon && updateSetting('strategy', s.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selected ? 'border-brand-600 bg-brand-900/30 text-white' :
                      locked ? 'border-dark-600 text-gray-500 cursor-not-allowed' :
                      'border-dark-600 text-gray-300 hover:border-brand-600'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.label}</span>
                      {s.comingSoon && <span className="text-xs bg-yellow-800 text-yellow-300 px-2 py-0.5 rounded-full">Soon</span>}
                      {locked && <span className="text-xs badge-basic">Paid</span>}
                      {selected && <span className="text-green-400 text-xs">✓ Active</span>}
                    </div>
                    <div className="text-xs mt-1 opacity-60">{s.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings panel */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Parameters</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400">Timeframe</label>
                <select className="select text-sm" value={settings.timeframe} onChange={e => updateSetting('timeframe', e.target.value)}>
                  {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400">Direction</label>
                <select className="select text-sm" value={settings.direction} onChange={e => updateSetting('direction', e.target.value)}>
                  {DIRECTIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400">Delay Between Trades</label>
                <select className="select text-sm" value={settings.delaySeconds} onChange={e => updateSetting('delaySeconds', parseInt(e.target.value))}>
                  {DELAYS.map(d => <option key={d} value={d}>{d}s</option>)}
                </select>
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400">Starting Amount ($)</label>
                <input type="number" min="0.01" step="0.01" className="select text-sm w-28"
                  value={settings.startAmount}
                  onChange={e => updateSetting('startAmount', parseFloat(e.target.value) || 1)} />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400">Martingale Multiplier</label>
                <select className="select text-sm" value={settings.martingaleMultiplier} onChange={e => updateSetting('martingaleMultiplier', parseFloat(e.target.value))}>
                  {MULTIPLIERS.map(m => <option key={m} value={m}>{m}×</option>)}
                </select>
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400">Martingale Steps</label>
                <select className="select text-sm" value={settings.martingaleSteps} onChange={e => updateSetting('martingaleSteps', e.target.value)}>
                  {STEPS.map(s => <option key={s} value={s}>{s === 'infinite' ? 'Infinite' : s}</option>)}
                </select>
              </div>

              <button onClick={saveSettings} disabled={saving} className="btn-primary w-full mt-4 py-2.5">
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Signal config — always shown in settings tab; admin can edit, users see grayed-out */}
      {activeTab === 'settings' && (
        <div className="card mt-6">
          <h2 className="text-lg font-semibold text-white mb-1">🤖 AI Signal Configuration</h2>
          <p className="text-gray-400 text-sm mb-4">
            {isAdmin
              ? 'Set the strategy prompt sent to Gemini before every trade signal.'
              : 'Avalisa uses Gemini to analyze live candle data and generate CALL/PUT/SKIP signals on your selected timeframe.'}
          </p>
          <div className="space-y-3">
            <textarea
              rows={6}
              value={aiPrompt}
              onChange={e => isAdmin && setAiPrompt(e.target.value)}
              readOnly={!isAdmin}
              className={`input w-full font-mono text-xs ${!isAdmin ? 'opacity-40 cursor-not-allowed resize-none' : ''}`}
              placeholder="System prompt sent to Gemini for every signal request..."
            />
            {isAdmin ? (
              <button
                onClick={saveAiSettings}
                disabled={aiSettingsSaving}
                className="btn-primary"
              >
                {aiSettingsSaving ? 'Saving…' : 'Save Prompt'}
              </button>
            ) : (
              <p className="text-xs text-gray-500">
                🔒 Custom strategy prompts available in v2.3 — bring your own AI key.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Claim Free Access Card — settings tab, free plan users without linked UID only */}
      {activeTab === 'settings' && plan === 'free' && !user?.poUserId && claimStatus !== 'approved' && (
        <div className="card mt-6">
          <h2 className="text-lg font-semibold text-white mb-1">Link Your Pocket Option Account</h2>
          <p className="text-gray-400 text-sm mb-4">
            Registered via our affiliate link? Submit your PO UID to claim free lifetime access.
          </p>

          {claimStatus === 'pending' ? (
            <div className="text-sm px-3 py-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50 text-yellow-300">
              ⏳ Your claim is under review. We'll notify you here within 24 hours.
            </div>
          ) : claimStatus === 'rejected' ? (
            <div className="space-y-3">
              <div className="text-sm px-3 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-400">
                ❌ Your UID was not found in our system. Please make sure you registered your Pocket Option account under our affiliate link, then resubmit your UID below.
              </div>
              <div className="flex gap-3">
                <a href="https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50"
                  target="_blank" rel="noreferrer" className="btn-primary text-sm py-2 px-4">
                  Affiliate Link
                </a>
                <Link to="/pricing" className="btn-outline text-sm py-2 px-4">View Pricing</Link>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Your Pocket Option UID</label>
                <input
                  type="number"
                  className="input w-full text-sm"
                  placeholder="e.g. 128532137"
                  value={claimPoUid}
                  onChange={e => setClaimPoUid(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitClaim()}
                />
              </div>
              <button
                onClick={submitClaim}
                disabled={claimLoading || !claimPoUid.trim()}
                className="btn-primary w-full py-2.5"
              >
                {claimLoading ? 'Submitting...' : 'Submit Claim'}
              </button>
              {claimResult && (
                <div className={`text-sm px-3 py-2 rounded-lg ${
                  claimResult.success
                    ? 'bg-green-900/30 border border-green-700/50 text-green-400'
                    : 'bg-red-900/30 border border-red-700/50 text-red-400'
                }`}>
                  {claimResult.message}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Your Pocket Option UID</label>
                <input
                  type="number"
                  className="input w-full text-sm"
                  placeholder="e.g. 128532137"
                  value={claimPoUid}
                  onChange={e => setClaimPoUid(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitClaim()}
                />
              </div>
              <button
                onClick={submitClaim}
                disabled={claimLoading || !claimPoUid.trim()}
                className="btn-primary w-full py-2.5"
              >
                {claimLoading ? 'Submitting...' : 'Submit Claim'}
              </button>
              {claimResult && (
                <div className={`text-sm px-3 py-2 rounded-lg ${
                  claimResult.success
                    ? 'bg-green-900/30 border border-green-700/50 text-green-400'
                    : 'bg-red-900/30 border border-red-700/50 text-red-400'
                }`}>
                  {claimResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Trade History</h2>
            <div className="flex gap-1 bg-dark-900 border border-dark-600 rounded-lg p-1">
              {['real', 'demo', 'all'].map(t => (
                <button key={t} onClick={() => setHistoryType(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${historyType === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {history.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No trades yet. Start the bot on Pocket Option.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-600 text-left">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Pair</th>
                  <th className="py-2 pr-4">Direction</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Result</th>
                  <th className="py-2">Balance After</th>
                </tr>
              </thead>
              <tbody>
                {history.map(t => (
                  <tr key={t.id} className="border-b border-dark-600/50 text-gray-300">
                    <td className="py-2 pr-4 text-xs text-gray-500">{new Date(t.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4">{t.pair}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-semibold ${t.direction === 'call' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4">${t.amount.toFixed(2)}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-semibold ${t.result === 'win' ? 'text-green-400' : t.result === 'loss' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {t.result.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2">{t.balanceAfter != null ? `$${t.balanceAfter.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'admin' && isAdmin && (
        <div className="space-y-6">
          {/* Pending Claims */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Pending Claims</h2>
            {claimsLoading ? (
              <p className="text-gray-400 text-sm">Loading...</p>
            ) : pendingClaims.length === 0 ? (
              <p className="text-gray-400 text-sm">No pending claims. ✅</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-dark-600 text-left">
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">PO UID</th>
                      <th className="py-2 pr-4">Submitted</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingClaims.map(c => (
                      <tr key={c.userId} className="border-b border-dark-600/50 text-gray-300">
                        <td className="py-3 pr-4 text-xs">{c.email}</td>
                        <td className="py-3 pr-4 text-xs font-mono">{c.claimedPoUid}</td>
                        <td className="py-3 pr-4 text-xs text-gray-500">
                          {new Date(c.submittedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          {rejectingId === c.userId ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => rejectClaim(c.userId)}
                                className="text-xs px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-md">
                                Confirm Reject
                              </button>
                              <button onClick={() => setRejectingId(null)}
                                className="text-xs px-2 py-1 text-gray-400 hover:text-white">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => approveClaim(c.userId)}
                                className="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-md">
                                ✅ Approve
                              </button>
                              <button onClick={() => setRejectingId(c.userId)}
                                className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded-md">
                                ❌ Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Grant Access Card */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-1">Grant Bot Access</h2>
            <p className="text-gray-400 text-sm mb-4">
              Enter the user's email address or Pocket Option UID to grant them access.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Email or PO UID</label>
                <input
                  type="text"
                  className="input w-full text-sm"
                  placeholder="user@email.com or 128532137"
                  value={adminIdentifier}
                  onChange={e => setAdminIdentifier(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && grantAccess()}
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Plan</label>
                <select
                  className="select text-sm w-full"
                  value={adminPlan}
                  onChange={e => setAdminPlan(e.target.value)}
                >
                  <option value="lifetime">Lifetime (Unlimited)</option>
                  <option value="basic">Basic (100 trades)</option>
                </select>
              </div>
              <button
                onClick={grantAccess}
                disabled={adminLoading || !adminIdentifier.trim()}
                className="btn-primary w-full py-2.5"
              >
                {adminLoading ? 'Granting...' : '✓ Grant Access'}
              </button>
              {adminResult && (
                <div className={`text-sm px-3 py-2 rounded-lg ${
                  adminResult.success
                    ? 'bg-green-900/30 border border-green-700/50 text-green-400'
                    : 'bg-red-900/30 border border-red-700/50 text-red-400'
                }`}>
                  {adminResult.message}
                </div>
              )}
            </div>
          </div>

          {/* Users List */}
          <div className="card overflow-x-auto">
            <h2 className="text-lg font-semibold text-white mb-4">
              Recent Users ({adminUsers.length})
            </h2>
            {adminUsers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No users yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-dark-600 text-left">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Plan</th>
                    <th className="py-2 pr-4">Balance</th>
                    <th className="py-2 pr-4">Win Rate</th>
                    <th className="py-2 pr-4">Martingale</th>
                    <th className="py-2 pr-4">AI Signal</th>
                    <th className="py-2 pr-4">Joined</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map(u => (
                    <tr key={u.id} className="border-b border-dark-600/50 text-gray-300">
                      <td className="py-2 pr-4 text-xs">{u.email}</td>
                      <td className="py-2 pr-4">
                        <span className={`badge-${u.license?.plan || 'free'}`}>
                          {u.license?.plan || 'free'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {u.latestBalance != null ? `$${parseFloat(u.latestBalance).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {u.winRate != null ? `${u.winRate}%` : '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-400">
                        {u.winRateByMode?.martingaleTotal > 0
                          ? `${u.winRateByMode.martingale}% (${u.winRateByMode.martingaleTotal})`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-purple-400">
                        {u.winRateByMode?.aiSignalTotal > 0
                          ? `${u.winRateByMode.aiSignal}% (${u.winRateByMode.aiSignalTotal})`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-2">
                        <button
                          onClick={() => loadUserTrades(u)}
                          className="text-xs text-green-400 hover:text-green-300"
                        >
                          Trades
                        </button>
                        <button
                          onClick={() => openEditModal(u)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Edit
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* AI Settings */}
        <div className="card mt-6">
          <h3 className="text-base font-semibold text-white mb-4">🤖 AI Settings</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Monthly Token Budget per User</label>
              <input
                type="number"
                value={aiTokenBudget}
                onChange={e => setAiTokenBudget(e.target.value)}
                className="input w-40"
                min="0"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Timeframe Win Rates</label>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-dark-600">
                    <th className="py-1 pr-4 text-left">Timeframe</th>
                    <th className="py-1 pr-4 text-left">Manual %</th>
                    <th className="py-1 pr-4 text-left">Mode</th>
                    <th className="py-1 text-left">Real % (auto)</th>
                  </tr>
                </thead>
                <tbody>
                  {AI_TF.map(tf => {
                    const entry = aiWinRates[tf] || { manual: 50, real: null, mode: 'manual' };
                    return (
                      <tr key={tf} className="border-b border-dark-600/50 text-gray-300">
                        <td className="py-1.5 pr-4 font-mono text-xs">{tf}</td>
                        <td className="py-1.5 pr-4">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={entry.manual ?? 50}
                            onChange={e => updateWinRate(tf, 'manual', parseInt(e.target.value))}
                            className="input w-20 py-0.5 text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-4">
                          <select
                            value={entry.mode || 'manual'}
                            onChange={e => updateWinRate(tf, 'mode', e.target.value)}
                            className="input py-0.5 text-xs"
                          >
                            <option value="manual">Manual</option>
                            <option value="real">Real</option>
                          </select>
                        </td>
                        <td className="py-1.5 text-xs text-gray-500">
                          {entry.real !== null && entry.real !== undefined ? `${entry.real}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={saveAiSettings}
              disabled={aiSettingsSaving}
              className="btn-primary"
            >
              {aiSettingsSaving ? 'Saving…' : 'Save AI Settings'}
            </button>
          </div>
        </div>

        {/* Token Usage */}
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">
              📊 Token Usage — {tokenUsage?.month || '…'}
            </h3>
            <button
              onClick={resetTokens}
              disabled={tokenResetting}
              className="text-xs text-red-400 border border-red-800 rounded px-3 py-1 hover:bg-red-900/30 transition"
            >
              {tokenResetting ? 'Resetting…' : 'Reset All Tokens'}
            </button>
          </div>
          {tokenUsage && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-dark-600">
                  <th className="py-1 pr-4 text-left">Email</th>
                  <th className="py-1 pr-4 text-left">Tokens Used</th>
                  <th className="py-1 text-left">% of Budget</th>
                </tr>
              </thead>
              <tbody>
                {(tokenUsage.users || []).map((u, i) => (
                  <tr key={i} className="border-b border-dark-600/50 text-gray-300">
                    <td className="py-1.5 pr-4 text-xs">{u.email}</td>
                    <td className="py-1.5 pr-4 text-xs">{u.tokensUsed.toLocaleString()}</td>
                    <td className="py-1.5 text-xs">
                      <span className={u.percentOfBudget >= 80 ? 'text-red-400' : 'text-gray-300'}>
                        {u.percentOfBudget}%
                      </span>
                    </td>
                  </tr>
                ))}
                {(tokenUsage.users || []).length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-center text-gray-500 text-xs">No usage this month</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        </div>
      )}
      {/* User Trade History Modal */}
      {tradeHistoryUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-3xl mx-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-5 border-b border-dark-600">
              <div>
                <h3 className="text-base font-semibold text-white">Trade History</h3>
                <p className="text-xs text-gray-400 mt-0.5">{tradeHistoryUser.email} — last 50 real trades</p>
              </div>
              <button onClick={() => setTradeHistoryUser(null)} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="overflow-auto flex-1">
              {userTradesLoading ? (
                <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
              ) : userTrades.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No real trades yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-dark-800">
                    <tr className="text-gray-400 border-b border-dark-600">
                      <th className="py-2 px-4 text-left">Time</th>
                      <th className="py-2 px-4 text-left">Pair</th>
                      <th className="py-2 px-4 text-left">Dir</th>
                      <th className="py-2 px-4 text-left">Amount</th>
                      <th className="py-2 px-4 text-left">Result</th>
                      <th className="py-2 px-4 text-left">Balance</th>
                      <th className="py-2 px-4 text-left">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTrades.map(t => (
                      <tr key={t.id} className="border-b border-dark-600/40 text-gray-300">
                        <td className="py-2 px-4 text-gray-500 whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 px-4 font-mono">{t.pair}</td>
                        <td className={`py-2 px-4 font-medium ${t.direction === 'call' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.direction.toUpperCase()}
                        </td>
                        <td className="py-2 px-4">${t.amount.toFixed(2)}</td>
                        <td className={`py-2 px-4 font-medium ${t.result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.result.toUpperCase()}
                        </td>
                        <td className="py-2 px-4 text-gray-400">
                          {t.balanceAfter != null ? `$${parseFloat(t.balanceAfter).toFixed(2)}` : '—'}
                        </td>
                        <td className={`py-2 px-4 ${t.strategy === 'ai-signal' ? 'text-purple-400' : 'text-gray-500'}`}>
                          {t.strategy === 'ai-signal' ? '🤖 AI' : 'Martingale'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Edit User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input
                  type="text"
                  value={editingUser.email}
                  readOnly
                  className="input w-full opacity-50 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">PO UID</label>
                <input
                  type="text"
                  value={editPoUid}
                  onChange={e => setEditPoUid(e.target.value)}
                  className="input w-full"
                  placeholder="PocketOption user ID"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Plan</label>
                <select
                  value={editPlan}
                  onChange={e => setEditPlan(e.target.value)}
                  className="input w-full"
                >
                  <option value="free">free</option>
                  <option value="basic">basic</option>
                  <option value="lifetime">lifetime</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={saveUser}
                disabled={editSaving}
                className="btn-primary flex-1"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
            <button
              onClick={deleteUser}
              className="mt-3 w-full py-2 rounded-lg text-sm text-red-400 border border-red-800 hover:bg-red-900/30 transition"
            >
              Delete User
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
