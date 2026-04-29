import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  if (session.role === 'ADMIN') redirect('/admin')
  if (session.role === 'SUBADMIN') redirect('/subadmin')
  if (session.role === 'PLAYER') redirect('/player')
  redirect('/login')
}
