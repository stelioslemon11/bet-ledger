import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role === 'PLAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, initialStake, legs } = await req.json()

  if (!userId || !initialStake || !legs || legs.length < 2) {
    return NextResponse.json({ error: 'Parlay needs at least 2 legs and an initial stake' }, { status: 400 })
  }

  const totalOdds = legs.reduce((acc: number, l: any) => acc * Number(l.odds), 1)
  const potentialReturn = Number(initialStake) * totalOdds

  try {
    const parlay = await prisma.parlay.create({
      data: {
        userId,
        initialStake: Number(initialStake),
        totalOdds,
        potentialReturn,
        bets: {
          create: legs.map((leg: any, i: number) => ({
            userId,
            match: leg.match,
            betType: leg.betType,
            amount: Number(leg.amount),
            odds: Number(leg.odds),
            potentialReturn: Number(leg.potentialReturn),
            fixtureId: leg.fixtureId ? Number(leg.fixtureId) : null,
            fixtureDate: leg.fixtureDate || null,
            parlayOrder: i + 1,
          })),
        },
      },
      include: { bets: { orderBy: { parlayOrder: 'asc' } } },
    })

    return NextResponse.json({ parlay }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role === 'PLAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    // Delete all bets in the parlay first, then parlay
    await prisma.bet.deleteMany({ where: { parlayId: id } })
    await prisma.parlay.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
