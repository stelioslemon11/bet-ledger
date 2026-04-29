'use client'
import { useState } from 'react'
import Link from 'next/link'

type Bet = { id: string; match: string; betType: string; amount: number; odds: number; potentialReturn: number; status: string; createdAt: string; notes?: string }
type Player = { id: string; username: string; name: string; balance: number; bets: Bet[] }
type Session = { userId: string; username: string; role: string; name: string }

export default function SubadminClient({ session, initialPlayers }: { session: Session; initialPlayers: Player[] }) {
  const [players, setPlayers] = useState(initialPlayers)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [showCreatePlayer, setShowCreatePlayer] = useState(false)
  const [showAddBet, setShowAddBet] = useState(false)
  const [betTargetId, setBetTargetId] = useState('')
  const [form, setForm] = useState({ username: '', password: '', name: '', balance: '0' })
  const [betForm, setBetForm] = useState({ match: '', betType: 'Over 2.5', amount: '', odds: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const betTypes = ['Over 2.5', 'Under 2.5', 'GG', 'NG', 'Over 1.5', 'Over 3.5', '1X2 - Home', '1X2 - Draw', '1X2 - Away', 'Double Chance', 'BTTS', 'Asian Handicap', 'Other']

  // Totals
  const totalPending = players.reduce((s, p) => s + p.bets.filter(b => b.status === 'PENDING').reduce((a, b) => a + b.amount, 0), 0)
  const totalPotential = players.reduce((s, p) => s + p.bets.filter(b => b.status === 'PENDING').reduce((a, b) => a + b.potentialReturn, 0), 0)
  const totalWon = players.reduce((s, p) => s + p.bets.filter(b => b.status === 'WON').reduce((a, b) => a + b.potentialReturn, 0), 0)
  const totalLost = players.reduce((s, p) => s + p.bets.filter(b => b.status === 'LOST').reduce((a, b) => a + b.amount, 0), 0)

  async function createPlayer() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'PLAYER', balance: Number(form.balance) })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowCreatePlayer(false)
      setForm({ username: '', password: '', name: '', balance: '0' })
      window.location.reload()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function addBet() {
    setLoading(true); setError('')
    try {
      const potentialReturn = (Number(betForm.amount) * Number(betForm.odds)).toFixed(2)
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: betTargetId, ...betForm, amount: Number(betForm.amount), odds: Number(betForm.odds), potentialReturn: Number(potentialReturn) })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowAddBet(false)
      setBetForm({ match: '', betType: 'Over 2.5', amount: '', odds: '', notes: '' })
      window.location.reload()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function settleBet(betId: string, status: 'WON' | 'LOST') {
    const res = await fetch(`/api/bets/${betId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    if (res.ok) window.location.reload()
  }

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      PENDING: { bg: '#f59e0b20', color: '#f59e0b', label: '⏳ Pending' },
      WON: { bg: '#22c55e20', color: '#22c55e', label: '✅ Won' },
      LOST: { bg: '#ef444420', color: '#ef4444', label: '❌ Lost' },
    }
    const s2 = map[s] || map.PENDING
    return <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: s2.bg, color: s2.color }}>{s2.label}</span>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Players</h1>
          <p style={{ color: 'var(--muted)' }} className="text-sm mt-1">Manage and track your players' bets</p>
        </div>
        <button onClick={() => setShowCreatePlayer(true)} className="px-5 py-2.5 rounded-xl font-medium text-white" style={{ background: 'var(--accent)' }}>
          + Add Player
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Players', value: players.length, color: '#6366f1', prefix: '' },
          { label: 'Pending Stake', value: totalPending.toFixed(2), color: '#f59e0b', prefix: '€' },
          { label: 'Total Potential', value: totalPotential.toFixed(2), color: '#22d3ee', prefix: '€' },
          { label: 'Total Won', value: totalWon.toFixed(2), color: '#22c55e', prefix: '€' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--muted)' }}>{c.label}</div>
            <div className="text-2xl font-bold" style={{ color: c.color }}>{c.prefix}{c.value}</div>
          </div>
        ))}
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {players.map(player => {
          const pending = player.bets.filter(b => b.status === 'PENDING')
          const won = player.bets.filter(b => b.status === 'WON')
          const lost = player.bets.filter(b => b.status === 'LOST')
          const pendingStake = pending.reduce((s, b) => s + b.amount, 0)
          const pendingPotential = pending.reduce((s, b) => s + b.potentialReturn, 0)
          return (
            <div key={player.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-semibold text-white">{player.name}</div>
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>@{player.username}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>Balance</div>
                  <div className="font-bold" style={{ color: player.balance >= 0 ? '#22c55e' : '#ef4444' }}>€{player.balance.toFixed(2)}</div>
                </div>
              </div>

              {/* Bet stats */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="rounded-lg py-2" style={{ background: 'var(--surface2)' }}>
                  <div className="text-lg font-bold" style={{ color: '#f59e0b' }}>{pending.length}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>Pending</div>
                </div>
                <div className="rounded-lg py-2" style={{ background: 'var(--surface2)' }}>
                  <div className="text-lg font-bold" style={{ color: '#22c55e' }}>{won.length}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>Won</div>
                </div>
                <div className="rounded-lg py-2" style={{ background: 'var(--surface2)' }}>
                  <div className="text-lg font-bold" style={{ color: '#ef4444' }}>{lost.length}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>Lost</div>
                </div>
              </div>

              {pending.length > 0 && (
                <div className="text-xs mb-4 flex justify-between" style={{ color: 'var(--muted)' }}>
                  <span>Pending: <span className="text-white">€{pendingStake.toFixed(2)}</span></span>
                  <span>Potential: <span style={{ color: '#22c55e' }}>€{pendingPotential.toFixed(2)}</span></span>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setBetTargetId(player.id); setShowAddBet(true) }} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
                  + Add Bet
                </button>
                <Link href={`/player/${player.id}`} className="flex-1 py-2 rounded-lg text-sm font-medium text-center" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                  View All
                </Link>
              </div>
            </div>
          )
        })}

        {players.length === 0 && (
          <div className="col-span-3 text-center py-16" style={{ color: 'var(--muted)' }}>
            <div className="text-5xl mb-3">🎮</div>
            <p className="text-lg font-medium text-white mb-1">No players yet</p>
            <p className="text-sm">Add your first player to start tracking bets</p>
          </div>
        )}
      </div>

      {/* Create Player Modal */}
      {showCreatePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <h2 className="text-lg font-bold text-white mb-5">Add New Player</h2>
            <div className="space-y-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'e.g. Giorgos Papadakis' },
                { label: 'Username', key: 'username', type: 'text', placeholder: 'e.g. giorgos99' },
                { label: 'Password', key: 'password', type: 'password', placeholder: 'Min 6 characters' },
                { label: 'Starting Balance (€)', key: 'balance', type: 'number', placeholder: '0' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                </div>
              ))}
              {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowCreatePlayer(false); setError('') }} className="flex-1 py-2.5 rounded-lg font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
                <button onClick={createPlayer} disabled={loading} className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                  {loading ? 'Adding...' : 'Add Player'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Bet Modal */}
      {showAddBet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <h2 className="text-lg font-bold text-white mb-1">Add Bet</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>For: {players.find(p => p.id === betTargetId)?.name}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Match</label>
                <input type="text" placeholder="e.g. Arsenal vs Chelsea" value={betForm.match}
                  onChange={e => setBetForm(f => ({ ...f, match: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Bet Type</label>
                <select value={betForm.betType} onChange={e => setBetForm(f => ({ ...f, betType: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid #334155' }}>
                  {betTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Stake (€)</label>
                  <input type="number" placeholder="e.g. 60" value={betForm.amount}
                    onChange={e => setBetForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Odds</label>
                  <input type="number" placeholder="e.g. 2.00" step="0.01" value={betForm.odds}
                    onChange={e => setBetForm(f => ({ ...f, odds: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                </div>
              </div>
              {betForm.amount && betForm.odds && (
                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: '#22c55e15', border: '1px solid #22c55e30' }}>
                  <span style={{ color: 'var(--muted)' }}>Potential Return: </span>
                  <span className="font-bold" style={{ color: '#22c55e' }}>€{(Number(betForm.amount) * Number(betForm.odds)).toFixed(2)}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Notes (optional)</label>
                <input type="text" placeholder="e.g. Strong form at home" value={betForm.notes}
                  onChange={e => setBetForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAddBet(false); setError('') }} className="flex-1 py-2.5 rounded-lg font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
                <button onClick={addBet} disabled={loading} className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                  {loading ? 'Adding...' : 'Add Bet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
