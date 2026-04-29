import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  try {
    let bets
    if (session.role === 'PLAYER') {
      bets = await prisma.bet.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' }
      })
    } else if (session.role === 'SUBADMIN') {
      const players = await prisma.user.findMany({ where: { createdById: session.userId }, select: { id: true } })
      const playerIds = players.map(p => p.id)
      bets = await prisma.bet.findMany({
        where: { userId: userId ? userId : { in: playerIds } },
        include: { user: { select: { id: true, name: true, username: true } } },
        orderBy: { createdAt: 'desc' }
      })
    } else {
      bets = await prisma.bet.findMany({
        where: userId ? { userId } : undefined,
        include: { user: { select: { id: true, name: true, username: true } } },
        orderBy: { createdAt: 'desc' }
      })
    }
    return NextResponse.json({ bets })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, match, betType, amount, odds, potentialReturn, notes } = await req.json()

  if (!match || !betType || !amount || !odds || !potentialReturn) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Determine target userId
  let targetUserId = session.userId
  if (userId && session.role !== 'PLAYER') {
    targetUserId = userId
  }

  try {
    const bet = await prisma.bet.create({
      data: { userId: targetUserId, match, betType, amount: Number(amount), odds: Number(odds), potentialReturn: Number(potentialReturn), notes },
      include: { user: { select: { id: true, name: true, username: true } } }
    })
    return NextResponse.json({ bet }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
