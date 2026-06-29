'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DetectedRow } from '@/lib/db/schema'
import { promoteDetectedAction, discardDetectedAction } from '@/lib/db/detected-actions'
import { daysRemaining } from '@/lib/ui/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STATUS_LABEL: Record<DetectedRow['status'], string> = {
  detectada: 'Detectada', promovida: 'Promovida', descartada: 'Descartada',
}

export function DetectedList({ detected }: { detected: DetectedRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (detected.length === 0) {
    return <p className="text-sm text-muted-foreground">El radar todavía no detectó oportunidades.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {detected.map((d) => {
        const days = daysRemaining(d.deadline)
        return (
          <Card key={d.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{d.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{STATUS_LABEL[d.status]}</span>
                {d.funder && <span>· {d.funder}</span>}
                {d.amount && <span>· {d.amount} {d.currency ?? ''}</span>}
                {days != null && <span>· ⏳ {days} días</span>}
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">· ver</a>}
              </div>
              {d.themes && <p className="mt-1 text-xs text-muted-foreground">{d.themes}</p>}
            </div>
            {d.status === 'detectada' && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={pending}
                  onClick={() => start(async () => { await promoteDetectedAction(d.id); router.refresh() })}>
                  {pending ? '…' : 'Promover'}
                </Button>
                <Button size="sm" variant="outline" disabled={pending}
                  onClick={() => start(async () => { await discardDetectedAction(d.id); router.refresh() })}>
                  Descartar
                </Button>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
