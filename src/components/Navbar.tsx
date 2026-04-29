'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Props = { name: string; role: string; username: string }

export default function Navbar({ name, role, username }: Props) {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const roleColors: Record<string, string> = {
    ADMIN: '#6366f1',
    SUBADMIN: '#22d3ee',
    PLAYER: '#22c55e',
  }

  return (
    <nav className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--surface2)' }}>
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-white font-bold text-lg hover:opacity-80 transition-opacity">
          <span className="text-xl">🎯</span>
          BetLedger
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--muted)' }}>{name}</span>
          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: roleColors[role] + '20', color: roleColors[role], border: `1px solid ${roleColors[role]}40` }}>
            {role}
          </span>
        </div>
        <button onClick={logout} className="text-sm px-4 py-2 rounded-lg transition-colors hover:opacity-80" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
          Sign out
        </button>
      </div>
    </nav>
  )
}
