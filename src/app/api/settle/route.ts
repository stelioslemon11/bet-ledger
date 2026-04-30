import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { evaluateBetResult, settleBet } from '@/lib/bets'

const API_KEY = process.env.FOOTBALL_API_KEY || ''
const BASE_URL = 'https://v3.football.api-sports.io'

// Statuses where full-time result is final
const FT_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO']
// Statuses where halftime score is available (HT break, 2nd half in progress, or finished)
const HT_AVAILABLE_STATUSES = ['HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN', 'AWD', 'WO']

function isHtBet(betType: string) {
  return /ht/i.test(betType)
}

async function runSettle() {
  if (!API_KEY) return { message: 'No API key configured', settled: 0 }

  const pendingBets = await prisma.bet.findMany({
    where: { status: 'PENDING', fixtureId: { not: null } },
  })

  if (pendingBets.length === 0) {
    return { message: 'No pending bets with fixture IDs to check', settled: 0 }
  }

  const fixtureIds = Array.from(new Set(pendingBets.map(b => b.fixtureId).filter(Boolean) as number[]))
  const idsParam = fixtureIds.join('-')

  const res = await fetch(`${BASE_URL}/fixtures?ids=${idsParam}`, {
    headers: { 'x-apisports-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' },
    next: { revalidate: 0 },
  })

  if (!res.ok) return { error: `API error ${res.status}`, settled: 0 }

  const json = await res.json()
  const fixtures: any[] = json.response || []

  let settled = 0
  const results: string[] = []
  const skipped: string[] = []

  for (const fixture of fixtures) {
    const fixtureId: number = fixture.fixture.id
    const status: string = fixture.fixture.status.short
    const homeGoals: number = fixture.goals.home ?? 0
    const awayGoals: number = fixture.goals.away ?? 0
    const htHome: number | undefined = fixture.score?.halftime?.home ?? undefined
    const htAway: number | undefined = fixture.score?.halftime?.away ?? undefined
    const matchName = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`
    const score = `(${homeGoals}-${awayGoals}${htHome !== undefined ? ` | HT:${htHome}-${htAway}` : ''})`

    const toSettle = pendingBets.filter(b => b.fixtureId === fixtureId)

    for (const bet of toSettle) {
      const htBet = isHtBet(bet.betType)

      // Decide if we can evaluate this bet yet
      const canEvaluate = htBet
        ? HT_AVAILABLE_STATUSES.includes(status)
        : FT_STATUSES.includes(status)

      if (!canEvaluate) {
        skipped.push(`⏳ WAIT: ${matchName} [${status}] — ${bet.betType}`)
        continue
      }

      const won = htBet
        ? evaluateBetResult(bet.betType, homeGoals, awayGoals, htHome, htAway)
        : evaluateBetResult(bet.betType, homeGoals, awayGoals)

      if (won === null) {
        results.push(`⚠️ SKIP: ${matchName} ${score} — "${bet.betType}" not recognised`)
        continue
      }

      await settleBet(bet.id, won ? 'WON' : 'LOST')
      results.push(`${won ? '✅ WON' : '❌ LOST'}: ${matchName} ${score} — ${bet.betType}`)
      settled++
    }
  }

  const waitingCount = skipped.length
  const allResults = [...results, ...skipped]

  return {
    message: `Checked ${fixtureIds.length} fixtures → settled ${settled} bet${settled !== 1 ? 's' : ''}${waitingCount > 0 ? `, ${waitingCount} still in progress` : ''}`,
    settled,
    results: allResults,
    pendingWithFixture: pendingBets.length,
  }
}

export async function POST() {
  try {
    return NextResponse.json(await runSettle())
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET() {
  try {
    return NextResponse.json(await runSettle())
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
