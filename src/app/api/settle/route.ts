import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { evaluateBetResult, settleBet } from '@/lib/bets'

const API_KEY = process.env.FOOTBALL_API_KEY || ''
const BASE_URL = 'https://v3.football.api-sports.io'

let settleCache: { ts: number } | null = null
const SETTLE_TTL = 15 * 60 * 1000

export async function POST() {
  if (settleCache && Date.now() - settleCache.ts < SETTLE_TTL) {
    return NextResponse.json({ message: 'Skipped (too soon)' })
  }

  if (!API_KEY) return NextResponse.json({ message: 'No API key configured' })

  try {
    const pendingBets = await prisma.bet.findMany({
      where: { status: 'PENDING', fixtureId: { not: null } },
    })

    if (pendingBets.length === 0) {
      settleCache = { ts: Date.now() }
      return NextResponse.json({ message: 'No pending bets with fixture IDs' })
    }

    const fixtureIds = [...new Set(pendingBets.map(b => b.fixtureId).filter(Boolean))]
    const idsParam = fixtureIds.join('-')

    const res = await fetch(`${BASE_URL}/fixtures?ids=${idsParam}`, {
      headers: {
        'x-apisports-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) return NextResponse.json({ error: `API error ${res.status}` }, { status: 500 })

    const json = await res.json()
    const fixtures = json.response || []

    const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD']
    const finished = fixtures.filter((f: any) => finishedStatuses.includes(f.fixture.status.short))

    let settled = 0
    for (const fixture of finished) {
      const fixtureId = fixture.fixture.id
      const homeGoals: number = fixture.goals.home ?? 0
      const awayGoals: number = fixture.goals.away ?? 0

      const toSettle = pendingBets.filter(b => b.fixtureId === fixtureId)
      for (const bet of toSettle) {
        const won = evaluateBetResult(bet.betType, homeGoals, awayGoals)
        if (won === null) continue
        await settleBet(bet.id, won ? 'WON' : 'LOST')
        settled++
      }
    }

    settleCache = { ts: Date.now() }
    return NextResponse.json({
      message: `Checked ${finished.length} finished fixtures, settled ${settled} bets`,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// Also allow GET for easy manual trigger
export async function GET() {
  return POST()
}
