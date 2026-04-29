import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role === 'PLAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await req.json()
  if (!['PENDING', 'WON', 'LOST'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    const bet = await prisma.bet.update({
      where: { id: params.id },
      data: { status, settledAt: status !== 'PENDING' ? new Date() : null },
      include: { user: { select: { id: true, name: true, username: true } } }
    })

    // Update player balance when settling
    if (status === 'WON') {
      await prisma.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: bet.potentialReturn } }
      })
    } else if (status === 'LOST') {
      await prisma.user.update({
        where: { id: bet.userId },
        data: { balance: { decrement: bet.amount } }
      })
    }

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
  await prisma.bet.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
