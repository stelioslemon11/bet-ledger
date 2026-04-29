import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Navbar from '@/components/Navbar'
import SubadminClient from './SubadminClient'

export default async function SubadminPage() {
  const session = await getSession()
  if (!session || session.role !== 'SUBADMIN') redirect('/login')

  const players = await prisma.user.findMany({
    where: { createdById: session.userId },
    include: { bets: { orderBy: { createdAt: 'desc' } } },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar name={session.name} role={session.role} username={session.username} />
      <SubadminClient session={session} initialPlayers={JSON.parse(JSON.stringify(players))} />
    </div>
  )
}
