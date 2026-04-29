import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Navbar from '@/components/Navbar'
import PlayerClient from './PlayerClient'

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Players can only see their own page
  if (session.role === 'PLAYER' && session.userId !== params.id) redirect('/player/' + session.userId)

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: { bets: { orderBy: { createdAt: 'desc' } } }
  })
  if (!user) redirect('/dashboard')

  const { password, ...safeUser } = user

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar name={session.name} role={session.role} username={session.username} />
      <PlayerClient user={JSON.parse(JSON.stringify(safeUser))} session={session} />
    </div>
  )
}
