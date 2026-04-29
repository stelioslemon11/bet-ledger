'use client'
import { useState } from 'react'
import Link from 'next/link'

type Bet = { id: string; match: string; betType: string; amount: number; odds: number; potentialReturn: number; status: string; createdAt: string; notes?: string; settledAt?: string }
type User = { id: string; username: string; name: string; balance: number; role: string; bets: Bet[] }
type Session = { userId: string; username: string; role: string; name: string }

export default function PlayerClient({ user, session }: { user: User; session: Session }) {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'WON' | 'LOST'>('ALL')

  const isOwnerOrAbove = session.role !== 'PLAYER' || session.userId === user.id
  const canSettle = session.role === 'ADMIN' || session.role === 'SUBADMIN'

  const filtered = user.bets.filter(b => filter === 'ALL' || b.status === filter)

  const pendingBets = user.bets.filter(b => b.status === 'PENDING')
  const wonBets = user.bets.filter(b => b.status === 'WON')
  const lostBets = user.bets.filter(b => b.status === 'LOST')
  const totalStake = pendingBets.reduce((s, b) => s + b.amount, 0)
  const totalPotential = pendingBets.reduce((s, b) => s + b.potentialReturn, 0)
  const totalWon = wonBets.reduce((s, b) => s + b.potentialReturn, 0)
  const totalLost = lostBets.reduce((s, b) => s + b.amount, 0)

  async function settleBet(betId: string, status: 'WON' | 'LOST') {
    await fetch(`/api/bets/${betId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    window.location.reload()
  }

  const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: '#f59e0b15', color: '#f59e0b', label: '⏳ Pending' },
    WON: { bg: '#22c55e15', color: '#22c55e', label: '✅ Won' },
    LOST: { bg: '#ef444415', color: '#ef4444', label: '❌ Lost' },
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back button for admins/subadmins */}
      {session.role !== 'PLAYER' && (
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm mb-6 hover:opacity-80" style={{ color: 'var(--muted)' }}>
          ← Back to Dashboard
        </Link>
      )}

      {/* Player Header */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{user.name}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>@{user.username}</p>
          </div>
          <div className="text-right">
            <div className="text-sm" style={{ color: 'var(--muted)' }}>Current Balance</div>
            <div className="text-3xl font-bold mt-1" style={{ color: user.balance >= 0 ? '#22c55e' : '#ef4444' }}>
              €{user.balance.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { label: 'Pending Stake', val: `€${totalStake.toFixed(2)}`, color: '#f59e0b' },
            { label: 'Potential Win', val: `€${totalPotential.toFixed(2)}`, color: '#22d3ee' },
            { label: 'Total Won', val: `€${totalWon.toFixed(2)}`, color: '#22c55e' },
            { label: 'Total Lost', val: `€${totalLost.toFixed(2)}`, color: '#ef4444' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: 'var(--surface2)' }}>
              <div className="font-bold text-lg" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bets section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Bet History</h2>
        <div className="flex gap-2">
          {(['ALL', 'PENDING', 'WON', 'LOST'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: filter === f ? (f === 'ALL' ? 'var(--accent)' : f === 'PENDING' ? '#f59e0b' : f === 'WON' ? '#22c55e' : '#ef4444') : 'var(--surface)',
                color: filter === f ? 'white' : 'var(--muted)',
                border: '1px solid var(--surface2)'
              }}>
              {f} {f !== 'ALL' && `(${user.bets.filter(b => b.status === f).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(bet => {
          const cfg = statusConfig[bet.status]
          return (
            <div key={bet.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: `1px solid ${bet.status === 'PENDING' ? '#f59e0b20' : bet.status === 'WON' ? '#22c55e20' : '#ef444420'}` }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-white">{bet.match}</span>
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>{bet.betType}</span>
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  {bet.notes && <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>{bet.notes}</p>}
                  <div className="flex gap-5 mt-3 text-sm">
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Stake </span>
                      <span className="font-medium text-white">€{bet.amount.toFixed(2)}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Odds </span>
                      <span className="font-medium text-white">@{bet.odds.toFixed(2)}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Return </span>
                      <span className="font-medium" style={{ color: '#22c55e' }}>€{bet.potentialReturn.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                    {new Date(bet.createdAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Settle buttons for subadmins/admins on pending bets */}
                {canSettle && bet.status === 'PENDING' && (
                  <div className="flex flex-col gap-2 min-w-[100px]">
                    <button onClick={() => settleBet(bet.id, 'WON')}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
                      style={{ background: '#22c55e' }}>✅ Won</button>
                    <button onClick={() => settleBet(bet.id, 'LOST')}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
                      style={{ background: '#ef4444' }}>❌ Lost</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--surface2)' }}>
            <div className="text-4xl mb-3">📋</div>
            <p className="text-white font-medium">No bets found</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {filter === 'ALL' ? 'No bets have been recorded yet' : `No ${filter.toLowerCase()} bets`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
