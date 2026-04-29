'use client'
import { useState } from 'react'
import Link from 'next/link'

type Bet = { id: string; match: string; betType: string; amount: number; potentialReturn: number; status: string }
type Player = { id: string; username: string; name: string; balance: number; bets: Bet[] }
type Subadmin = { id: string; username: string; name: string; balance: number; children: Player[] }
type Stats = { totalBets: number; pendingBets: number; wonBets: number; totalSubadmins: number; totalPlayers: number }
type Session = { userId: string; username: string; role: string; name: string }

export default function AdminClient({ session, initialSubadmins, initialPlayers, stats }: {
  session: Session
  initialSubadmins: Subadmin[]
  initialPlayers: Player[]
  stats: Stats
}) {
  const [subadmins, setSubadmins] = useState(initialSubadmins)
  const [tab, setTab] = useState<'overview' | 'subadmins' | 'players'>('overview')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'SUBADMIN', balance: '0' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function createUser() {
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, balance: Number(form.balance) })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowCreateForm(false)
      setForm({ username: '', password: '', name: '', role: 'SUBADMIN', balance: '0' })
      window.location.reload()
    } catch { setError('Network error') }
    finally { setCreating(false) }
  }

  const statCards = [
    { label: 'Subadmins', value: stats.totalSubadmins, color: '#6366f1', icon: '👤' },
    { label: 'Players', value: stats.totalPlayers, color: '#22d3ee', icon: '🎮' },
    { label: 'Total Bets', value: stats.totalBets, color: '#f59e0b', icon: '📋' },
    { label: 'Pending', value: stats.pendingBets, color: '#f97316', icon: '⏳' },
    { label: 'Won', value: stats.wonBets, color: '#22c55e', icon: '✅' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p style={{ color: 'var(--muted)' }} className="text-sm mt-1">Manage your entire betting group</p>
        </div>
        <button onClick={() => setShowCreateForm(true)} className="px-5 py-2.5 rounded-xl font-medium text-white transition-opacity hover:opacity-90" style={{ background: 'var(--accent)' }}>
          + Create User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {statCards.map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['overview', 'subadmins', 'players'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all"
            style={{ background: tab === t ? 'var(--accent)' : 'var(--surface)', color: tab === t ? 'white' : 'var(--muted)', border: '1px solid var(--surface2)' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {subadmins.map(sa => {
            const totalStake = sa.children.reduce((sum, p) => sum + p.bets.filter(b => b.status === 'PENDING').reduce((s, b) => s + b.amount, 0), 0)
            const totalPotential = sa.children.reduce((sum, p) => sum + p.bets.filter(b => b.status === 'PENDING').reduce((s, b) => s + b.potentialReturn, 0), 0)
            return (
              <div key={sa.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{sa.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6366f120', color: '#6366f1' }}>@{sa.username}</span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{sa.children.length} player{sa.children.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm" style={{ color: 'var(--muted)' }}>Pending stake</div>
                    <div className="font-bold text-white">€{totalStake.toFixed(2)}</div>
                    <div className="text-xs" style={{ color: '#22c55e' }}>Potential: €{totalPotential.toFixed(2)}</div>
                  </div>
                </div>
                {sa.children.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {sa.children.map(player => {
                      const pending = player.bets.filter(b => b.status === 'PENDING')
                      const stake = pending.reduce((s, b) => s + b.amount, 0)
                      return (
                        <Link href={`/player/${player.id}`} key={player.id} className="rounded-lg p-3 transition-colors hover:opacity-80" style={{ background: 'var(--surface2)' }}>
                          <div className="font-medium text-white text-sm">{player.name}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>@{player.username}</div>
                          <div className="flex justify-between mt-2 text-xs">
                            <span style={{ color: '#f59e0b' }}>{pending.length} pending</span>
                            <span style={{ color: 'var(--muted)' }}>€{stake.toFixed(2)}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {subadmins.length === 0 && (
            <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
              <div className="text-4xl mb-3">👤</div>
              <p>No subadmins yet. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Subadmins Tab */}
      {tab === 'subadmins' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
          <table className="w-full">
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>{['Name', 'Username', 'Players', 'Pending Bets', 'Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-sm font-medium" style={{ color: 'var(--muted)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody style={{ background: 'var(--surface)' }}>
              {subadmins.map((sa, i) => {
                const pendingCount = sa.children.reduce((sum, p) => sum + p.bets.filter(b => b.status === 'PENDING').length, 0)
                return (
                  <tr key={sa.id} style={{ borderTop: i > 0 ? '1px solid var(--surface2)' : undefined }}>
                    <td className="px-5 py-4 text-white font-medium">{sa.name}</td>
                    <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>@{sa.username}</td>
                    <td className="px-5 py-4 text-white">{sa.children.length}</td>
                    <td className="px-5 py-4"><span className="text-xs px-2 py-1 rounded-full" style={{ background: '#f59e0b20', color: '#f59e0b' }}>{pendingCount} pending</span></td>
                    <td className="px-5 py-4">
                      <Link href={`/subadmin/${sa.id}`} className="text-sm hover:opacity-80" style={{ color: 'var(--accent)' }}>View →</Link>
                    </td>
                  </tr>
                )
              })}
              {subadmins.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12" style={{ color: 'var(--muted)' }}>No subadmins yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Players Tab */}
      {tab === 'players' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
          <table className="w-full">
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>{['Name', 'Username', 'Balance', 'Total Bets', 'Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-sm font-medium" style={{ color: 'var(--muted)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody style={{ background: 'var(--surface)' }}>
              {initialPlayers.map((p, i) => (
                <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--surface2)' : undefined }}>
                  <td className="px-5 py-4 text-white font-medium">{p.name}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>@{p.username}</td>
                  <td className="px-5 py-4" style={{ color: p.balance >= 0 ? '#22c55e' : '#ef4444' }}>€{p.balance.toFixed(2)}</td>
                  <td className="px-5 py-4 text-white">{p.bets.length}</td>
                  <td className="px-5 py-4">
                    <Link href={`/player/${p.id}`} className="text-sm hover:opacity-80" style={{ color: 'var(--accent)' }}>View →</Link>
                  </td>
                </tr>
              ))}
              {initialPlayers.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12" style={{ color: 'var(--muted)' }}>No players yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <h2 className="text-lg font-bold text-white mb-5">Create New User</h2>
            <div className="space-y-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'e.g. Nikos Papadopoulos' },
                { label: 'Username', key: 'username', type: 'text', placeholder: 'e.g. nikos123' },
                { label: 'Password', key: 'password', type: 'password', placeholder: 'Minimum 6 characters' },
                { label: 'Starting Balance (€)', key: 'balance', type: 'number', placeholder: '0' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid #334155' }}>
                  <option value="SUBADMIN">Subadmin</option>
                  <option value="PLAYER">Player</option>
                </select>
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreateForm(false)} className="flex-1 py-2.5 rounded-lg font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
                <button onClick={createUser} disabled={creating} className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
