import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      bets: { orderBy: { createdAt: 'desc' } },
      children: {
        select: {
          id: true, username: true, name: true, balance: true,
          bets: { select: { id: true, amount: true, potentialReturn: true, status: true } }
        }
      }
    }
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.role === 'PLAYER' && session.userId !== params.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { password, ...safeUser } = user
  return NextResponse.json({ user: safeUser })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'PLAYER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await req.json()
  const allowedFields: any = {}
  if (data.name) allowedFields.name = data.name
  if (data.balance !== undefined) allowedFields.balance = Number(data.balance)

  const user = await prisma.user.update({
    where: { id: params.id },
    data: allowedFields,
    select: { id: true, username: true, name: true, role: true, balance: true }
  })

  return NextResponse.json({ user })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role === 'PLAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.user.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
