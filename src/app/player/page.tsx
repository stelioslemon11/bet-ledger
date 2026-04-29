import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function PlayerRedirect() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'PLAYER') redirect('/dashboard')
  redirect(`/player/${session.userId}`)
}
