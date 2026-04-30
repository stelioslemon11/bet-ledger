import { NextResponse } from 'next/server'

const API_KEY = process.env.FOOTBALL_API_KEY || ''
const FOOTBALL_URL = 'https://v3.football.api-sports.io'
const BASKETBALL_URL = 'https://v1.basketball.api-sports.io'

const UPCOMING_TTL = 15 * 60 * 1000
const LIVE_TTL = 2 * 60 * 1000

export type Match = {
  id: number
  league: string
  country: string
  home: string
  away: string
  date: string
  time: string
  status: string
  elapsed?: number
  homeScore?: number
  awayScore?: number
  isLive: boolean
  sport: 'football' | 'basketball'
}

// Separate caches per sport
const cache: Record<string, { upcoming: { data: Match[]; ts: number } | null; live: { data: Match[]; ts: number } | null }> = {
  football: { upcoming: null, live: null },
  basketball: { upcoming: null, live: null },
}

const FOOTBALL_LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'BREAK'])
const FOOTBALL_UPCOMING = new Set(['NS', 'TBD', 'SUSP', 'PST'])
const BASKETBALL_LIVE = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'HT', 'BT', 'LIVE'])
const BASKETBALL_UPCOMING = new Set(['NS', 'TBD'])

function getDateString(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function athensTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' })
}

function toFootballMatch(f: any, isLive: boolean): Match {
  return {
    id: f.fixture.id,
    league: f.league.name,
    country: f.league.country,
    home: f.teams.home.name,
    away: f.teams.away.name,
    date: f.fixture.date?.split('T')[0] || '',
    time: f.fixture.date ? athensTime(f.fixture.date) : '',
    status: f.fixture.status.short,
    elapsed: f.fixture.status.elapsed ?? undefined,
    homeScore: isLive ? (f.goals?.home ?? undefined) : undefined,
    awayScore: isLive ? (f.goals?.away ?? undefined) : undefined,
    isLive,
    sport: 'football',
  }
}

function toBasketballMatch(g: any, isLive: boolean): Match {
  const dateStr = g.date || g.game?.date || ''
  return {
    id: g.id ?? g.game?.id ?? 0,
    league: g.league?.name || g.league || '',
    country: g.country?.name || g.country || '',
    home: g.teams?.home?.name || '',
    away: g.teams?.away?.name || '',
    date: dateStr ? dateStr.split('T')[0] : '',
    time: dateStr ? athensTime(dateStr) : (g.time || ''),
    status: g.status?.short || g.status?.long || '',
    elapsed: g.status?.timer ?? undefined,
    homeScore: isLive ? (g.scores?.home?.total ?? undefined) : undefined,
    awayScore: isLive ? (g.scores?.away?.total ?? undefined) : undefined,
    isLive,
    sport: 'basketball',
  }
}

async function apiFetch(url: string) {
  const res = await fetch(url, {
    headers: { 'x-apisports-key': API_KEY },
    next: { revalidate: 0 },
  })
  if (!res.ok) return null
  return res.json()
}

// ── FOOTBALL ──────────────────────────────────────────────
async function fetchFootballUpcoming(): Promise<Match[]> {
  if (cache.football.upcoming && Date.now() - cache.football.upcoming.ts < UPCOMING_TTL) return cache.football.upcoming.data
  const all: Match[] = []
  for (const offset of [0, 1]) {
    const json = await apiFetch(`${FOOTBALL_URL}/fixtures?date=${getDateString(offset)}`)
    for (const f of json?.response || []) {
      if (FOOTBALL_UPCOMING.has(f.fixture.status.short)) all.push(toFootballMatch(f, false))
    }
  }
  all.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  cache.football.upcoming = { data: all, ts: Date.now() }
  return all
}

async function fetchFootballLive(): Promise<Match[]> {
  if (cache.football.live && Date.now() - cache.football.live.ts < LIVE_TTL) return cache.football.live.data
  const json = await apiFetch(`${FOOTBALL_URL}/fixtures?live=all`)
  if (!json) return cache.football.live?.data || []
  const live = (json.response || []).map((f: any) => toFootballMatch(f, true))
  cache.football.live = { data: live, ts: Date.now() }
  return live
}

// ── BASKETBALL ────────────────────────────────────────────
async function fetchBasketballUpcoming(): Promise<Match[]> {
  if (cache.basketball.upcoming && Date.now() - cache.basketball.upcoming.ts < UPCOMING_TTL) return cache.basketball.upcoming.data
  const all: Match[] = []
  for (const offset of [0, 1]) {
    const json = await apiFetch(`${BASKETBALL_URL}/games?date=${getDateString(offset)}`)
    for (const g of json?.response || []) {
      if (BASKETBALL_UPCOMING.has(g.status?.short || '')) all.push(toBasketballMatch(g, false))
    }
  }
  all.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  cache.basketball.upcoming = { data: all, ts: Date.now() }
  return all
}

async function fetchBasketballLive(): Promise<Match[]> {
  if (cache.basketball.live && Date.now() - cache.basketball.live.ts < LIVE_TTL) return cache.basketball.live.data
  const json = await apiFetch(`${BASKETBALL_URL}/games?live=all`)
  if (!json) return cache.basketball.live?.data || []
  const live = (json.response || [])
    .filter((g: any) => BASKETBALL_LIVE.has(g.status?.short || ''))
    .map((g: any) => toBasketballMatch(g, true))
  cache.basketball.live = { data: live, ts: Date.now() }
  return live
}

// ── HANDLER ───────────────────────────────────────────────
export async function GET(req: Request) {
  if (!API_KEY) return NextResponse.json({ error: 'FOOTBALL_API_KEY not set' }, { status: 500 })
  const { searchParams } = new URL(req.url)
  const sport = searchParams.get('sport') === 'basketball' ? 'basketball' : 'football'

  try {
    const [upcoming, live] = sport === 'basketball'
      ? await Promise.all([fetchBasketballUpcoming(), fetchBasketballLive()])
      : await Promise.all([fetchFootballUpcoming(), fetchFootballLive()])
    return NextResponse.json({ matches: upcoming, live, sport })
  } catch (err) {
    const c = cache[sport]
    if (c.upcoming?.data.length || c.live?.data.length) {
      return NextResponse.json({ matches: c.upcoming?.data || [], live: c.live?.data || [], sport })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
