import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST() {
  try {
    const existing = await prisma.user.findUnique({ where: { username: 'admin' } })
    if (existing) return NextResponse.json({ message: 'Already seeded' })

    const hashedPassword = await bcrypt.hash('admin123', 10)
    await prisma.user.create({
      data: { username: 'admin', password: hashedPassword, name: 'Administrator', role: 'ADMIN', balance: 0 }
    })
    return NextResponse.json({ message: 'Admin created: username=admin, password=admin123' })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
