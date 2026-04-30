import { NextResponse } from 'next/server'

const API_KEY = process.env.FOOTBALL_API_KEY || ''
const BASE_URL = 'https://v3.football.api-sports.io'

// Cache matches for 15 minutes (1 refresh = 2 API calls, ~48 refreshes/day max)
let cache: { data: Match[]; ts: number } | null = null
const CACHE_TTL = 15 * 60 * 1000

export type Match = {
  id: number
  league: string
  country: string
  home: string
  away: string
  date: string
  time: string
  status: string
}

function getDateString(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ error: 'FOOTBALL_API_KEY not set' }, { status: 500 })
  }

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ matches: cache.data })
  }

  const dates = [getDateString(0), getDateString(1)]

  try {
    const allMatches: Match[] = []

    for (const date of dates) {
      const res = await fetch(`${BASE_URL}/fixtures?date=${date}`, {
        headers: {
          'x-apisports-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
        next: { revalidate: 0 },
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const json = await res.json()
      if (json.errors && Object.keys(json.errors).length > 0) throw new Error(JSON.stringify(json.errors))

      for (const f of json.response || []) {
        allMatches.push({
          id: f.fixture.id,
          league: f.league.name,
          country: f.league.country,
          home: f.teams.home.name,
          away: f.teams.away.name,
          date: f.fixture.date?.split('T')[0] || date,
          time: f.fixture.date
            ? new Date(f.fixture.date).toLocaleTimeString('el-GR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/Athens',
              })
            : '',
          status: f.fixture.status.short,
        })
      }
    }

    const upcoming = allMatches.filter(m => ['NS', 'TBD', 'SUSP', 'PST'].includes(m.status))
    upcoming.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

    cache = { data: upcoming, ts: Date.now() }
    return NextResponse.json({ matches: upcoming })
  } catch (err) {
    // On error, return stale cache if available
    if (cache) return NextResponse.json({ matches: cache.data })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
