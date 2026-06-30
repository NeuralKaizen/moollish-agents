import Link from 'next/link'
import type { InFlightItem, Urgency } from '@/lib/agent/tracking/deadlines'
import { PIPELINE_STATE_META } from '@/lib/ui/format'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const URGENCY_META: Record<Urgency, { label: string; color: string }> = {
  vencida: { label: 'Vencida', color: '#b23a2e' },
  urgente: { label: 'Esta semana', color: '#c2611c' },
  proxima: { label: 'Próxima', color: '#9a6b12' },
  lejana: { label: 'Lejana', color: '#3c7d34' },
  sin_fecha: { label: 'Sin fecha', color: '#6b7280' },
}

const KIND_LABEL = { deadline: 'cierre convocatoria', hito: 'próximo hito', resultado: 'resultado esperado' } as const

function daysText(daysLeft: number | null): string {
  if (daysLeft == null) return '—'
  if (daysLeft < 0) return `hace ${Math.abs(daysLeft)} d`
  if (daysLeft === 0) return 'hoy'
  return `en ${daysLeft} d`
}

export function TrackingList({ items }: { items: InFlightItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay postulaciones en vuelo por ahora.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => {
        const u = URGENCY_META[it.next.urgency]
        const st = PIPELINE_STATE_META[it.state]
        return (
          <Card key={it.opportunityId} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link href={`/oportunidad/${it.opportunityId}`} className="font-medium hover:underline">{it.name}</Link>
              <p className="text-xs text-muted-foreground">
                <span style={{ color: st.color }}>{st.label}</span>
                {it.next.date && <> · {it.next.kind ? KIND_LABEL[it.next.kind] : ''} {it.next.date}</>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge style={{ backgroundColor: u.color }}>{u.label}</Badge>
              <span className="text-xs text-muted-foreground">{daysText(it.next.daysLeft)}</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
