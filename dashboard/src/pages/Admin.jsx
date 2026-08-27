import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

const COLUMNS = [
  { key: 'email', label: 'Email' },
  { key: 'poUserId', label: 'PO UID' },
  { key: 'plan', label: 'Plan' },
  { key: 'licenseState', label: 'Licence state' },
  { key: 'tradesUsed', label: 'Trades used' },
  { key: 'createdAt', label: 'Joined' },
];

function planName(plan) {
  if (plan === 'lifetime') return 'Pro';
  if (plan === 'free') return 'Demo';
  return plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : 'No licence';
}

function licenseState(user) {
  if (!user.license) return 'No licence';
  if (user.license.tradesLimit != null && user.license.tradesUsed >= user.license.tradesLimit) return 'Trade limit reached';
  return 'Active';
}

function sortableValue(user, key) {
  if (key === 'plan') return user.license?.plan || '';
  if (key === 'licenseState') return licenseState(user);
  if (key === 'tradesUsed') return user.license?.tradesUsed || 0;
  return user[key] || '';
}

function displayError(error, fallback) {
  return error?.response?.data?.error || fallback;
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

function activityStatus(user) {
  const lastActive = user.lastActiveAt ? formatDate(user.lastActiveAt, true) : 'never recorded';
  if (user.online) {
    return { className: 'bg-green-400', label: `Online now. Last active: ${lastActive}. In-memory, since last backend restart.` };
  }
  if (user.lastActiveAt && Date.now() - new Date(user.lastActiveAt).getTime() <= 7 * 24 * 60 * 60 * 1000) {
    return { className: 'bg-amber-400', label: `Active in the last 7 days. Last active: ${lastActive}.` };
  }
  return { className: 'bg-gray-500', label: `Dormant or never active. Last active: ${lastActive}.` };
}

function UserActivityDot({ user }) {
  const status = activityStatus(user);
  return <span role="img" aria-label={status.label} title={status.label} className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} />;
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-red-800/70 bg-red-950/20 px-4 py-3 text-sm text-red-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <button type="button" onClick={onRetry} className="text-xs font-semibold text-red-200 underline hover:text-white">Try again</button>
      </div>
    </div>
  );
}

