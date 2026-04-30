import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { evaluateBetResult, settleBet } from '@/lib/bets'

const API_KEY = process.env.FOOTBALL_API_KEY || ''
const FOOTBALL_URL = 'https://v3.football.api-sports.io'
const BASKETBALL_URL = 'https://v1.basketball.api-sports.io'

const FT_STATUSES    = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO'])
// For HT bets — halftime score is available from HT onwards
const HT_STATUSES    = new Set(['HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN', 'AWD', 'WO'])

function isHtBet(betType: string) { return /ht/i.test(betType) }

async function apiFetch(url: string) {
  const res = await fetch(url, {
    headers: { 'x-apisports-key': API_KEY, 'x-rapidapi-host': url.includes('basketball') ? 'v1.basketball.api-sports.io' : 'v3.football.api-sports.io' },
    next: { revalidate: 0 },
  })
  if (!res.ok) return null
  return res.json()
}

async function runSettle() {
  if (!API_KEY) return { message: 'No API key configured', settled: 0 }

  const pendingBets = await prisma.bet.findMany({
    where: { status: 'PENDING', fixtureId: { not: null } },
  })

  if (pendingBets.length === 0) {
    return { message: 'No pending bets with fixture IDs to check', settled: 0 }
  }

  const fixtureIds = Array.from(new Set(
    pendingBets.map(b => b.fixtureId).filter(Boolean) as number[]
  ))

  // ── 1. Try football API ──────────────────────────────────────────
  const footballJson = await apiFetch(`${FOOTBALL_URL}/fixtures?ids=${fixtureIds.join('-')}`)
  const footballFixtures: any[] = footballJson?.response || []
  const foundIds = new Set(footballFixtures.map((f: any) => f.fixture.id as number))

  // ── 2. Try basketball API for IDs not found in football ──────────
  const basketballIds = fixtureIds.filter(id => !foundIds.has(id))
  let basketballFixtures: any[] = []
  if (basketballIds.length > 0) {
    // Basketball API: fetch each game individually (no bulk ids= endpoint)
    const fetches = await Promise.all(
      basketballIds.map(id => apiFetch(`${BASKETBALL_URL}/games?id=${id}`))
    )
    basketballFixtures = fetches.flatMap(j => j?.response || [])
  }

  let settled = 0
  const results: string[] = []
  const waiting: string[] = []

  // ── 3. Settle football fixtures ──────────────────────────────────
  for (const fixture of footballFixtures) {
    const fixtureId: number = fixture.fixture.id
    const status: string   = fixture.fixture.status.short
    const homeGoals: number = fixture.goals.home ?? 0
    const awayGoals: number = fixture.goals.away ?? 0
    const htHome: number | undefined = fixture.score?.halftime?.home ?? undefined
    const htAway: number | undefined = fixture.score?.halftime?.away ?? undefined
    const label = `${fixture.teams.home.name} vs ${fixture.teams.away.name} (${homeGoals}-${awayGoals})`

    const betsForFixture = pendingBets.filter(b => b.fixtureId === fixtureId)
    for (const bet of betsForFixture) {
      const ht = isHtBet(bet.betType)
      if (ht && !HT_STATUSES.has(status)) { waiting.push(`⏳ ${label} [${status}] — ${bet.betType}`); continue }
      if (!ht && !FT_STATUSES.has(status)) { waiting.push(`⏳ ${label} [${status}] — ${bet.betType}`); continue }

      const won = ht
        ? evaluateBetResult(bet.betType, homeGoals, awayGoals, htHome, htAway)
        : evaluateBetResult(bet.betType, homeGoals, awayGoals)

      if (won === null) { results.push(`⚠️ SKIP: ${label} — "${bet.betType}" not recognised`); continue }
      await settleBet(bet.id, won ? 'WON' : 'LOST')
      results.push(`${won ? '✅ WON' : '❌ LOST'}: ${label} — ${bet.betType}`)
      settled++
    }
  }

  // ── 4. Settle basketball fixtures ────────────────────────────────
  for (const game of basketballFixtures) {
    const fixtureId: number = game.id
    const status: string = game.status?.short || ''
    // Basketball final statuses
    const isFinished = status === 'FT' || status === 'AOT' || status === 'POST'
    const homeGoals: number = game.scores?.home?.total ?? 0
    const awayGoals: number = game.scores?.away?.total ?? 0
    const label = `${game.teams?.home?.name ?? '?'} vs ${game.teams?.away?.name ?? '?'} (${homeGoals}-${awayGoals})`

    const betsForFixture = pendingBets.filter(b => b.fixtureId === fixtureId)
    for (const bet of betsForFixture) {
      if (!isFinished) { waiting.push(`⏳ 🏀 ${label} [${status}] — ${bet.betType}`); continue }

      const won = evaluateBetResult(bet.betType, homeGoals, awayGoals)
      if (won === null) { results.push(`⚠️ SKIP: 🏀 ${label} — "${bet.betType}" not recognised`); continue }
      await settleBet(bet.id, won ? 'WON' : 'LOST')
      results.push(`${won ? '✅ WON' : '❌ LOST'}: 🏀 ${label} — ${bet.betType}`)
      settled++
    }
  }

  // ── 5. Report IDs not found in either API ────────────────────────
  const allFoundIds = new Set([
    ...footballFixtures.map((f: any) => f.fixture.id),
    ...basketballFixtures.map((g: any) => g.id),
  ])
  const notFoundIds = fixtureIds.filter(id => !allFoundIds.has(id))
  for (const id of notFoundIds) {
    const bets = pendingBets.filter(b => b.fixtureId === id)
    for (const bet of bets) {
      results.push(`⚠️ NOT FOUND: fixture #${id} (${bet.match}) — bet not in football or basketball API`)
    }
  }

  const allLog = [...results, ...waiting]
  return {
    message: `Checked ${fixtureIds.length} fixture${fixtureIds.length !== 1 ? 's' : ''} (${footballFixtures.length} ⚽ + ${basketballFixtures.length} 🏀) → settled ${settled} bet${settled !== 1 ? 's' : ''}${waiting.length > 0 ? `, ${waiting.length} in progress` : ''}`,
    settled,
    results: allLog,
    pendingWithFixture: pendingBets.length,
  }
}

export async function POST() {
  try { return NextResponse.json(await runSettle()) }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 500 }) }
}

export async function GET() {
  try { return NextResponse.json(await runSettle()) }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 500 }) }
}
