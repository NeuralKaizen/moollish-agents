// components/dashboard/dashboard-view.tsx
import Link from 'next/link'
import type { DemoOpportunity } from '@/lib/demo/types'
import {
  newOpportunities, pipelineByState, topToApply, criticalRisks,
  requiredAllies, potentialResources, actionsToday,
} from '@/lib/demo/dashboard'
import { PIPELINE_STATE_META, formatCurrency } from '@/lib/ui/format'
import { WidgetCard } from './widget-card'

export function DashboardView({ list, now, tracking }: {
  list: DemoOpportunity[]
  now: number
  tracking: { vencidas: number; estaSemana: number; enEvaluacion: number }
}) {
  const nuevas = newOpportunities(list, now, 72)
  const buckets = pipelineByState(list)
  const top = topToApply(list, 5)
  const riesgos = criticalRisks(list)
  const aliados = requiredAllies(list)
  const recursos = potentialResources(list)
  const acciones = actionsToday(list, now)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <WidgetCard title="Vencen esta semana">
        <p className="text-3xl font-extrabold" style={{ color: '#c2611c' }}>{tracking.estaSemana}</p>
        <p className="mt-1 text-xs text-muted-foreground">Postulaciones con deadline en ≤7 días</p>
      </WidgetCard>

      <WidgetCard title="Vencidas">
        <p className="text-3xl font-extrabold" style={{ color: '#b23a2e' }}>{tracking.vencidas}</p>
        <p className="mt-1 text-xs text-muted-foreground">Deadline ya pasado, aún en vuelo</p>
      </WidgetCard>

      <WidgetCard title="En evaluación">
        <p className="text-3xl font-extrabold" style={{ color: '#9a6b12' }}>{tracking.enEvaluacion}</p>
        <p className="mt-1 text-xs text-muted-foreground">Postulaciones esperando resultado</p>
      </WidgetCard>
      <WidgetCard title="Recursos potenciales (ponderado)">
        <p className="text-3xl font-extrabold">{formatCurrency(Math.round(recursos), 'USD')}</p>
        <p className="mt-1 text-xs text-muted-foreground">Σ monto × probabilidad (score)</p>
      </WidgetCard>

      <WidgetCard title={`Oportunidades nuevas (72h) · ${nuevas.length}`}>
        <ul className="flex flex-col gap-1 text-sm">
          {nuevas.map((o) => (
            <li key={o.analysis.opportunity_id} className="truncate">{o.analysis.source.name}</li>
          ))}
          {nuevas.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>

      <WidgetCard title={`Acciones de hoy · ${acciones.length}`}>
        <ul className="flex flex-col gap-1 text-sm">
          {acciones.map(({ opportunity, task }, i) => (
            <li key={i} className="truncate">☐ {task.action} <span className="text-muted-foreground">· {opportunity.analysis.source.name}</span></li>
          ))}
          {acciones.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>

      <WidgetCard title="Pipeline por estado">
        <ul className="flex flex-col gap-1 text-sm">
          {buckets.map((b) => (
            <li key={b.state} className="flex justify-between">
              <span style={{ color: PIPELINE_STATE_META[b.state].color }}>{PIPELINE_STATE_META[b.state].label}</span>
              <span className="font-semibold">{b.count}</span>
            </li>
          ))}
        </ul>
      </WidgetCard>

      <WidgetCard title="Top para aplicar">
        <ul className="flex flex-col gap-1 text-sm">
          {top.map((o) => (
            <li key={o.analysis.opportunity_id} className="flex justify-between gap-2">
              <Link href={`/oportunidad/${o.analysis.opportunity_id}`} className="truncate hover:underline">{o.analysis.source.name}</Link>
              <span className="font-semibold text-primary">{o.analysis.overall_score}</span>
            </li>
          ))}
        </ul>
      </WidgetCard>

      <WidgetCard title={`Riesgos críticos · ${riesgos.length}`}>
        <ul className="flex flex-col gap-1 text-sm">
          {riesgos.map((o) => (
            <li key={o.analysis.opportunity_id} className="truncate">⚠️ {o.analysis.source.name}</li>
          ))}
          {riesgos.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>

      <WidgetCard title="Aliados requeridos">
        <ul className="flex flex-col gap-1 text-sm">
          {aliados.map((al) => (
            <li key={al.ally_type} className="flex justify-between gap-2">
              <span className="truncate">{al.ally_type}</span>
              <span className="font-semibold">{al.count}</span>
            </li>
          ))}
          {aliados.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>
    </div>
  )
}