export default function Admin() {
  const [claims, setClaims] = useState([]);
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState(null);
  const [tokenUsage, setTokenUsage] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [loading, setLoading] = useState({ claims: true, users: true, activity: true, tokenUsage: true, funnel: true });
  const [errors, setErrors] = useState({});
  const [actingClaimId, setActingClaimId] = useState(null);
  const [rejectingClaimId, setRejectingClaimId] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'createdAt', direction: 'desc' });
  const [tradeUser, setTradeUser] = useState(null);
  const [trades, setTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState('');

  const loadClaims = useCallback(async () => {
    setLoading(current => ({ ...current, claims: true }));
    setErrors(current => ({ ...current, claims: '' }));
    try {
      const response = await api.get('/api/admin/claims');
      setClaims(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setErrors(current => ({ ...current, claims: displayError(error, 'Could not load pending claims.') }));
    } finally {
      setLoading(current => ({ ...current, claims: false }));
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(current => ({ ...current, users: true }));
    setErrors(current => ({ ...current, users: '' }));
    try {
      const response = await api.get('/api/admin/users');
      setUsers(response.data?.users || []);
    } catch (error) {
      setErrors(current => ({ ...current, users: displayError(error, 'Could not load users.') }));
    } finally {
      setLoading(current => ({ ...current, users: false }));
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setLoading(current => ({ ...current, activity: true }));
    setErrors(current => ({ ...current, activity: '' }));
    try {
      const response = await api.get('/api/admin/activity');
      setActivity(response.data || null);
    } catch (error) {
      setErrors(current => ({ ...current, activity: displayError(error, 'Could not load user activity.') }));
    } finally {
      setLoading(current => ({ ...current, activity: false }));
    }
  }, []);

  const loadTokenUsage = useCallback(async () => {
    setLoading(current => ({ ...current, tokenUsage: true }));
    setErrors(current => ({ ...current, tokenUsage: '' }));
    try {
      const response = await api.get('/api/admin/token-usage');
      setTokenUsage(response.data || { users: [] });
    } catch (error) {
      setErrors(current => ({ ...current, tokenUsage: displayError(error, 'Could not load token usage.') }));
    } finally {
      setLoading(current => ({ ...current, tokenUsage: false }));
    }
  }, []);

  const loadFunnel = useCallback(async () => {
    setLoading(current => ({ ...current, funnel: true }));
    setErrors(current => ({ ...current, funnel: '' }));
    try {
      const response = await api.get('/api/admin/funnel');
      setFunnel(Array.isArray(response.data?.funnel) ? response.data.funnel : []);
    } catch (error) {
      setErrors(current => ({ ...current, funnel: displayError(error, 'Could not load funnel data.') }));
    } finally {
      setLoading(current => ({ ...current, funnel: false }));
    }
  }, []);

  const refreshAll = useCallback(() => {
    Promise.all([loadClaims(), loadUsers(), loadActivity(), loadTokenUsage(), loadFunnel()]);
  }, [loadActivity, loadClaims, loadFunnel, loadTokenUsage, loadUsers]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const visibleUsers = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = search
      ? users.filter(user => [user.email, user.poUserId, user.license?.plan, licenseState(user)].some(value => String(value || '').toLowerCase().includes(search)))
      : users;

    return [...filtered].sort((a, b) => {
      const left = sortableValue(a, sort.key);
      const right = sortableValue(b, sort.key);
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [query, sort, users]);

  function changeSort(key) {
    setSort(current => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  }

  function exportUsers() {
    const header = ['Email', 'PO UID', 'Plan', 'Licence state', 'Trades used', 'Trades limit', 'AI allowance', 'AI used', 'Joined'];
    const rows = visibleUsers.map(user => [
      user.email,
      user.poUserId || '',
      planName(user.license?.plan),
      licenseState(user),
      user.license?.tradesUsed ?? 0,
      user.license?.tradesLimit ?? '',
      user.license?.aiTradesAllowance ?? '',
      user.license?.aiTradesUsed ?? '',
      user.createdAt || '',
    ]);
    const csv = [header, ...rows].map(row => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'avalisa-admin-users.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function actOnClaim(userId, action) {
    setActingClaimId(userId);
    try {
      const payload = action === 'reject' ? { userId, reason: 'not_found' } : { userId };
      await api.post(`/api/admin/claims/${action}`, payload);
      toast.success(action === 'approve' ? 'Claim approved. Pro access is active.' : 'Claim rejected.');
      setRejectingClaimId(null);
      await Promise.all([loadClaims(), loadUsers()]);
    } catch (error) {
      toast.error(displayError(error, `Could not ${action} this claim.`));
    } finally {
      setActingClaimId(null);
    }
  }

  async function openTrades(user) {
    setTradeUser(user);
    setTrades([]);
    setTradesError('');
    setTradesLoading(true);
    try {
      const response = await api.get(`/api/admin/users/${user.id}/trades`);
      setTrades(response.data?.trades || []);
    } catch (error) {
      setTradesError(displayError(error, 'Could not load this user’s trades.'));
    } finally {
      setTradesLoading(false);
    }
  }

  return (
    <main className="dashboard-page mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">Board operations</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Admin Console</h1>
          <p className="mt-2 text-sm text-gray-400">Claims, users, usage, and acquisition health in one place.</p>
        </div>
        <button type="button" onClick={refreshAll} className="btn-outline inline-flex items-center gap-2 text-sm" aria-label="Refresh admin data">
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <section className="mb-6" aria-labelledby="activity-heading">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">Product activity</p>
          <h2 id="activity-heading" className="mt-1 text-xl font-semibold text-white">Real user activity</h2>
        </div>
        {loading.activity ? <p className="card py-5 text-sm text-gray-400">Loading activity...</p>
          : errors.activity ? <ErrorState message={errors.activity} onRetry={loadActivity} />
          : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              ['Online now', activity?.onlineNow, activity?.onlineNowCaveat || 'In-memory, since last backend restart; reflects this backend instance only.'],
              ['Active 24h', activity?.active24h],
              ['Active 7d', activity?.active7d],
              ['Active 30d', activity?.active30d],
              ['Dormant', activity?.dormant],
              ['Never active', activity?.neverActive],
              ['Total', activity?.totalUsers],
            ].map(([label, value, caveat]) => <div key={label} className="card px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value ?? 0}</p>{caveat && <p className="mt-2 text-xs leading-4 text-gray-500">{caveat}</p>}</div>)}
          </div>}
      </section>

      <section className="card mb-6" aria-labelledby="claims-heading">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">Money-relevant queue</p>
            <h2 id="claims-heading" className="mt-1 text-xl font-semibold text-white">Pending affiliate claims</h2>
          </div>
          {!loading.claims && !errors.claims && <span className="rounded-full border border-brand-400/30 bg-brand-900/30 px-3 py-1 text-xs font-semibold text-brand-400">{claims.length} pending</span>}
        </div>
        {loading.claims ? <p className="py-5 text-sm text-gray-400">Loading claims queue...</p>
          : errors.claims ? <ErrorState message={errors.claims} onRetry={loadClaims} />
          : claims.length === 0 ? <div className="rounded-lg border border-dark-600 bg-dark-900/60 px-4 py-7 text-center text-sm text-gray-400">No pending affiliate claims. The queue is clear.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead><tr className="border-b border-dark-600 text-left"><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Pocket Option UID</th><th className="py-2 pr-4">Submitted</th><th className="py-2 text-right">Decision</th></tr></thead>
                <tbody>{claims.map(claim => (
                  <tr key={claim.userId} className="border-b border-dark-600/50">
                    <td className="py-3 pr-4 text-xs text-gray-200">{claim.email}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-gray-300">{claim.claimedPoUid || '—'}</td>
                    <td className="py-3 pr-4 text-xs text-gray-400">{formatDate(claim.submittedAt, true)}</td>
                    <td className="py-3 text-right">
                      {rejectingClaimId === claim.userId ? (
                        <div className="flex justify-end gap-2"><button type="button" disabled={actingClaimId === claim.userId} onClick={() => actOnClaim(claim.userId, 'reject')} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60">{actingClaimId === claim.userId ? 'Rejecting...' : 'Confirm reject'}</button><button type="button" onClick={() => setRejectingClaimId(null)} className="px-2 text-xs text-gray-400 hover:text-white">Cancel</button></div>
                      ) : (
                        <div className="flex justify-end gap-2"><button type="button" disabled={actingClaimId === claim.userId} onClick={() => actOnClaim(claim.userId, 'approve')} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-60">{actingClaimId === claim.userId ? 'Saving...' : 'Approve'}</button><button type="button" disabled={actingClaimId === claim.userId} onClick={() => setRejectingClaimId(claim.userId)} className="rounded-md border border-red-800 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/50 disabled:opacity-60">Reject</button></div>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
      </section>

      <section className="card mb-6" aria-labelledby="users-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">Customer records</p><h2 id="users-heading" className="mt-1 text-xl font-semibold text-white">Users</h2></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto"><label className="relative min-w-[220px] flex-1 sm:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} /><span className="sr-only">Search users</span><input value={query} onChange={event => setQuery(event.target.value)} className="input py-2 pl-9 text-sm" placeholder="Search email, UID, plan..." /></label><button type="button" onClick={exportUsers} disabled={!visibleUsers.length} className="btn-outline inline-flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} /> Export CSV</button></div>
        </div>
        {loading.users ? <p className="py-5 text-sm text-gray-400">Loading users...</p>
          : errors.users ? <ErrorState message={errors.users} onRetry={loadUsers} />
          : users.length === 0 ? <div className="rounded-lg border border-dark-600 bg-dark-900/60 px-4 py-7 text-center text-sm text-gray-400">No users returned by the admin endpoint.</div>
          : visibleUsers.length === 0 ? <div className="rounded-lg border border-dark-600 bg-dark-900/60 px-4 py-7 text-center text-sm text-gray-400">No users match “{query}”.</div>
          : (
            <div className="overflow-x-auto"><p className="mb-3 text-xs text-gray-500">Showing {visibleUsers.length} of {users.length} loaded users</p><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-dark-600 text-left"><th className="py-2 pr-3"><span className="sr-only">Activity status</span></th>{COLUMNS.map(column => <th key={column.key} className="py-2 pr-4"><button type="button" onClick={() => changeSort(column.key)} className="inline-flex items-center gap-1 hover:text-brand-400">{column.label}{sort.key === column.key && <span aria-label={sort.direction === 'asc' ? 'sorted ascending' : 'sorted descending'}>{sort.direction === 'asc' ? '↑' : '↓'}</span>}</button></th>)}<th className="py-2 text-right">Trades</th></tr></thead><tbody>{visibleUsers.map(user => <tr key={user.id} className="border-b border-dark-600/50"><td className="py-3 pr-3"><UserActivityDot user={user} /></td><td className="py-3 pr-4 text-xs text-gray-200">{user.email}</td><td className="py-3 pr-4 font-mono text-xs text-gray-400">{user.poUserId || '—'}</td><td className="py-3 pr-4"><span className={`badge-${user.license?.plan || 'free'}`}>{planName(user.license?.plan)}</span></td><td className="py-3 pr-4 text-xs text-gray-300">{licenseState(user)}</td><td className="py-3 pr-4 text-xs text-gray-300">{user.license?.tradesUsed ?? 0}{user.license?.tradesLimit != null ? ` / ${user.license.tradesLimit}` : ''}</td><td className="py-3 pr-4 text-xs text-gray-400">{formatDate(user.createdAt)}</td><td className="py-3 text-right"><button type="button" onClick={() => openTrades(user)} className="text-xs font-semibold text-brand-400 hover:text-brand-100">View trades</button></td></tr>)}</tbody></table></div>
          )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="usage-heading"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">Current month</p><h2 id="usage-heading" className="mt-1 text-xl font-semibold text-white">Token usage</h2></div>{loading.tokenUsage ? <p className="py-4 text-sm text-gray-400">Loading token usage...</p> : errors.tokenUsage ? <ErrorState message={errors.tokenUsage} onRetry={loadTokenUsage} /> : (tokenUsage?.users || []).length === 0 ? <p className="rounded-lg border border-dark-600 bg-dark-900/60 px-4 py-6 text-center text-sm text-gray-400">No token usage this month.</p> : <div className="overflow-x-auto"><p className="mb-3 text-xs text-gray-500">{tokenUsage.month} · Budget {Number(tokenUsage.budget || 0).toLocaleString()} per user</p><table className="w-full text-sm"><thead><tr className="border-b border-dark-600 text-left"><th className="py-2 pr-3">User</th><th className="py-2 pr-3">Tokens</th><th className="py-2 text-right">Budget</th></tr></thead><tbody>{tokenUsage.users.map(user => <tr key={user.email} className="border-b border-dark-600/50"><td className="py-2.5 pr-3 text-xs text-gray-300">{user.email}</td><td className="py-2.5 pr-3 text-xs text-gray-300">{Number(user.tokensUsed || 0).toLocaleString()}</td><td className={`py-2.5 text-right text-xs ${user.percentOfBudget >= 80 ? 'text-red-300' : 'text-gray-300'}`}>{user.isAdmin ? 'Unlimited' : `${user.percentOfBudget ?? 0}%`}</td></tr>)}</tbody></table></div>}</section>
        <section className="card" aria-labelledby="funnel-heading"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">Acquisition analytics</p><h2 id="funnel-heading" className="mt-1 text-xl font-semibold text-white">Funnel</h2></div>{loading.funnel ? <p className="py-4 text-sm text-gray-400">Loading funnel data...</p> : errors.funnel ? <ErrorState message={errors.funnel} onRetry={loadFunnel} /> : funnel.length === 0 ? <p className="rounded-lg border border-dark-600 bg-dark-900/60 px-4 py-6 text-center text-sm text-gray-400">Funnel analytics are not enabled yet.</p> : <div className="space-y-3">{funnel.map((item, index) => <div key={item.type || item.event || index} className="flex items-center justify-between border-b border-dark-600/50 pb-3 text-sm"><span className="text-gray-300">{item.label || item.type || item.event || `Step ${index + 1}`}</span><strong className="text-brand-400">{item.count ?? 0}</strong></div>)}</div>}</section>
      </div>

      {tradeUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="trades-heading"><div className="flex max-h-[82vh] w-full max-w-4xl flex-col rounded-xl border border-dark-600 bg-dark-800"><div className="flex items-start justify-between border-b border-dark-600 p-5"><div><h2 id="trades-heading" className="text-lg font-semibold text-white">Trade history</h2><p className="mt-1 text-xs text-gray-400">{tradeUser.email} · last 50 real trades</p></div><button type="button" onClick={() => setTradeUser(null)} className="text-gray-400 hover:text-white" aria-label="Close trade history"><X size={20} /></button></div><div className="overflow-auto p-5">{tradesLoading ? <p className="py-6 text-center text-sm text-gray-400">Loading trades...</p> : tradesError ? <ErrorState message={tradesError} onRetry={() => openTrades(tradeUser)} /> : trades.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">No real trades for this user.</p> : <table className="w-full min-w-[700px] text-xs"><thead><tr className="border-b border-dark-600 text-left"><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Pair</th><th className="py-2 pr-3">Direction</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Result</th><th className="py-2">Balance</th></tr></thead><tbody>{trades.map(trade => <tr key={trade.id} className="border-b border-dark-600/50"><td className="py-2.5 pr-3 text-gray-400">{formatDate(trade.createdAt, true)}</td><td className="py-2.5 pr-3 font-mono text-gray-300">{trade.pair}</td><td className="py-2.5 pr-3 text-gray-300">{trade.direction}</td><td className="py-2.5 pr-3 text-gray-300">{trade.amount != null ? `$${Number(trade.amount).toFixed(2)}` : '—'}</td><td className="py-2.5 pr-3 text-gray-300">{trade.result}</td><td className="py-2.5 text-gray-300">{trade.balanceAfter != null ? `$${Number(trade.balanceAfter).toFixed(2)}` : '—'}</td></tr>)}</tbody></table>}</div></div></div>}
    </main>
  );
}
