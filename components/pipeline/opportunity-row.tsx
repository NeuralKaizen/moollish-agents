// components/pipeline/opportunity-row.tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { setOpportunityStateAction } from '@/lib/db/actions'
import { SEMAFORO_META, PIPELINE_STATE_META, formatCurrency, daysRemaining } from '@/lib/ui/format'

export function OpportunityRow({ o }: { o: DemoOpportunity }) {
  const a = o.analysis
  const sem = SEMAFORO_META[a.semaforo]
  const days = daysRemaining(a.deadline.date)
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/oportunidad/${a.opportunity_id}`} className="font-medium hover:underline">
          {a.source.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span style={{ color: sem.color }}>● {sem.label}</span>
          <span>· {a.overall_score}/100</span>
          {days != null && <span>· ⏳ {days} días</span>}
          {a.funding_amount.value != null && (
            <span>· 💰 {formatCurrency(a.funding_amount.value, a.funding_amount.currency)}</span>
          )}
        </div>
      </div>
      <select
        value={o.state}
        disabled={pending}
        onChange={(e) => {
          const s = e.target.value as PipelineState
          start(async () => { await setOpportunityStateAction(a.opportunity_id, s); router.refresh() })
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        style={{ color: PIPELINE_STATE_META[o.state].color }}
      >
        {PIPELINE_STATES.map((s) => (
          <option key={s} value={s}>{PIPELINE_STATE_META[s].label}</option>
        ))}
      </select>
    </div>
  )
}
