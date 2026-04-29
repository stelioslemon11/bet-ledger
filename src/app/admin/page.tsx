import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Navbar from '@/components/Navbar'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const subadmins = await prisma.user.findMany({
    where: { role: 'SUBADMIN' },
    include: {
      children: {
        include: {
          bets: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  const players = await prisma.user.findMany({
    where: { role: 'PLAYER' },
    include: { bets: true },
    orderBy: { createdAt: 'desc' }
  })

  const totalBets = await prisma.bet.count()
  const pendingBets = await prisma.bet.count({ where: { status: 'PENDING' } })
  const wonBets = await prisma.bet.count({ where: { status: 'WON' } })

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar name={session.name} role={session.role} username={session.username} />
      <AdminClient
        session={session}
        initialSubadmins={JSON.parse(JSON.stringify(subadmins))}
        initialPlayers={JSON.parse(JSON.stringify(players))}
        stats={{ totalBets, pendingBets, wonBets, totalSubadmins: subadmins.length, totalPlayers: players.length }}
      />
    </div>
  )
}
