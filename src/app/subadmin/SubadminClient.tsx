'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Bet = { id: string; match: string; betType: string; amount: number; odds: number; potentialReturn: number; status: string; createdAt: string; notes?: string }
type Player = { id: string; username: string; name: string; balance: number; bets: Bet[] }
type Session = { userId: string; username: string; role: string; name: string }
type Match = { id: number; league: string; country: string; home: string; away: string; date: string; time: string; status: string }

// A flat bet with player info attached
type PlayerBet = Bet & { playerName: string; playerId: string; playerUsername: string }

export default function SubadminClient({ session, initialPlayers }: { session: Session; initialPlayers: Player[] }) {
  const [players, setPlayers] = useState(initialPlayers)
  const [activeTab, setActiveTab] = useState<'players' | 'bets'>('players')
  const [betsFilter, setBetsFilter] = useState<'ALL' | 'PENDING' | 'WON' | 'LOST'>('PENDING')
  const [betsGroupBy, setBetsGroupBy] = useState<'match' | 'player'>('match')
  const [showCreatePlayer, setShowCreatePlayer] = useState(false)
  const [showAddBet, setShowAddBet] = useState(false)
  const [betTargetId, setBetTargetId] = useState('')
  const [form, setForm] = useState({ username: '', password: '', name: '', balance: '0' })
  const [betForm, setBetForm] = useState({ match: '', betType: 'Over 2.5', amount: '', odds: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Match browser state
  const [matchTab, setMatchTab] = useState<'browse' | 'manual'>('browse')
  const [matches, setMatches] = useState<Match[]>([])
  const [matchSearch, setMatchSearch] = useState('')
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow'>('today')

  const betTypes = ['Over 2.5', 'Under 2.5', 'GG', 'NG', 'Over 1.5', 'Over 3.5', '1X2 - Home', '1X2 - Draw', '1X2 - Away', 'Double Chance', 'BTTS', 'Asian Handicap', 'Other']

  // All bets from all players, flattened with player info
  const allBets: PlayerBet[] = players.flatMap(p =>
    p.bets.map(b => ({ ...b, playerName: p.name, playerId: p.id, playerUsername: p.username }))
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const filteredBets = betsFilter === 'ALL' ? allBets : allBets.filter(b => b.status === betsFilter)

  // Group by match name
  const betsByMatch = filteredBets.reduce<Record<string, PlayerBet[]>>((acc, b) => {
    if (!acc[b.match]) acc[b.match] = []
    acc[b.match].push(b)
    return acc
  }, {})

  // Totals
  const totalPending = players.reduce((s, p) => s + p.bets.filter(b => b.status === 'PENDING').reduce((a, b) => a + b.amount, 0), 0)
  const totalPotential = players.reduce((s, p) => s + p.bets.filter(b => b.status === 'PENDING').reduce((a, b) => a + b.potentialReturn, 0), 0)
  const totalWon = players.reduce((s, p) => s + p.bets.filter(b => b.status === 'WON').reduce((a, b) => a + b.potentialReturn, 0), 0)

  const fetchMatches = useCallback(async () => {
    setMatchLoading(true); setMatchError('')
    try {
      const res = await fetch('/api/matches')
      const data = await res.json()
      if (!res.ok || data.error) { setMatchError(data.error || 'Failed to load matches'); return }
      setMatches(data.matches || [])
    } catch { setMatchError('Network error loading matches') }
    finally { setMatchLoading(false) }
  }, [])

  useEffect(() => {
    if (showAddBet && matchTab === 'browse' && matches.length === 0) fetchMatches()
  }, [showAddBet, matchTab, matches.length, fetchMatches])

  function getToday() { return new Date().toISOString().split('T')[0] }
  function getTomorrow() { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0] }

  const filteredMatches = matches.filter(m => {
    const dateMatch = selectedDate === 'today' ? m.date === getToday() : m.date === getTomorrow()
    const q = matchSearch.toLowerCase()
    return dateMatch && (!q || m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q) || m.league.toLowerCase().includes(q) || m.country.toLowerCase().includes(q))
  })

  const grouped = filteredMatches.reduce<Record<string, Match[]>>((acc, m) => {
    const key = `${m.country} — ${m.league}`
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  function selectMatch(m: Match) {
    setBetForm(f => ({ ...f, match: `${m.home} vs ${m.away}` }))
    setMatchTab('manual')
  }

  async function settleBet(betId: string, status: 'WON' | 'LOST') {
    await fetch(`/api/bets/${betId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    window.location.reload()
  }

  async function createPlayer() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, role: 'PLAYER', balance: Number(form.balance) }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowCreatePlayer(false); setForm({ username: '', password: '', name: '', balance: '0' }); window.location.reload()
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  async function addBet() {
    setLoading(true); setError('')
    try {
      const potentialReturn = (Number(betForm.amount) * Number(betForm.odds)).toFixed(2)
      const res = await fetch('/api/bets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: betTargetId, ...betForm, amount: Number(betForm.amount), odds: Number(betForm.odds), potentialReturn: Number(potentialReturn) }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowAddBet(false); setBetForm({ match: '', betType: 'Over 2.5', amount: '', odds: '', notes: '' }); window.location.reload()
    } catch { setError('Network error') } finally { setLoading(false) }
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">SubAdmin Dashboard</h1>
          <p style={{ color: 'var(--muted)' }} className="text-sm mt-1">Manage your players and track all bets</p>
        </div>
        <button onClick={() => setShowCreatePlayer(true)} className="px-5 py-2.5 rounded-xl font-medium text-white" style={{ background: 'var(--accent)' }}>+ Add Player</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'players', label: '👥 Players', count: players.length },
          { id: 'bets', label: '🎯 Bets Overview', count: allBets.filter(b => b.status === 'PENDING').length },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className="px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all"
            style={{ background: activeTab === t.id ? 'var(--accent)' : 'var(--surface)', color: activeTab === t.id ? 'white' : 'var(--muted)', border: '1px solid var(--surface2)' }}>
            {t.label}
            <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: activeTab === t.id ? 'rgba(255,255,255,0.2)' : 'var(--surface2)' }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ═══ PLAYERS TAB ═══ */}
      {activeTab === 'players' && (
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
                  <button onClick={() => { setBetTargetId(player.id); setShowAddBet(true); setMatchTab('browse'); setMatchSearch('') }}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>+ Add Bet</button>
                  <Link href={`/player/${player.id}`} className="flex-1 py-2 rounded-lg text-sm font-medium text-center" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>View All</Link>
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
      )}

      {/* ═══ BETS OVERVIEW TAB ═══ */}
      {activeTab === 'bets' && (
        <div>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 mb-5 items-center justify-between">
            <div className="flex gap-2">
              {(['PENDING', 'ALL', 'WON', 'LOST'] as const).map(f => {
                const colors: Record<string, string> = { PENDING: '#f59e0b', WON: '#22c55e', LOST: '#ef4444', ALL: '#6366f1' }
                const active = betsFilter === f
                return (
                  <button key={f} onClick={() => setBetsFilter(f)}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{ background: active ? colors[f] + '30' : 'var(--surface2)', color: active ? colors[f] : 'var(--muted)', border: `1px solid ${active ? colors[f] + '60' : 'transparent'}` }}>
                    {f === 'PENDING' ? '⏳ Pending' : f === 'WON' ? '✅ Won' : f === 'LOST' ? '❌ Lost' : '🗂️ All'}
                    <span className="ml-1.5 text-xs opacity-70">
                      {f === 'ALL' ? allBets.length : allBets.filter(b => b.status === f).length}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBetsGroupBy('match')} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: betsGroupBy === 'match' ? 'var(--accent)' : 'var(--surface2)', color: betsGroupBy === 'match' ? 'white' : 'var(--muted)' }}>
                Group by Match
              </button>
              <button onClick={() => setBetsGroupBy('player')} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: betsGroupBy === 'player' ? 'var(--accent)' : 'var(--surface2)', color: betsGroupBy === 'player' ? 'white' : 'var(--muted)' }}>
                Group by Player
              </button>
            </div>
          </div>

          {filteredBets.length === 0 && (
            <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
              <div className="text-4xl mb-3">🎯</div>
              <p className="font-medium text-white">No {betsFilter.toLowerCase()} bets</p>
            </div>
          )}

          {/* Group by MATCH */}
          {betsGroupBy === 'match' && Object.entries(betsByMatch).map(([matchName, bets]) => {
            const totalStake = bets.reduce((s, b) => s + b.amount, 0)
            const totalReturn = bets.reduce((s, b) => s + b.potentialReturn, 0)
            return (
              <div key={matchName} className="mb-4 rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                {/* Match header */}
                <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#1e293b' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">⚽</span>
                    <span className="font-semibold text-white">{matchName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6366f120', color: '#6366f1' }}>{bets.length} bet{bets.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span style={{ color: 'var(--muted)' }}>Total stake: <span className="text-white font-medium">€{totalStake.toFixed(2)}</span></span>
                    <span style={{ color: 'var(--muted)' }}>Potential: <span style={{ color: '#22c55e' }} className="font-medium">€{totalReturn.toFixed(2)}</span></span>
                  </div>
                </div>
                {/* Bets rows */}
                <div style={{ background: 'var(--surface)' }}>
                  {bets.map((b, i) => (
                    <div key={b.id} className="px-5 py-3 flex items-center gap-4 flex-wrap"
                      style={{ borderTop: i > 0 ? '1px solid var(--surface2)' : 'none' }}>
                      {/* Player */}
                      <Link href={`/player/${b.playerId}`} className="flex items-center gap-2 min-w-0" style={{ minWidth: '120px' }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: `hsl(${b.playerName.charCodeAt(0) * 15 % 360}, 60%, 40%)` }}>
                          {b.playerName[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-white truncate">{b.playerName}</span>
                      </Link>
                      {/* Bet type */}
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                        style={{ background: '#6366f120', color: '#818cf8' }}>{b.betType}</span>
                      {/* Stake → Return */}
                      <div className="flex items-center gap-1 text-sm flex-shrink-0">
                        <span className="font-medium text-white">€{b.amount.toFixed(0)}</span>
                        <span style={{ color: 'var(--muted)' }}>@{b.odds}</span>
                        <span style={{ color: 'var(--muted)' }}>→</span>
                        <span className="font-bold" style={{ color: '#22c55e' }}>€{b.potentialReturn.toFixed(0)}</span>
                      </div>
                      {/* Status */}
                      <div className="flex-shrink-0">{statusBadge(b.status)}</div>
                      {/* Notes */}
                      {b.notes && <span className="text-xs italic flex-1" style={{ color: 'var(--muted)' }}>{b.notes}</span>}
                      {/* Settle buttons */}
                      {b.status === 'PENDING' && (
                        <div className="flex gap-2 ml-auto flex-shrink-0">
                          <button onClick={() => settleBet(b.id, 'WON')} className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: '#22c55e20', color: '#22c55e' }}>✓ Won</button>
                          <button onClick={() => settleBet(b.id, 'LOST')} className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: '#ef444420', color: '#ef4444' }}>✗ Lost</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Group by PLAYER */}
          {betsGroupBy === 'player' && players.map(player => {
            const pBets = filteredBets.filter(b => b.playerId === player.id)
            if (pBets.length === 0) return null
            const stake = pBets.reduce((s, b) => s + b.amount, 0)
            const ret = pBets.reduce((s, b) => s + b.potentialReturn, 0)
            return (
              <div key={player.id} className="mb-4 rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#1e293b' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: `hsl(${player.name.charCodeAt(0) * 15 % 360}, 60%, 40%)` }}>
                      {player.name[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold text-white">{player.name}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>@{player.username}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6366f120', color: '#6366f1' }}>{pBets.length} bet{pBets.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span style={{ color: 'var(--muted)' }}>Stake: <span className="text-white font-medium">€{stake.toFixed(2)}</span></span>
                    <span style={{ color: 'var(--muted)' }}>Potential: <span style={{ color: '#22c55e' }} className="font-medium">€{ret.toFixed(2)}</span></span>
                  </div>
                </div>
                <div style={{ background: 'var(--surface)' }}>
                  {pBets.map((b, i) => (
                    <div key={b.id} className="px-5 py-3 flex items-center gap-4 flex-wrap"
                      style={{ borderTop: i > 0 ? '1px solid var(--surface2)' : 'none' }}>
                      <span className="font-medium text-white text-sm flex-1" style={{ minWidth: '160px' }}>⚽ {b.match}</span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0" style={{ background: '#6366f120', color: '#818cf8' }}>{b.betType}</span>
                      <div className="flex items-center gap-1 text-sm flex-shrink-0">
                        <span className="font-medium text-white">€{b.amount.toFixed(0)}</span>
                        <span style={{ color: 'var(--muted)' }}>@{b.odds}</span>
                        <span style={{ color: 'var(--muted)' }}>→</span>
                        <span className="font-bold" style={{ color: '#22c55e' }}>€{b.potentialReturn.toFixed(0)}</span>
                      </div>
                      <div className="flex-shrink-0">{statusBadge(b.status)}</div>
                      {b.notes && <span className="text-xs italic" style={{ color: 'var(--muted)' }}>{b.notes}</span>}
                      {b.status === 'PENDING' && (
                        <div className="flex gap-2 ml-auto flex-shrink-0">
                          <button onClick={() => settleBet(b.id, 'WON')} className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: '#22c55e20', color: '#22c55e' }}>✓ Won</button>
                          <button onClick={() => settleBet(b.id, 'LOST')} className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: '#ef444420', color: '#ef4444' }}>✗ Lost</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
                <button onClick={createPlayer} disabled={loading} className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>{loading ? 'Adding...' : 'Add Player'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Bet Modal */}
      {showAddBet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-full rounded-2xl flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)', maxWidth: matchTab === 'browse' ? '900px' : '480px', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--surface2)' }}>
              <div>
                <h2 className="text-lg font-bold text-white">Add Bet</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>For: {players.find(p => p.id === betTargetId)?.name}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setMatchTab('browse')} className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: matchTab === 'browse' ? 'var(--accent)' : 'var(--surface2)', color: matchTab === 'browse' ? 'white' : 'var(--muted)' }}>🔍 Browse Matches</button>
                <button onClick={() => setMatchTab('manual')} className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: matchTab === 'manual' ? 'var(--accent)' : 'var(--surface2)', color: matchTab === 'manual' ? 'white' : 'var(--muted)' }}>✏️ Manual</button>
              </div>
            </div>

            {matchTab === 'browse' && (
              <div className="flex flex-col overflow-hidden" style={{ height: '70vh' }}>
                <div className="p-4 flex gap-3 items-center border-b" style={{ borderColor: 'var(--surface2)' }}>
                  <input type="text" placeholder="Search team, league or country..." value={matchSearch}
                    onChange={e => setMatchSearch(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg text-white outline-none text-sm"
                    style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                  <div className="flex gap-2">
                    {(['today', 'tomorrow'] as const).map(d => (
                      <button key={d} onClick={() => setSelectedDate(d)} className="px-3 py-2 rounded-lg text-sm font-medium capitalize"
                        style={{ background: selectedDate === d ? '#6366f1' : 'var(--surface2)', color: selectedDate === d ? 'white' : 'var(--muted)' }}>{d}</button>
                    ))}
                  </div>
                  <button onClick={fetchMatches} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--muted)' }} title="Refresh">↻</button>
                </div>
                <div className="overflow-y-auto flex-1 p-3">
                  {matchLoading && <div className="flex items-center justify-center h-40" style={{ color: 'var(--muted)' }}><div className="text-center"><div className="text-2xl mb-2">⚽</div><div className="text-sm">Loading matches...</div></div></div>}
                  {matchError && <div className="text-center py-10"><div className="text-3xl mb-2">⚠️</div><p className="text-sm mb-3" style={{ color: '#ef4444' }}>{matchError}</p><button onClick={fetchMatches} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>Retry</button></div>}
                  {!matchLoading && !matchError && Object.keys(grouped).length === 0 && <div className="text-center py-10" style={{ color: 'var(--muted)' }}><div className="text-3xl mb-2">📅</div><p className="text-sm">No matches found for {selectedDate}</p></div>}
                  {!matchLoading && !matchError && Object.entries(grouped).map(([leagueKey, leagueMatches]) => (
                    <div key={leagueKey} className="mb-4">
                      <div className="text-xs font-semibold uppercase tracking-wide px-2 py-1.5 mb-1 rounded" style={{ color: '#6366f1', background: '#6366f115' }}>{leagueKey}</div>
                      <div className="space-y-1">
                        {leagueMatches.map(m => (
                          <button key={m.id} onClick={() => selectMatch(m)} className="w-full text-left px-3 py-2.5 rounded-lg transition-all"
                            style={{ background: 'var(--surface2)', border: '1px solid transparent' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: '#1e293b', color: '#94a3b8', minWidth: '40px', textAlign: 'center' }}>{m.time}</span>
                                <span className="text-sm font-medium text-white">{m.home}</span>
                                <span className="text-xs" style={{ color: 'var(--muted)' }}>vs</span>
                                <span className="text-sm font-medium text-white">{m.away}</span>
                              </div>
                              <span className="text-xs ml-2" style={{ color: '#6366f1' }}>Select →</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {matchTab === 'manual' && (
              <div className="p-5 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Match</label>
                  <input type="text" placeholder="e.g. Arsenal vs Chelsea" value={betForm.match}
                    onChange={e => setBetForm(f => ({ ...f, match: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                  {betForm.match && <p className="text-xs mt-1" style={{ color: '#6366f1' }}>✓ {betForm.match}</p>}
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
              </div>
            )}

            <div className="flex gap-3 p-5 border-t" style={{ borderColor: 'var(--surface2)' }}>
              <button onClick={() => { setShowAddBet(false); setError(''); setBetForm({ match: '', betType: 'Over 2.5', amount: '', odds: '', notes: '' }) }}
                className="flex-1 py-2.5 rounded-lg font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
              {matchTab === 'manual' && (
                <button onClick={addBet} disabled={loading || !betForm.match || !betForm.amount || !betForm.odds}
                  className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
                  {loading ? 'Adding...' : 'Add Bet'}
                </button>
              )}
              {matchTab === 'browse' && (
                <button onClick={() => setMatchTab('manual')} className="flex-1 py-2.5 rounded-lg font-medium text-white" style={{ background: 'var(--accent)' }}>
                  {betForm.match ? `Continue: ${betForm.match.substring(0, 25)}...` : 'Enter Details →'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
