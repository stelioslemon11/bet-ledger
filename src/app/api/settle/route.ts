import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { evaluateBetResult, settleBet } from '@/lib/bets'

const API_KEY = process.env.FOOTBALL_API_KEY || ''
const BASE_URL = 'https://v3.football.api-sports.io'

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
  const fixtures = json.response || []
  const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD']
  const finished = fixtures.filter((f: any) => finishedStatuses.includes(f.fixture.status.short))

  let settled = 0
  const results: string[] = []

  for (const fixture of finished) {
    const fixtureId = fixture.fixture.id
    const homeGoals: number = fixture.goals.home ?? 0
    const awayGoals: number = fixture.goals.away ?? 0
    const matchName = `${fixture.teams.home.name} vs ${fixture.teams.away.name} (${homeGoals}-${awayGoals})`

    const toSettle = pendingBets.filter(b => b.fixtureId === fixtureId)
    for (const bet of toSettle) {
      const won = evaluateBetResult(bet.betType, homeGoals, awayGoals)
      if (won === null) {
        results.push(`SKIP: ${matchName} — ${bet.betType} (unsupported)`)
        continue
      }
      await settleBet(bet.id, won ? 'WON' : 'LOST')
      results.push(`${won ? '✅ WON' : '❌ LOST'}: ${matchName} — ${bet.betType}`)
      settled++
    }
  }

  return {
    message: `Checked ${fixtureIds.length} fixtures, ${finished.length} finished → settled ${settled} bets`,
    settled,
    results,
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
