import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const STRATEGIES = [
  { id: 'martingale', label: 'Martingale', free: true, desc: 'Double on loss to recover' },
  { id: 'anti-martingale', label: 'Anti-Martingale', free: false, desc: 'Double on win, reset on loss' },
  { id: 'fixed', label: 'Fixed Amount', free: false, desc: 'Same amount every trade' },
  { id: 'ai-signal', label: 'AI Signal', free: false, desc: 'AI-guided entry points', comingSoon: true },
];

const TIMEFRAMES = ['M1', 'M3', 'M5', 'M30', 'H1', 'H4'];
const DIRECTIONS = [{ id: 'alternating', label: 'Alternating' }, { id: 'call', label: 'Always Call' }, { id: 'put', label: 'Always Put' }];
const DELAYS = [4, 6, 8, 10, 12];
const MULTIPLIERS = [1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0];
const STEPS = ['infinite', 1, 2, 3, 4, 5, 6, 8, 10, 12];

export default function Dashboard() {
  const { user } = useAuth();
  const plan = user?.license?.plan || 'free';

  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');

  const loadData = useCallback(async () => {
    const [settingsRes, historyRes] = await Promise.allSettled([
      api.get('/api/settings'),
      api.get('/api/trades/history?limit=20'),
    ]);
    if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data);
    if (historyRes.status === 'fulfilled') {
      setHistory(historyRes.value.data.trades || []);
      setStats(historyRes.value.data.stats);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

  if (!settings) {
    return <div className="flex items-center justify-center min-h-screen text-brand-400">Loading dashboard...</div>;
  }

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
        {['settings', 'history'].map(tab => (
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

      {activeTab === 'history' && (
        <div className="card overflow-x-auto">
          <h2 className="text-lg font-semibold text-white mb-4">Trade History</h2>
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
    </div>
  );
}
