'use client'
import { useState } from 'react'
import Link from 'next/link'

type Bet = { id: string; match: string; betType: string; amount: number; odds: number; potentialReturn: number; status: string; createdAt: string; parlayId?: string | null; parlayOrder?: number | null }
type Parlay = { id: string; initialStake: number; totalOdds: number; potentialReturn: number; status: string; bets: Bet[] }
type Player = { id: string; username: string; name: string; balance: number; bets: Bet[]; parlays: Parlay[] }
type Subadmin = { id: string; username: string; name: string; balance: number; children: Player[] }
type Stats = { totalBets: number; pendingBets: number; wonBets: number; totalSubadmins: number; totalPlayers: number }
type Session = { userId: string; username: string; role: string; name: string }

function avatar(name: string) {
  return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
}

function statusBadge(s: string) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#f59e0b20', color: '#f59e0b', label: '⏳' },
    WON: { bg: '#22c55e20', color: '#22c55e', label: '✅' },
    LOST: { bg: '#ef444420', color: '#ef4444', label: '❌' },
  }
  const c = cfg[s] || cfg.PENDING
  return <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.color }}>{c.label} {s}</span>
}

export default function AdminClient({ session, initialSubadmins, initialPlayers, stats }: {
  session: Session
  initialSubadmins: Subadmin[]
  initialPlayers: Player[]
  stats: Stats
}) {
  const [subadmins] = useState(initialSubadmins)
  const [tab, setTab] = useState<'overview' | 'bets' | 'subadmins' | 'players'>('overview')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'SUBADMIN', balance: '0' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [expandedSA, setExpandedSA] = useState<Set<string>>(new Set())
  const [expandedPlayer, setExpandedPlayer] = useState<Set<string>>(new Set())
  const [betsFilter, setBetsFilter] = useState<'ALL' | 'PENDING' | 'WON' | 'LOST'>('PENDING')
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balanceTarget, setBalanceTarget] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [balanceOp, setBalanceOp] = useState<'add' | 'subtract'>('add')
  const [balanceAmount, setBalanceAmount] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  async function createUser() {
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, balance: Number(form.balance) }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowCreateForm(false)
      setForm({ username: '', password: '', name: '', role: 'SUBADMIN', balance: '0' })
      window.location.reload()
    } catch { setError('Network error') }
    finally { setCreating(false) }
  }

  async function settleBetAction(betId: string, status: 'WON' | 'LOST') {
    await fetch(`/api/bets/${betId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    window.location.reload()
  }

  async function deleteBet(betId: string) {
    if (!confirm('Delete this bet?')) return
    await fetch(`/api/bets/${betId}`, { method: 'DELETE' })
    window.location.reload()
  }

  async function deleteUser(userId: string, name: string) {
    if (!confirm(`Delete "${name}" and all their data? This cannot be undone.`)) return
    await fetch(`/api/users/${userId}`, { method: 'DELETE' })
    window.location.reload()
  }

  async function adjustBalance() {
    if (!balanceTarget || !balanceAmount || isNaN(Number(balanceAmount))) return
    setActionLoading(true); setActionError('')
    try {
      const delta = Number(balanceAmount) * (balanceOp === 'subtract' ? -1 : 1)
      const res = await fetch(`/api/users/${balanceTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: balanceTarget.balance + delta })
      })
      if (!res.ok) { const d = await res.json(); setActionError(d.error); return }
      setShowBalanceModal(false); setBalanceAmount(''); setBalanceTarget(null)
      window.location.reload()
    } catch { setActionError('Network error') }
    finally { setActionLoading(false) }
  }

  const statCards = [
    { label: 'Subadmins', value: stats.totalSubadmins, color: '#6366f1', icon: '👤' },
    { label: 'Players', value: stats.totalPlayers, color: '#22d3ee', icon: '🎮' },
    { label: 'Total Bets', value: stats.totalBets, color: '#f59e0b', icon: '📋' },
    { label: 'Pending', value: stats.pendingBets, color: '#f97316', icon: '⏳' },
    { label: 'Won', value: stats.wonBets, color: '#22c55e', icon: '✅' },
  ]

  const tabs = [
    { key: 'overview', label: '🏠 Overview' },
    { key: 'bets', label: '🎯 Bets', badge: stats.pendingBets },
    { key: 'subadmins', label: '👤 SubAdmins' },
    { key: 'players', label: '🎮 Players' },
  ] as const

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p style={{ color: 'var(--muted)' }} className="text-sm mt-1">Full system overview</p>
        </div>
        <button onClick={() => setShowCreateForm(true)} className="px-5 py-2.5 rounded-xl font-medium text-white hover:opacity-90" style={{ background: 'var(--accent)' }}>
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
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{ background: tab === t.key ? 'var(--accent)' : 'var(--surface)', color: tab === t.key ? 'white' : 'var(--muted)', border: '1px solid var(--surface2)' }}>
            {t.label}
            {'badge' in t && t.badge > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500 text-white font-bold">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {subadmins.map(sa => {
            const totalStake = sa.children.reduce((sum, p) => sum + p.bets.filter(b => b.status === 'PENDING').reduce((s, b) => s + b.amount, 0), 0)
            const totalPotential = sa.children.reduce((sum, p) => sum + p.bets.filter(b => b.status === 'PENDING').reduce((s, b) => s + b.potentialReturn, 0), 0)
            const totalPending = sa.children.reduce((sum, p) => sum + p.bets.filter(b => b.status === 'PENDING').length, 0)
            return (
              <div key={sa.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: '#6366f1' }}>
                      {avatar(sa.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{sa.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6366f120', color: '#6366f1' }}>@{sa.username}</span>
                      </div>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{sa.children.length} players · {totalPending} pending bets</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm" style={{ color: 'var(--muted)' }}>Pending stake</div>
                    <div className="font-bold text-white">€{totalStake.toFixed(2)}</div>
                    <div className="text-xs" style={{ color: '#22c55e' }}>→ €{totalPotential.toFixed(2)}</div>
                  </div>
                </div>
                {sa.children.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {sa.children.map(player => {
                      const pending = player.bets.filter(b => b.status === 'PENDING')
                      const stake = pending.reduce((s, b) => s + b.amount, 0)
                      return (
                        <Link href={`/player/${player.id}`} key={player.id} className="rounded-lg p-3 hover:opacity-80 transition-opacity" style={{ background: 'var(--surface2)' }}>
                          <div className="font-medium text-white text-sm">{player.name}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>@{player.username}</div>
                          <div className="flex justify-between mt-2 text-xs">
                            <span style={{ color: '#f59e0b' }}>{pending.length} pending</span>
                            <span style={{ color: 'var(--muted)' }}>€{stake.toFixed(0)}</span>
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
              <div className="text-4xl mb-3">👤</div><p>No subadmins yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── BETS TAB (by SubAdmin) ── */}
      {tab === 'bets' && (
        <div>
          <div className="flex gap-1 rounded-lg p-1 mb-6 w-fit" style={{ background: 'var(--surface)' }}>
            {(['PENDING','ALL','WON','LOST'] as const).map(f => (
              <button key={f} onClick={() => setBetsFilter(f)} className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{ background: betsFilter === f ? 'var(--accent)' : 'transparent', color: betsFilter === f ? 'white' : 'var(--muted)' }}>
                {f}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {subadmins.map(sa => {
              const allSABets = sa.children.flatMap(p => p.bets.map(b => ({ ...b, playerName: p.name, playerId: p.id, playerUsername: p.username })))
              const filtered = betsFilter === 'ALL' ? allSABets : allSABets.filter(b => b.status === betsFilter)
              if (filtered.length === 0) return null

              const saExpanded = expandedSA.has(sa.id)

              return (
                <div key={sa.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                  {/* SubAdmin header */}
                  <button className="w-full flex items-center justify-between px-5 py-4 hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--surface2)' }}
                    onClick={() => setExpandedSA(prev => { const n = new Set(prev); n.has(sa.id) ? n.delete(sa.id) : n.add(sa.id); return n })}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#6366f1' }}>
                        {avatar(sa.name)}
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-white">{sa.name} <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>@{sa.username}</span></div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{filtered.length} {betsFilter.toLowerCase()} bets · {sa.children.length} players</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-xs">
                        <div style={{ color: 'var(--muted)' }}>Stake: <b className="text-white">€{filtered.reduce((s, b) => s + b.amount, 0).toFixed(0)}</b></div>
                        <div style={{ color: '#22c55e' }}>Potential: €{filtered.reduce((s, b) => s + b.potentialReturn, 0).toFixed(0)}</div>
                      </div>
                      <span style={{ color: 'var(--muted)' }}>{saExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {saExpanded && (
                    <div style={{ background: 'var(--surface)' }}>
                      {sa.children.map(player => {
                        const playerBets = betsFilter === 'ALL' ? player.bets : player.bets.filter(b => b.status === betsFilter)
                        if (playerBets.length === 0) return null

                        const pExpanded = expandedPlayer.has(player.id)
                        const stake = playerBets.reduce((s, b) => s + b.amount, 0)

                        return (
                          <div key={player.id} style={{ borderTop: '1px solid var(--surface2)' }}>
                            <button className="w-full flex items-center justify-between px-6 py-3 hover:opacity-90 transition-opacity"
                              style={{ background: '#1e293b40' }}
                              onClick={() => setExpandedPlayer(prev => { const n = new Set(prev); n.has(player.id) ? n.delete(player.id) : n.add(player.id); return n })}>
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
                                  {avatar(player.name)}
                                </div>
                                <div className="text-left">
                                  <span className="text-sm font-medium text-white">{player.name}</span>
                                  <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>@{player.username}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <span style={{ color: '#f59e0b' }}>{playerBets.length} bets · €{stake.toFixed(0)}</span>
                                <span style={{ color: 'var(--muted)' }}>{pExpanded ? '▲' : '▼'}</span>
                              </div>
                            </button>

                            {pExpanded && playerBets.map((bet, idx) => (
                              <div key={bet.id} className="flex items-center gap-3 px-8 py-3" style={{ borderTop: '1px solid var(--surface2)', background: 'var(--surface)' }}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-white text-sm">{bet.match}</span>
                                    {bet.parlayId && (
                                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f59e0b20', color: '#f59e0b' }}>🔗 Leg {bet.parlayOrder}</span>
                                    )}
                                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: '#6366f1' }}>{bet.betType}</span>
                                  </div>
                                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                    €{bet.amount.toFixed(0)} @{bet.odds}x → <span style={{ color: '#22c55e' }}>€{bet.potentialReturn.toFixed(0)}</span>
                                    {' · '}{new Date(bet.createdAt).toLocaleDateString('el-GR')}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {statusBadge(bet.status)}
                                  {bet.status === 'PENDING' && (
                                    <>
                                      <button onClick={() => settleBetAction(bet.id, 'WON')} className="text-xs px-2 py-1 rounded-lg" style={{ background: '#22c55e20', color: '#22c55e' }}>Won</button>
                                      <button onClick={() => settleBetAction(bet.id, 'LOST')} className="text-xs px-2 py-1 rounded-lg" style={{ background: '#ef444420', color: '#ef4444' }}>Lost</button>
                                    </>
                                  )}
                                  {!bet.parlayId && (
                                    <button onClick={() => deleteBet(bet.id)} className="text-xs px-2 py-1 rounded-lg" style={{ background: '#ef444410', color: '#ef4444' }}>🗑</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {subadmins.every(sa => {
              const bets = sa.children.flatMap(p => p.bets)
              return (betsFilter === 'ALL' ? bets : bets.filter(b => b.status === betsFilter)).length === 0
            }) && (
              <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
                <div className="text-4xl mb-3">📭</div>
                <p>No {betsFilter.toLowerCase()} bets across the system.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUBADMINS TAB ── */}
      {tab === 'subadmins' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
          <table className="w-full">
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>{['Name','Username','Players','Pending Bets','Actions'].map(h => (
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
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setTab('bets'); setExpandedSA(new Set([sa.id])) }} className="text-sm hover:opacity-80" style={{ color: 'var(--accent)' }}>Bets →</button>
                        <button onClick={() => { setBalanceTarget({ id: sa.id, name: sa.name, balance: sa.balance }); setBalanceOp('add'); setBalanceAmount(''); setShowBalanceModal(true) }}
                          className="text-xs px-2 py-1 rounded-lg" style={{ background: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e30' }}>
                          💰 Balance
                        </button>
                        <button onClick={() => deleteUser(sa.id, sa.name)}
                          className="text-xs px-2 py-1 rounded-lg" style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                          🗑 Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {subadmins.length === 0 && <tr><td colSpan={5} className="text-center py-12" style={{ color: 'var(--muted)' }}>No subadmins yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PLAYERS TAB ── */}
      {tab === 'players' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
          <table className="w-full">
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>{['Name','Username','Total / Available','Pending Bets','Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-sm font-medium" style={{ color: 'var(--muted)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody style={{ background: 'var(--surface)' }}>
              {initialPlayers.map((p, i) => {
                // Lock initial stake for entire parlay duration
                const pendingParlayIds = new Set(
                  p.bets.filter((b: any) => b.status === 'PENDING' && b.parlayId).map((b: any) => b.parlayId)
                )
                const seenParlays = new Set<string>()
                let parlayLocked = 0
                p.bets.forEach((b: any) => {
                  if (b.parlayId && pendingParlayIds.has(b.parlayId) && !seenParlays.has(b.parlayId)) {
                    parlayLocked += b.parlayInitialStake || 0
                    seenParlays.add(b.parlayId)
                  }
                })
                const pendingStake = p.bets
                  .filter((b: any) => b.status === 'PENDING' && !b.parlayId)
                  .reduce((s: number, b: any) => s + b.amount, 0) + parlayLocked
                const available = p.balance - pendingStake
                return (
                <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--surface2)' : undefined }}>
                  <td className="px-5 py-4 text-white font-medium">{p.name}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>@{p.username}</td>
                  <td className="px-5 py-4">
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>€{p.balance.toFixed(2)}</div>
                    <div className="font-semibold" style={{ color: available >= 0 ? '#22c55e' : '#ef4444' }}>€{available.toFixed(2)} avail.</div>
                    {pendingStake > 0 && <div className="text-xs" style={{ color: '#f59e0b' }}>🔒 €{pendingStake.toFixed(2)}</div>}
                  </td>
                  <td className="px-5 py-4 text-white">{p.bets.filter((b:any) => b.status === 'PENDING').length} pending</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Link href={`/player/${p.id}`} className="text-sm hover:opacity-80" style={{ color: 'var(--accent)' }}>View →</Link>
                      <button onClick={() => { setBalanceTarget({ id: p.id, name: p.name, balance: p.balance }); setBalanceOp('add'); setBalanceAmount(''); setShowBalanceModal(true) }}
                        className="text-xs px-2 py-1 rounded-lg" style={{ background: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e30' }}>
                        💰 Balance
                      </button>
                      <button onClick={() => deleteUser(p.id, p.name)}
                        className="text-xs px-2 py-1 rounded-lg" style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                        🗑 Delete
                      </button>
                    </div>
                  </td>
                </tr>
                )})}
              {initialPlayers.length === 0 && <tr><td colSpan={5} className="text-center py-12" style={{ color: 'var(--muted)' }}>No players yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Balance Adjustment Modal */}
      {showBalanceModal && balanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <h2 className="text-lg font-bold text-white mb-1">Adjust Balance</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
              {balanceTarget.name} · Current: <span style={{ color: balanceTarget.balance >= 0 ? '#22c55e' : '#ef4444' }}>€{balanceTarget.balance.toFixed(2)}</span>
            </p>
            <div className="space-y-4">
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                <button onClick={() => setBalanceOp('add')} className="flex-1 py-2.5 text-sm font-medium transition-all"
                  style={{ background: balanceOp === 'add' ? '#22c55e' : 'var(--surface2)', color: balanceOp === 'add' ? 'white' : 'var(--muted)' }}>
                  + Add
                </button>
                <button onClick={() => setBalanceOp('subtract')} className="flex-1 py-2.5 text-sm font-medium transition-all"
                  style={{ background: balanceOp === 'subtract' ? '#ef4444' : 'var(--surface2)', color: balanceOp === 'subtract' ? 'white' : 'var(--muted)' }}>
                  − Subtract
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Amount (€)</label>
                <input type="number" min="0" step="0.01" placeholder="e.g. 100"
                  value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
              </div>
              {balanceAmount && !isNaN(Number(balanceAmount)) && (
                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--surface2)' }}>
                  New balance: <span className="font-bold" style={{ color: (balanceTarget.balance + Number(balanceAmount) * (balanceOp === 'subtract' ? -1 : 1)) >= 0 ? '#22c55e' : '#ef4444' }}>
                    €{(balanceTarget.balance + Number(balanceAmount) * (balanceOp === 'subtract' ? -1 : 1)).toFixed(2)}
                  </span>
                </div>
              )}
              {actionError && <p className="text-sm" style={{ color: '#ef4444' }}>{actionError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowBalanceModal(false); setActionError('') }} className="flex-1 py-2.5 rounded-xl font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
                <button onClick={adjustBalance} disabled={actionLoading || !balanceAmount} className="flex-1 py-2.5 rounded-xl font-medium text-white disabled:opacity-50"
                  style={{ background: balanceOp === 'add' ? '#22c55e' : '#ef4444' }}>
                  {actionLoading ? 'Saving…' : `${balanceOp === 'add' ? 'Add' : 'Subtract'} €${balanceAmount || '0'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <h2 className="text-lg font-bold text-white mb-5">Create New User</h2>
            <div className="space-y-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'Nikos Papadopoulos' },
                { label: 'Username', key: 'username', type: 'text', placeholder: 'nikos123' },
                { label: 'Password', key: 'password', type: 'password', placeholder: 'Min 6 chars' },
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
                  <option value="SUBADMIN">SubAdmin</option>
                  <option value="PLAYER">Player</option>
                </select>
              </div>
              {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreateForm(false)} className="flex-1 py-2.5 rounded-xl font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
                <button onClick={createUser} disabled={creating} className="flex-1 py-2.5 rounded-xl font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
