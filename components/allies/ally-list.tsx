'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AllyRow } from '@/lib/db/schema'
import { deleteAllyAction } from '@/lib/db/ally-actions'
import { AllyForm } from './ally-form'
import { Card } from '@/components/ui/card'

export function AllyList({ allies }: { allies: AllyRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (allies.length === 0) return <p className="text-sm text-muted-foreground">No hay aliados cargados.</p>

  return (
    <div className="flex flex-col gap-3">
      {allies.map((a) => editing === a.id ? (
        <AllyForm key={a.id} ally={a} onDone={() => setEditing(null)} />
      ) : (
        <Card key={a.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium">{a.name}</p>
            <p className="truncate text-xs text-muted-foreground">{a.type} · reputación {a.reputation}{a.country ? ` · ${a.country}` : ''}</p>
            {a.capabilities && <p className="mt-1 text-sm text-muted-foreground">{a.capabilities}</p>}
          </div>
          <div className="flex shrink-0 gap-2 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setEditing(a.id)}>Editar</button>
            <button type="button" className="text-red-600 hover:underline" disabled={pending}
              onClick={() => { if (confirm(`¿Eliminar ${a.name}?`)) start(async () => { await deleteAllyAction(a.id); router.refresh() }) }}>
              Eliminar
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}
