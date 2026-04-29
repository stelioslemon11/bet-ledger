import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Navbar from '@/components/Navbar'
import SubadminClient from '../SubadminClient'

export default async function SubadminDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const subadmin = await prisma.user.findUnique({
    where: { id: params.id, role: 'SUBADMIN' },
    include: { children: { include: { bets: { orderBy: { createdAt: 'desc' } } } } }
  })
  if (!subadmin) redirect('/admin')

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar name={session.name} role={session.role} username={session.username} />
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <a href="/admin" className="inline-flex items-center gap-2 text-sm mb-2 hover:opacity-80" style={{ color: 'var(--muted)' }}>← Back to Admin</a>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Viewing subadmin: <span className="text-white font-medium">{subadmin.name}</span></p>
      </div>
      <SubadminClient
        session={{ userId: subadmin.id, username: subadmin.username, role: 'SUBADMIN', name: subadmin.name }}
        initialPlayers={JSON.parse(JSON.stringify(subadmin.children))}
      />
    </div>
  )
}
