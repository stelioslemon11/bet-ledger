'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Bet = {
  id: string; match: string; betType: string; amount: number; odds: number
  potentialReturn: number; status: string; createdAt: string; notes?: string
  fixtureId?: number | null; fixtureDate?: string | null; parlayId?: string | null; parlayOrder?: number | null
}
type Parlay = {
  id: string; initialStake: number; totalOdds: number; potentialReturn: number
  status: string; createdAt: string; bets: Bet[]
}
type Player = { id: string; username: string; name: string; balance: number; bets: Bet[]; parlays: Parlay[] }
type Session = { userId: string; username: string; role: string; name: string }
type Match = { id: number; league: string; country: string; home: string; away: string; date: string; time: string; status: string; elapsed?: number; homeScore?: number; awayScore?: number; isLive: boolean }
type ParlayLeg = { match: string; betType: string; odds: string; fixtureId: number | null; fixtureDate: string | null }
type PlayerBet = Bet & { playerName: string; playerId: string; playerUsername: string; parlayTotalLegs?: number; parlayInitialStake?: number; parlayTotalOdds?: number; parlayPotential?: number }

const BET_TYPES = [
  // Goals total lines
  'Over 0.5','Under 0.5',
  'Over 1.5','Under 1.5',
  'Over 2.5','Under 2.5',
  'Over 3.5','Under 3.5',
  'Over 4.5','Under 4.5',
  'Over 5.5','Under 5.5',
  // Match result
  '1X2 - Home','1X2 - Draw','1X2 - Away',
  // Double Chance
  'Double Chance 1X','Double Chance X2','Double Chance 12',
  // Both teams to score
  'GG','NG',
  // Half-time
  'HT Over 0.5','HT Over 1.5','HT Under 0.5','HT Under 1.5',
  'HT - Home','HT - Draw','HT - Away',
  // Other
  'Asian Handicap','Both Halves Over 0.5','Clean Sheet Home','Clean Sheet Away','Other',
]

function getBetLine(betType: string): string {
  const bt = betType.toLowerCase()
  if (/over|under/.test(bt) && /0\.5/.test(bt) && !/ht/.test(bt)) return '⚽ Goals 0.5'
  if (/over|under/.test(bt) && /1\.5/.test(bt) && !/ht/.test(bt)) return '⚽ Goals 1.5'
  if (/over|under/.test(bt) && /2\.5/.test(bt)) return '⚽ Goals 2.5'
  if (/over|under/.test(bt) && /3\.5/.test(bt)) return '⚽ Goals 3.5'
  if (/over|under/.test(bt) && /4\.5/.test(bt)) return '⚽ Goals 4.5'
  if (/over|under/.test(bt) && /5\.5/.test(bt)) return '⚽ Goals 5.5'
  if (bt === 'gg' || bt === 'ng' || /btts/.test(bt)) return '🎯 Both Teams Score'
  if (/1x2|home|away|draw/.test(bt) && !/ht/.test(bt) && !/clean/.test(bt)) return '🏆 Match Result'
  if (/double chance/.test(bt)) return '🔄 Double Chance'
  if (/ht/.test(bt)) return '⏱ Half Time'
  if (/asian|handicap/.test(bt)) return '📊 Asian Handicap'
  return '📋 Other'
}

function avatar(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function statusBadge(s: string) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#f59e0b20', color: '#f59e0b', label: '⏳ Pending' },
    WON: { bg: '#22c55e20', color: '#22c55e', label: '✅ Won' },
    LOST: { bg: '#ef444420', color: '#ef4444', label: '❌ Lost' },
  }
  const c = cfg[s] || cfg.PENDING
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.color }}>{c.label}</span>
}

