import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  SEMAFORO_META, RECOMMENDATION_LABEL, VEHICLE_LABEL, LEVEL_LABEL, daysRemaining, formatCurrency,
} from '@/lib/ui/format'

function FitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-xs text-muted-foreground">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function VerdictHero({ analysis }: { analysis: OpportunityAnalysis }) {
  const sem = SEMAFORO_META[analysis.semaforo]
  const days = daysRemaining(analysis.deadline.date)

  return (
    <Card className="border-l-4 p-5" style={{ borderLeftColor: sem.color }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge style={{ backgroundColor: `${sem.color}22`, color: sem.color }}>● {sem.label}</Badge>
          <div className="mt-2 text-4xl font-extrabold">
            {analysis.overall_score}
            <span className="text-base font-semibold text-muted-foreground">/100</span>
          </div>
          <p className="mt-2">
            <span
              className="rounded-md px-3 py-1 font-bold text-primary-foreground"
              style={{ backgroundColor: '#e2641a' }}
            >
              ▶ {RECOMMENDATION_LABEL[analysis.recommendation]}
            </span>
            <span className="ml-2 text-sm text-muted-foreground">
              vía {VEHICLE_LABEL[analysis.recommended_vehicle]}
            </span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{analysis.vehicle_rationale}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {analysis.source.name}
            {days != null && ` · ⏳ ${days} días`}
            {analysis.funding_amount.value != null &&
              ` · 💰 ${formatCurrency(analysis.funding_amount.value, analysis.funding_amount.currency)}${
                analysis.funding_amount.confirmed ? '' : ' (estimado)'
              }`}
            {' · '}Esfuerzo {LEVEL_LABEL[analysis.effort]} · Riesgo {LEVEL_LABEL[analysis.risk]}
          </p>
        </div>
        <div className="w-44 shrink-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fit institucional
          </p>
          <div className="flex flex-col gap-2">
            <FitBar label="Moollish" value={analysis.institutional_fit.moollish} />
            <FitBar label="Sat2Farm" value={analysis.institutional_fit.sat2farm} />
            <FitBar label="Foundation Nova" value={analysis.institutional_fit.foundation_nova} />
            <FitBar label="Alianza" value={analysis.institutional_fit.alliance} />
          </div>
        </div>
      </div>
    </Card>
  )
}
