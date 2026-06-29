'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { resetDemoAction } from '@/lib/db/actions'

const LINKS = [
  { href: '/', label: 'Analizar' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/dashboard', label: 'Dashboard' },
]

export function NavHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [, startReset] = useTransition()
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
        <span className="font-bold text-primary">🐂 moollish</span>
        <div className="flex gap-1">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 ${active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('¿Reiniciar la demo al estado inicial?')) {
              startReset(async () => { await resetDemoAction(); router.refresh() })
            }
          }}
          className="ml-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Reiniciar demo
        </button>
      </nav>
    </header>
  )
}
