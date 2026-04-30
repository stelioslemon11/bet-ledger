import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { settleBet } from '@/lib/bets'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role === 'PLAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  try {
    // Settlement action
    if (body.status) {
      if (!['WON', 'LOST'].includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      await settleBet(params.id, body.status as 'WON' | 'LOST')
      return NextResponse.json({ success: true })
    }

    // Edit action — update bet fields
    const { match, betType, amount, odds, notes, fixtureId, fixtureDate } = body
    if (!match && !betType && amount === undefined && odds === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updateData: any = {}
    if (match !== undefined) updateData.match = match
    if (betType !== undefined) updateData.betType = betType
    if (notes !== undefined) updateData.notes = notes
    if (fixtureId !== undefined) updateData.fixtureId = fixtureId ? Number(fixtureId) : null
    if (fixtureDate !== undefined) updateData.fixtureDate = fixtureDate || null
    if (amount !== undefined) updateData.amount = Number(amount)
    if (odds !== undefined) updateData.odds = Number(odds)
    // Recalculate potentialReturn if amount or odds changed
    if (amount !== undefined || odds !== undefined) {
      const existing = await prisma.bet.findUnique({ where: { id: params.id } })
      if (existing) {
        const newAmount = amount !== undefined ? Number(amount) : existing.amount
        const newOdds = odds !== undefined ? Number(odds) : existing.odds
        updateData.potentialReturn = newAmount * newOdds
      }
    }

    const bet = await prisma.bet.update({ where: { id: params.id }, data: updateData })
    return NextResponse.json({ bet })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role === 'PLAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    await prisma.bet.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
