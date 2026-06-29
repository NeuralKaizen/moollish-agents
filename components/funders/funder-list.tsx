'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FunderRow } from '@/lib/db/schema'
import { deleteFunderAction } from '@/lib/db/funder-actions'
import { FunderForm } from './funder-form'
import { Card } from '@/components/ui/card'

export function FunderList({ funders }: { funders: FunderRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (funders.length === 0) return <p className="text-sm text-muted-foreground">No hay financiadores cargados.</p>

  return (
    <div className="flex flex-col gap-3">
      {funders.map((f) => editing === f.id ? (
        <FunderForm key={f.id} funder={f} onDone={() => setEditing(null)} />
      ) : (
        <Card key={f.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium">{f.name}</p>
            <p className="truncate text-xs text-muted-foreground">{f.aliases.join(', ')}</p>
            {f.themes && <p className="mt-1 text-sm text-muted-foreground">{f.themes}</p>}
          </div>
          <div className="flex shrink-0 gap-2 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setEditing(f.id)}>Editar</button>
            <button type="button" className="text-red-600 hover:underline" disabled={pending}
              onClick={() => { if (confirm(`¿Eliminar ${f.name}?`)) start(async () => { await deleteFunderAction(f.id); router.refresh() }) }}>
              Eliminar
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}