export default function SubadminClient({ session, initialPlayers }: { session: Session; initialPlayers: Player[] }) {
  const [players, setPlayers] = useState(initialPlayers)
  const [activeTab, setActiveTab] = useState<'players' | 'bets'>('players')
  const [betsFilter, setBetsFilter] = useState<'ALL' | 'PENDING' | 'WON' | 'LOST'>('PENDING')
  const [betsGroupBy, setBetsGroupBy] = useState<'match' | 'player'>('match')

  // Create player modal
  const [showCreatePlayer, setShowCreatePlayer] = useState(false)
  const [playerForm, setPlayerForm] = useState({ username: '', password: '', name: '', balance: '0' })

  // Add Bet modal
  const [showAddBet, setShowAddBet] = useState(false)
  const [betTargetId, setBetTargetId] = useState('')
  const [betMode, setBetMode] = useState<'single' | 'parlay'>('single')

  // Single bet form
  const [betForm, setBetForm] = useState({ match: '', betType: 'Over 2.5', amount: '', odds: '', notes: '', fixtureId: null as number | null, fixtureDate: null as string | null })

  // Parlay form
  const [parlayStake, setParlayStake] = useState('')
  const [parlayLegs, setParlayLegs] = useState<ParlayLeg[]>([
    { match: '', betType: 'Over 2.5', odds: '', fixtureId: null, fixtureDate: null },
    { match: '', betType: 'Over 2.5', odds: '', fixtureId: null, fixtureDate: null },
  ])

  // Match browser
  const [showMatchBrowser, setShowMatchBrowser] = useState(false)
  const [browseForLeg, setBrowseForLeg] = useState<number | null>(null) // null = single bet
  const [matches, setMatches] = useState<Match[]>([])
  const [matchSearch, setMatchSearch] = useState('')
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow'>('today')
  const [selectedSport, setSelectedSport] = useState<'football' | 'basketball'>('football')

  // Balance adjustment modal
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balanceTarget, setBalanceTarget] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceNote, setBalanceNote] = useState<'add' | 'subtract'>('add')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auto-settle on mount
  useEffect(() => {
    fetch('/api/settle', { method: 'POST' }).catch(() => {})
  }, [])

  // Derived: all bets flat with player info + parlay context
  const parlayLegCounts = new Map<string, number>()
  const parlayContextMap = new Map<string, Parlay>()
  players.forEach(p => {
    p.parlays.forEach(par => {
      parlayContextMap.set(par.id, par)
      par.bets.forEach(b => parlayLegCounts.set(par.id, par.bets.length))
    })
  })

  const allBets: PlayerBet[] = players.flatMap(p =>
    p.bets.map(b => {
      const par = b.parlayId ? parlayContextMap.get(b.parlayId) : undefined
      return {
        ...b,
        playerName: p.name,
        playerId: p.id,
        playerUsername: p.username,
        parlayTotalLegs: par ? par.bets.length : undefined,
        parlayInitialStake: par?.initialStake,
        parlayTotalOdds: par?.totalOdds,
        parlayPotential: par?.potentialReturn,
      }
    })
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const filteredBets = betsFilter === 'ALL' ? allBets : allBets.filter(b => b.status === betsFilter)

  const betsByMatch = filteredBets.reduce<Record<string, PlayerBet[]>>((acc, b) => {
    if (!acc[b.match]) acc[b.match] = []
    acc[b.match].push(b)
    return acc
  }, {})

  const betsByPlayer = filteredBets.reduce<Record<string, { player: { name: string; username: string }; bets: PlayerBet[] }>>((acc, b) => {
    if (!acc[b.playerId]) acc[b.playerId] = { player: { name: b.playerName, username: b.playerUsername }, bets: [] }
    acc[b.playerId].bets.push(b)
    return acc
  }, {})

  const pendingCount = allBets.filter(b => b.status === 'PENDING').length
  // For parlays: only count the initial stake once (leg 1), skip subsequent legs whose
  // "amount" is the running carry-forward — not real additional cash at risk.
  // For potential: parlay leg 1 carries parlayPotential (the full final return); skip other legs.
  const pendingBets = allBets.filter(b => b.status === 'PENDING')
  const totalPendingStake = pendingBets
    .filter(b => !b.parlayId || b.parlayOrder === 1)
    .reduce((s, b) => s + b.amount, 0)
  const totalPotential = pendingBets
    .filter(b => !b.parlayId || b.parlayOrder === 1)
    .reduce((s, b) => s + (b.parlayId ? (b.parlayPotential || 0) : b.potentialReturn), 0)

  // Match browser
  const fetchMatches = useCallback(async (sport: 'football' | 'basketball' = 'football') => {
    setMatchLoading(true); setMatchError('')
    try {
      const res = await fetch(`/api/matches?sport=${sport}`)
      const data = await res.json()
      if (!res.ok || data.error) { setMatchError(data.error || 'Failed'); return }
      const live = (data.live || []) as Match[]
      const upcoming = (data.matches || []) as Match[]
      setMatches([...live, ...upcoming])
    } catch { setMatchError('Network error') }
    finally { setMatchLoading(false) }
  }, [])

  function openMatchBrowser(legIdx: number | null) {
    setBrowseForLeg(legIdx)
    setShowMatchBrowser(true)
    if (matches.length === 0) fetchMatches(selectedSport)
  }

  function getToday() { return new Date().toISOString().split('T')[0] }
  function getTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

  const liveMatches = matches.filter(m => m.isLive).filter(m => {
    const q = matchSearch.toLowerCase()
    return !q || m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q) || m.league.toLowerCase().includes(q)
  })

  const filteredMatches = matches.filter(m => !m.isLive).filter(m => {
    const dateOk = selectedDate === 'today' ? m.date === getToday() : m.date === getTomorrow()
    const q = matchSearch.toLowerCase()
    return dateOk && (!q || m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q) || m.league.toLowerCase().includes(q))
  })

  const grouped = filteredMatches.reduce<Record<string, Match[]>>((acc, m) => {
    const k = `${m.country} — ${m.league}`
    if (!acc[k]) acc[k] = []
    acc[k].push(m); return acc
  }, {})

  function selectMatch(m: Match) {
    const label = `${m.home} vs ${m.away}`
    // Store fixtureDate as "YYYY-MM-DD HH:MM" already in Athens/Europe timezone
    const fDate = m.date && m.time ? `${m.date} ${m.time}` : null
    if (browseForLeg === null) {
      setBetForm(f => ({ ...f, match: label, fixtureId: m.id, fixtureDate: fDate }))
    } else {
      setParlayLegs(legs => legs.map((l, i) => i === browseForLeg ? { ...l, match: label, fixtureId: m.id, fixtureDate: fDate } : l))
    }
    setShowMatchBrowser(false)
  }

  // Parlay calculations
  function getParlayRunning() {
    let stake = Number(parlayStake) || 0
    return parlayLegs.map(leg => {
      const odds = Number(leg.odds) || 0
      const potential = odds > 0 ? stake * odds : 0
      const row = { stake, potential }
      if (odds > 0) stake = potential
      return row
    })
  }
  const parlayRunning = getParlayRunning()
  const parlayFinalPotential = parlayRunning[parlayRunning.length - 1]?.potential || 0
  const parlayTotalOdds = parlayLegs.reduce((acc, l) => acc * (Number(l.odds) || 0), 1)

  // Actions
  async function createPlayer() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...playerForm, role: 'PLAYER', balance: Number(playerForm.balance) }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowCreatePlayer(false)
      setPlayerForm({ username: '', password: '', name: '', balance: '0' })
      window.location.reload()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function createSingleBet() {
    if (!betForm.match || !betForm.amount || !betForm.odds) { setError('Fill match, amount and odds'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/bets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: betTargetId, match: betForm.match, betType: betForm.betType,
          amount: Number(betForm.amount), odds: Number(betForm.odds),
          potentialReturn: Number(betForm.amount) * Number(betForm.odds),
          notes: betForm.notes, fixtureId: betForm.fixtureId, fixtureDate: betForm.fixtureDate
        }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowAddBet(false)
      setBetForm({ match: '', betType: 'Over 2.5', amount: '', odds: '', notes: '', fixtureId: null, fixtureDate: null })
      window.location.reload()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function createParlay() {
    if (!parlayStake || Number(parlayStake) <= 0) { setError('Enter initial stake'); return }
    if (parlayLegs.some(l => !l.match || !l.odds || Number(l.odds) < 1.01)) { setError('Fill all legs with match and valid odds (≥1.01)'); return }
    setLoading(true); setError('')
    try {
      const running = getParlayRunning()
      const legs = parlayLegs.map((l, i) => ({
        match: l.match, betType: l.betType, odds: Number(l.odds),
        amount: running[i].stake, potentialReturn: running[i].potential,
        fixtureId: l.fixtureId, fixtureDate: l.fixtureDate,
      }))
      const res = await fetch('/api/parlays', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: betTargetId, initialStake: Number(parlayStake), legs }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowAddBet(false)
      setParlayStake(''); setParlayLegs([{ match:'', betType:'Over 2.5', odds:'', fixtureId:null, fixtureDate:null },{ match:'', betType:'Over 2.5', odds:'', fixtureId:null, fixtureDate:null }])
      window.location.reload()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function deletePlayer(playerId: string, playerName: string) {
    if (!confirm(`Delete player "${playerName}" and all their bets? This cannot be undone.`)) return
    await fetch(`/api/users/${playerId}`, { method: 'DELETE' })
    window.location.reload()
  }

  async function adjustBalance() {
    if (!balanceTarget || !balanceAmount || isNaN(Number(balanceAmount))) return
    setLoading(true); setError('')
    try {
      const delta = Number(balanceAmount) * (balanceNote === 'subtract' ? -1 : 1)
      const newBalance = balanceTarget.balance + delta
      const res = await fetch(`/api/users/${balanceTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: newBalance })
      })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      setShowBalanceModal(false)
      setBalanceAmount(''); setBalanceTarget(null)
      window.location.reload()
    } catch { setError('Network error') }
    finally { setLoading(false) }
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

  async function deleteParlay(parlayId: string) {
    if (!confirm('Delete this entire parlay (all legs)?')) return
    await fetch(`/api/parlays?id=${parlayId}`, { method: 'DELETE' })
    window.location.reload()
  }

  const targetPlayerName = players.find(p => p.id === betTargetId)?.name || ''

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">SubAdmin Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Welcome, {session.name}</p>
        </div>
        <button onClick={() => setShowCreatePlayer(true)} className="px-5 py-2.5 rounded-xl font-medium text-white hover:opacity-90 transition-opacity" style={{ background: 'var(--accent)' }}>
          + New Player
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Players', value: players.length, color: '#6366f1', icon: '👥' },
          { label: 'Pending Bets', value: pendingCount, color: '#f59e0b', icon: '⏳' },
          { label: 'Total Stake', value: `€${totalPendingStake.toFixed(0)}`, color: '#f97316', icon: '💰' },
          { label: 'Potential Win', value: `€${totalPotential.toFixed(0)}`, color: '#22c55e', icon: '🎯' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab('players')} className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: activeTab === 'players' ? 'var(--accent)' : 'var(--surface)', color: activeTab === 'players' ? 'white' : 'var(--muted)', border: '1px solid var(--surface2)' }}>
          👥 Players
        </button>
        <button onClick={() => setActiveTab('bets')} className="px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
          style={{ background: activeTab === 'bets' ? 'var(--accent)' : 'var(--surface)', color: activeTab === 'bets' ? 'white' : 'var(--muted)', border: '1px solid var(--surface2)' }}>
          🎯 Bets Overview
          {pendingCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500 text-white font-bold">{pendingCount}</span>}
        </button>
      </div>

      {/* ── PLAYERS TAB ── */}
      {activeTab === 'players' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {players.map(player => {
            const pending = player.bets.filter(b => b.status === 'PENDING')
            const won = player.bets.filter(b => b.status === 'WON')
            const lost = player.bets.filter(b => b.status === 'LOST')
            // Available = total balance minus pending stakes (parlay counts only leg 1)
            const pendingStake = pending
              .filter(b => !b.parlayId || b.parlayOrder === 1)
              .reduce((s, b) => s + b.amount, 0)
            const availableBalance = player.balance - pendingStake
            return (
              <div key={player.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
                      {avatar(player.name)}
                    </div>
                    <div>
                      <div className="font-semibold text-white">{player.name}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>@{player.username}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Total Balance</div>
                    <div className="font-bold text-sm" style={{ color: 'var(--muted)' }}>€{player.balance.toFixed(2)}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Available</div>
                    <div className="font-bold" style={{ color: availableBalance >= 0 ? '#22c55e' : '#ef4444' }}>€{availableBalance.toFixed(2)}</div>
                    {pendingStake > 0 && (
                      <div className="text-xs mt-0.5" style={{ color: '#f59e0b' }}>🔒 €{pendingStake.toFixed(2)} in bets</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 text-xs mb-4">
                  <span style={{ color: '#f59e0b' }}>⏳ {pending.length} pending</span>
                  <span style={{ color: '#22c55e' }}>✅ {won.length} won</span>
                  <span style={{ color: '#ef4444' }}>❌ {lost.length} lost</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setBetTargetId(player.id); setBetMode('single'); setShowAddBet(true) }}
                    className="flex-1 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>
                    + Single Bet
                  </button>
                  <button onClick={() => { setBetTargetId(player.id); setBetMode('parlay'); setShowAddBet(true) }}
                    className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--surface2)', color: '#f59e0b', border: '1px solid #f59e0b40' }}>
                    🔗 Parlay
                  </button>
                  <Link href={`/player/${player.id}`} className="px-3 py-2 rounded-lg text-xs font-medium text-center" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                    View
                  </Link>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setBalanceTarget({ id: player.id, name: player.name, balance: player.balance }); setBalanceNote('add'); setBalanceAmount(''); setShowBalanceModal(true) }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e30' }}>
                    💰 Adjust Balance
                  </button>
                  <button onClick={() => deletePlayer(player.id, player.name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                    🗑 Delete
                  </button>
                </div>
              </div>
            )
          })}
          {players.length === 0 && (
            <div className="col-span-3 text-center py-16" style={{ color: 'var(--muted)' }}>
              <div className="text-4xl mb-3">👥</div>
              <p>No players yet. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* ── BETS OVERVIEW TAB ── */}
      {activeTab === 'bets' && (
        <div>
          {/* Filter + Group controls */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface)' }}>
              {(['PENDING','ALL','WON','LOST'] as const).map(f => (
                <button key={f} onClick={() => setBetsFilter(f)} className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{ background: betsFilter === f ? 'var(--accent)' : 'transparent', color: betsFilter === f ? 'white' : 'var(--muted)' }}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface)' }}>
              <button onClick={() => setBetsGroupBy('match')} className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{ background: betsGroupBy === 'match' ? 'var(--surface2)' : 'transparent', color: betsGroupBy === 'match' ? 'white' : 'var(--muted)' }}>
                ⚽ By Match
              </button>
              <button onClick={() => setBetsGroupBy('player')} className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{ background: betsGroupBy === 'player' ? 'var(--surface2)' : 'transparent', color: betsGroupBy === 'player' ? 'white' : 'var(--muted)' }}>
                👤 By Player
              </button>
            </div>
            <div className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
              {filteredBets.length} bet{filteredBets.length !== 1 ? 's' : ''} · Stake €{filteredBets.filter(b=>!b.parlayId||b.parlayOrder===1).reduce((s,b)=>s+b.amount,0).toFixed(0)} · Potential €{filteredBets.filter(b=>!b.parlayId||b.parlayOrder===1).reduce((s,b)=>s+(b.parlayId?(b.parlayPotential||0):b.potentialReturn),0).toFixed(0)}
            </div>
          </div>

          {filteredBets.length === 0 && (
            <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
              <div className="text-4xl mb-3">📭</div>
              <p>No {betsFilter !== 'ALL' ? betsFilter.toLowerCase() : ''} bets.</p>
            </div>
          )}

          {/* GROUP BY MATCH */}
          {betsGroupBy === 'match' && Object.entries(betsByMatch)
            .sort(([, aBets], [, bBets]) => {
              // Sort match groups by earliest kick-off time (Athens TZ, stored as "YYYY-MM-DD HH:MM")
              const aDate = aBets.map(b => b.fixtureDate).filter(Boolean).sort()[0] || '9999'
              const bDate = bBets.map(b => b.fixtureDate).filter(Boolean).sort()[0] || '9999'
              return aDate.localeCompare(bDate)
            })
            .map(([matchName, bets]) => {
            // Only count parlay initial stake once per match (leg 1); skip carry-forward legs
            const matchStake = bets.filter(b => !b.parlayId || b.parlayOrder === 1).reduce((s, b) => s + b.amount, 0)
            const matchPotential = bets.filter(b => !b.parlayId || b.parlayOrder === 1).reduce((s, b) => s + (b.parlayId ? (b.parlayPotential || 0) : b.potentialReturn), 0)
            return (
              <div key={matchName} className="rounded-xl mb-4 overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                <div className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--surface2)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚽</span>
                    <span className="font-semibold text-white">{matchName}</span>
                    {(() => {
                      const t = bets.map(b => b.fixtureDate).filter(Boolean).sort()[0]
                      return t ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: '#94a3b8' }}>🕐 {t.split(' ')[1]}</span> : null
                    })()}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--muted)' }}>Stake: <b className="text-white">€{matchStake.toFixed(0)}</b></span>
                    <span style={{ color: '#22c55e' }}>Potential: <b>€{matchPotential.toFixed(0)}</b></span>
                    <span style={{ color: 'var(--muted)' }}>{bets.length} bet{bets.length > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div style={{ background: 'var(--surface)' }}>
                  {(() => {
                    // Group bets within this match by their bet line
                    const byLine: Record<string, PlayerBet[]> = {}
                    bets.forEach(b => {
                      const line = getBetLine(b.betType)
                      if (!byLine[line]) byLine[line] = []
                      byLine[line].push(b)
                    })
                    const lines = Object.entries(byLine)
                    const multiLine = lines.length > 1
                    return lines.map(([line, lineBets], lineIdx) => (
                      <div key={line}>
                        {/* Bet-line sub-header (only when multiple lines for this match) */}
                        {multiLine && (
                          <div className="flex items-center gap-2 px-5 py-1.5" style={{ background: '#0f172a', borderTop: '1px solid var(--surface2)' }}>
                            <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>{line}</span>
                            <span className="text-xs" style={{ color: '#475569' }}>· {lineBets.length} bet{lineBets.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {lineBets.map((bet, idx) => (
                          <div key={bet.id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: idx > 0 || multiLine ? '1px solid var(--surface2)' : undefined }}>
                            {/* Player avatar */}
                            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
                              {avatar(bet.playerName)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-white text-sm">{bet.playerName}</span>
                                {/* Parlay badge */}
                                {bet.parlayId && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                                    🔗 Parlay leg {bet.parlayOrder}/{bet.parlayTotalLegs}
                                  </span>
                                )}
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface2)', color: '#6366f1' }}>
                                  {bet.betType}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {bet.parlayId ? (
                                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                    {bet.parlayOrder === 1 ? `Initial €${bet.parlayInitialStake?.toFixed(0)}` : `Running €${bet.amount.toFixed(0)}`}
                                    {' '}@{bet.odds}x → <span style={{ color: '#22c55e' }}>€{bet.potentialReturn.toFixed(0)}</span>
                                    {' '}· Total: €{bet.parlayInitialStake?.toFixed(0)} @ {bet.parlayTotalOdds?.toFixed(2)}x = <span style={{ color: '#22c55e' }}>€{bet.parlayPotential?.toFixed(0)}</span>
                                  </span>
                                ) : (
                                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                    €{bet.amount.toFixed(0)} @{bet.odds}x → <span style={{ color: '#22c55e' }}>€{bet.potentialReturn.toFixed(0)}</span>
                                  </span>
                                )}
                                {bet.notes && <span className="text-xs" style={{ color: 'var(--muted)' }}>· {bet.notes}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {statusBadge(bet.status)}
                              {bet.status === 'PENDING' && (
                                <>
                                  <button onClick={() => settleBetAction(bet.id, 'WON')} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: '#22c55e20', color: '#22c55e' }}>Won</button>
                                  <button onClick={() => settleBetAction(bet.id, 'LOST')} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: '#ef444420', color: '#ef4444' }}>Lost</button>
                                </>
                              )}
                              {!bet.parlayId && (
                                <button onClick={() => deleteBet(bet.id)} className="text-xs px-2 py-1 rounded-lg" style={{ background: '#ef444410', color: '#ef4444' }}>🗑</button>
                              )}
                              {bet.parlayId && bet.parlayOrder === 1 && (
                                <button onClick={() => deleteParlay(bet.parlayId!)} className="text-xs px-2 py-1 rounded-lg" style={{ background: '#ef444410', color: '#ef4444' }} title="Delete entire parlay">🗑 Parlay</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )
          })}

          {/* GROUP BY PLAYER */}
          {betsGroupBy === 'player' && Object.entries(betsByPlayer).map(([playerId, { player, bets }]) => {
            const stake = bets.reduce((s, b) => s + b.amount, 0)
            const potential = bets.reduce((s, b) => s + b.potentialReturn, 0)
            return (
              <div key={playerId} className="rounded-xl mb-4 overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                <div className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--surface2)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
                      {avatar(player.name)}
                    </div>
                    <div>
                      <span className="font-semibold text-white">{player.name}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>@{player.username}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--muted)' }}>€{stake.toFixed(0)}</span>
                    <span style={{ color: '#22c55e' }}>→ €{potential.toFixed(0)}</span>
                  </div>
                </div>
                <div style={{ background: 'var(--surface)' }}>
                  {bets.map((bet, idx) => (
                    <div key={bet.id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: idx > 0 ? '1px solid var(--surface2)' : undefined }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white text-sm">{bet.match}</span>
                          {bet.parlayId && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                              🔗 Leg {bet.parlayOrder}/{bet.parlayTotalLegs}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: '#6366f1' }}>{bet.betType}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                          {bet.parlayId
                            ? `${bet.parlayOrder === 1 ? 'Initial' : 'Running'} €${bet.amount.toFixed(0)} @${bet.odds}x → €${bet.potentialReturn.toFixed(0)}`
                            : `€${bet.amount.toFixed(0)} @${bet.odds}x → €${bet.potentialReturn.toFixed(0)}`}
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
                        {!bet.parlayId && <button onClick={() => deleteBet(bet.id)} className="text-xs px-2 py-1 rounded-lg" style={{ background: '#ef444410', color: '#ef4444' }}>🗑</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MATCH BROWSER MODAL ── */}
      {showMatchBrowser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-full max-w-2xl rounded-2xl flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)', maxHeight: '85vh' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--surface2)' }}>
              <h3 className="font-bold text-white">Browse Matches {browseForLeg !== null ? `(Leg ${browseForLeg + 1})` : ''}</h3>
              <button onClick={() => setShowMatchBrowser(false)} style={{ color: 'var(--muted)' }} className="text-xl leading-none">×</button>
            </div>
            <div className="px-5 py-3 flex gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--surface2)' }}>
              {/* Sport toggle */}
              <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface2)' }}>
                {([['football','⚽ Football'],['basketball','🏀 Basketball']] as const).map(([s, label]) => (
                  <button key={s} onClick={() => { setSelectedSport(s); setMatches([]); fetchMatches(s) }}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                    style={{ background: selectedSport === s ? 'var(--accent)' : 'transparent', color: selectedSport === s ? 'white' : 'var(--muted)' }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Date toggle (only for upcoming) */}
              <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface2)' }}>
                {(['today','tomorrow'] as const).map(d => (
                  <button key={d} onClick={() => setSelectedDate(d)} className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all"
                    style={{ background: selectedDate === d ? 'var(--accent)' : 'transparent', color: selectedDate === d ? 'white' : 'var(--muted)' }}>
                    {d}
                  </button>
                ))}
              </div>
              <input placeholder="Search team or league…" value={matchSearch} onChange={e => setMatchSearch(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg text-sm text-white outline-none" style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
              <button onClick={() => fetchMatches(selectedSport)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>↻ Refresh</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3">
              {matchLoading && <p className="text-center py-8" style={{ color: 'var(--muted)' }}>Loading matches…</p>}
              {matchError && <p className="text-center py-8 text-red-400">{matchError}</p>}
              {/* LIVE section */}
              {!matchLoading && liveMatches.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block"/>
                    <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Live Now ({liveMatches.length})</p>
                  </div>
                  {liveMatches.map(m => (
                    <button key={m.id} onClick={() => selectMatch(m)} className="w-full text-left rounded-lg px-4 py-3 mb-1 flex items-center justify-between hover:opacity-90 transition-opacity"
                      style={{ background: '#ef444415', border: '1px solid #ef444430' }}>
                      <div>
                        <span className="text-white text-sm font-medium">{m.home} vs {m.away}</span>
                        <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>{m.league}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.homeScore !== undefined && (
                          <span className="font-bold text-white px-2 py-0.5 rounded" style={{ background: '#ef444430' }}>
                            {m.homeScore} - {m.awayScore}
                          </span>
                        )}
                        <span className="text-xs text-red-400">{m.elapsed}&apos;</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {/* Upcoming section */}
              {!matchLoading && !matchError && Object.entries(grouped).map(([league, ms]) => (
                <div key={league} className="mb-4">
                  <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--muted)' }}>{league}</p>
                  {ms.map(m => (
                    <button key={m.id} onClick={() => selectMatch(m)} className="w-full text-left rounded-lg px-4 py-3 mb-1 flex items-center justify-between hover:opacity-90 transition-opacity"
                      style={{ background: 'var(--surface2)' }}>
                      <span className="text-white text-sm font-medium">{m.home} vs {m.away}</span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{m.date === getToday() ? 'Today' : 'Tomorrow'} {m.time}</span>
                    </button>
                  ))}
                </div>
              ))}
              {!matchLoading && !matchError && Object.keys(grouped).length === 0 && liveMatches.length === 0 && (
                <p className="text-center py-8" style={{ color: 'var(--muted)' }}>No matches found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD BET MODAL ── */}
      {showAddBet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-lg rounded-2xl flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--surface2)' }}>
              <div>
                <h2 className="text-lg font-bold text-white">Add Bet</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Player: <b className="text-white">{targetPlayerName}</b></p>
              </div>
              <button onClick={() => { setShowAddBet(false); setError('') }} style={{ color: 'var(--muted)' }} className="text-2xl leading-none">×</button>
            </div>

            {/* Mode toggle */}
            <div className="px-6 pt-4">
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                <button onClick={() => setBetMode('single')} className="flex-1 py-2.5 text-sm font-medium transition-all"
                  style={{ background: betMode === 'single' ? 'var(--accent)' : 'var(--surface2)', color: betMode === 'single' ? 'white' : 'var(--muted)' }}>
                  Single Bet
                </button>
                <button onClick={() => setBetMode('parlay')} className="flex-1 py-2.5 text-sm font-medium transition-all"
                  style={{ background: betMode === 'parlay' ? '#f59e0b' : 'var(--surface2)', color: betMode === 'parlay' ? 'white' : 'var(--muted)' }}>
                  🔗 Parlay / Accumulator
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {/* SINGLE BET FORM */}
              {betMode === 'single' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Match</label>
                    <div className="flex gap-2">
                      <input value={betForm.match} onChange={e => setBetForm(f => ({ ...f, match: e.target.value }))}
                        placeholder="e.g. Arsenal vs Chelsea" className="flex-1 px-4 py-2.5 rounded-lg text-white outline-none text-sm"
                        style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                      <button onClick={() => openMatchBrowser(null)} className="px-3 py-2.5 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: 'white' }}>Browse</button>
                    </div>
                    {betForm.fixtureId && <p className="text-xs mt-1" style={{ color: '#22c55e' }}>✓ Fixture #{betForm.fixtureId} — auto-settle enabled</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Bet Type</label>
                    <select value={betForm.betType} onChange={e => setBetForm(f => ({ ...f, betType: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg text-white outline-none" style={{ background: 'var(--surface2)', border: '1px solid #334155' }}>
                      {BET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Stake (€)</label>
                      <input type="number" value={betForm.amount} onChange={e => setBetForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="50" className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                        style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Odds</label>
                      <input type="number" step="0.01" value={betForm.odds} onChange={e => setBetForm(f => ({ ...f, odds: e.target.value }))}
                        placeholder="2.00" className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                        style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                    </div>
                  </div>
                  {betForm.amount && betForm.odds && (
                    <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--surface2)' }}>
                      Potential return: <span className="font-bold" style={{ color: '#22c55e' }}>€{(Number(betForm.amount) * Number(betForm.odds)).toFixed(2)}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Notes (optional)</label>
                    <input value={betForm.notes} onChange={e => setBetForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Any notes…" className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                      style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                  </div>
                </>
              )}

              {/* PARLAY FORM */}
              {betMode === 'parlay' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Initial Stake (€)</label>
                    <input type="number" value={parlayStake} onChange={e => setParlayStake(e.target.value)}
                      placeholder="50" className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                      style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                  </div>

                  {/* Parlay legs */}
                  <div className="space-y-3">
                    {parlayLegs.map((leg, i) => {
                      const run = parlayRunning[i]
                      return (
                        <div key={i} className="rounded-xl p-4 relative" style={{ background: 'var(--surface2)', border: '1px solid #f59e0b30' }}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                              🔗 Leg {i + 1}
                              {run.stake > 0 && ` · Running stake: €${run.stake.toFixed(0)}`}
                              {run.potential > 0 && ` → €${run.potential.toFixed(0)}`}
                            </span>
                            {parlayLegs.length > 2 && (
                              <button onClick={() => setParlayLegs(ls => ls.filter((_, j) => j !== i))} className="text-xs" style={{ color: '#ef4444' }}>Remove</button>
                            )}
                          </div>
                          <div className="flex gap-2 mb-2">
                            <input value={leg.match} onChange={e => setParlayLegs(ls => ls.map((l, j) => j === i ? { ...l, match: e.target.value } : l))}
                              placeholder="Match…" className="flex-1 px-3 py-2 rounded-lg text-white text-sm outline-none"
                              style={{ background: 'var(--bg)', border: '1px solid #334155' }} />
                            <button onClick={() => openMatchBrowser(i)} className="px-3 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Browse</button>
                          </div>
                          {leg.fixtureId && <p className="text-xs mb-2" style={{ color: '#22c55e' }}>✓ Fixture #{leg.fixtureId}</p>}
                          <div className="flex gap-2">
                            <select value={leg.betType} onChange={e => setParlayLegs(ls => ls.map((l, j) => j === i ? { ...l, betType: e.target.value } : l))}
                              className="flex-1 px-3 py-2 rounded-lg text-white text-sm outline-none" style={{ background: 'var(--bg)', border: '1px solid #334155' }}>
                              {BET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="number" step="0.01" value={leg.odds} onChange={e => setParlayLegs(ls => ls.map((l, j) => j === i ? { ...l, odds: e.target.value } : l))}
                              placeholder="Odds" className="w-24 px-3 py-2 rounded-lg text-white text-sm outline-none"
                              style={{ background: 'var(--bg)', border: '1px solid #334155' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <button onClick={() => setParlayLegs(ls => [...ls, { match: '', betType: 'Over 2.5', odds: '', fixtureId: null, fixtureDate: null }])}
                    className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--surface2)', color: '#f59e0b', border: '1px dashed #f59e0b50' }}>
                    + Add Leg
                  </button>

                  {/* Parlay summary */}
                  {parlayStake && parlayFinalPotential > 0 && (
                    <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid #f59e0b30' }}>
                      <div className="text-sm font-semibold text-white mb-2">📊 Parlay Summary</div>
                      <div className="space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
                        {parlayRunning.map((r, i) => (
                          <div key={i}>Leg {i+1}: €{r.stake.toFixed(0)} @ {parlayLegs[i].odds || '?'}x → <span style={{ color: '#22c55e' }}>€{r.potential.toFixed(0)}</span></div>
                        ))}
                        <div className="border-t mt-2 pt-2" style={{ borderColor: '#334155' }}>
                          <span className="text-white font-semibold">Initial €{parlayStake} · Total odds {parlayTotalOdds.toFixed(2)}x · Win <span style={{ color: '#22c55e' }}>€{parlayFinalPotential.toFixed(0)}</span></span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}
            </div>

            <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid var(--surface2)' }}>
              <button onClick={() => { setShowAddBet(false); setError('') }} className="flex-1 py-2.5 rounded-xl font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
              <button onClick={betMode === 'single' ? createSingleBet : createParlay} disabled={loading}
                className="flex-1 py-2.5 rounded-xl font-medium text-white disabled:opacity-50"
                style={{ background: betMode === 'parlay' ? '#f59e0b' : 'var(--accent)' }}>
                {loading ? 'Saving…' : betMode === 'parlay' ? `Create Parlay (${parlayLegs.length} legs)` : 'Create Bet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BALANCE ADJUSTMENT MODAL ── */}
      {showBalanceModal && balanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <h2 className="text-lg font-bold text-white mb-1">Adjust Balance</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
              {balanceTarget.name} · Current: <span style={{ color: balanceTarget.balance >= 0 ? '#22c55e' : '#ef4444' }}>€{balanceTarget.balance.toFixed(2)}</span>
            </p>
            <div className="space-y-4">
              {/* Add / Subtract toggle */}
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface2)' }}>
                <button onClick={() => setBalanceNote('add')} className="flex-1 py-2.5 text-sm font-medium transition-all"
                  style={{ background: balanceNote === 'add' ? '#22c55e' : 'var(--surface2)', color: balanceNote === 'add' ? 'white' : 'var(--muted)' }}>
                  + Add
                </button>
                <button onClick={() => setBalanceNote('subtract')} className="flex-1 py-2.5 text-sm font-medium transition-all"
                  style={{ background: balanceNote === 'subtract' ? '#ef4444' : 'var(--surface2)', color: balanceNote === 'subtract' ? 'white' : 'var(--muted)' }}>
                  − Subtract
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Amount (€)</label>
                <input type="number" min="0" step="0.01" placeholder="e.g. 50"
                  value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
              </div>
              {balanceAmount && !isNaN(Number(balanceAmount)) && (
                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--surface2)' }}>
                  New balance: <span className="font-bold" style={{ color: (balanceTarget.balance + Number(balanceAmount) * (balanceNote === 'subtract' ? -1 : 1)) >= 0 ? '#22c55e' : '#ef4444' }}>
                    €{(balanceTarget.balance + Number(balanceAmount) * (balanceNote === 'subtract' ? -1 : 1)).toFixed(2)}
                  </span>
                </div>
              )}
              {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowBalanceModal(false); setError('') }} className="flex-1 py-2.5 rounded-xl font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
                <button onClick={adjustBalance} disabled={loading || !balanceAmount} className="flex-1 py-2.5 rounded-xl font-medium text-white disabled:opacity-50"
                  style={{ background: balanceNote === 'add' ? '#22c55e' : '#ef4444' }}>
                  {loading ? 'Saving…' : `${balanceNote === 'add' ? 'Add' : 'Subtract'} €${balanceAmount || '0'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE PLAYER MODAL ── */}
      {showCreatePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <h2 className="text-lg font-bold text-white mb-5">Create New Player</h2>
            <div className="space-y-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'Nikos Papadopoulos' },
                { label: 'Username', key: 'username', type: 'text', placeholder: 'nikos123' },
                { label: 'Password', key: 'password', type: 'password', placeholder: 'Min 6 chars' },
                { label: 'Starting Balance (€)', key: 'balance', type: 'number', placeholder: '0' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(playerForm as any)[f.key]}
                    onChange={e => setPlayerForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg text-white outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid #334155' }} />
                </div>
              ))}
              {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowCreatePlayer(false); setError('') }} className="flex-1 py-2.5 rounded-xl font-medium" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>Cancel</button>
                <button onClick={createPlayer} disabled={loading} className="flex-1 py-2.5 rounded-xl font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                  {loading ? 'Creating…' : 'Create Player'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
