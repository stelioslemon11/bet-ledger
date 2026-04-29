import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// GET /api/users - list users (filtered by role)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role')

  try {
    let users

    if (session.role === 'ADMIN') {
      users = await prisma.user.findMany({
        where: role ? { role: role as any } : undefined,
        select: {
          id: true, username: true, name: true, role: true,
          balance: true, createdAt: true, createdById: true,
          _count: { select: { bets: true, children: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    } else if (session.role === 'SUBADMIN') {
      users = await prisma.user.findMany({
        where: { createdById: session.userId },
        select: {
          id: true, username: true, name: true, role: true,
          balance: true, createdAt: true,
          bets: {
            select: { id: true, amount: true, potentialReturn: true, status: true }
          },
          _count: { select: { bets: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ users })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/users - create user
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username, password, name, role, balance } = await req.json()

  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Role permission checks
  if (session.role === 'ADMIN' && !['SUBADMIN', 'PLAYER'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  if (session.role === 'SUBADMIN' && role !== 'PLAYER') {
    return NextResponse.json({ error: 'Subadmins can only create players' }, { status: 403 })
  }
  if (session.role === 'PLAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        name,
        role,
        balance: balance || 0,
        createdById: session.userId,
      },
      select: { id: true, username: true, name: true, role: true, balance: true, createdAt: true }
    })
    return NextResponse.json({ user }, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
