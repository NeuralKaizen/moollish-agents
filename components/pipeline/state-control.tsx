'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { setOpportunityStateAction } from '@/lib/db/actions'
import { PIPELINE_STATE_META } from '@/lib/ui/format'

export function StateControl({ o }: { o: DemoOpportunity }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Estado:</span>
      <select
        value={o.state}
        disabled={pending}
        onChange={(e) => {
          const s = e.target.value as PipelineState
          start(async () => { await setOpportunityStateAction(o.analysis.opportunity_id, s); router.refresh() })
        }}
        className="rounded-md border border-border bg-background px-2 py-1"
        style={{ color: PIPELINE_STATE_META[o.state].color }}
      >
        {PIPELINE_STATES.map((s) => (
          <option key={s} value={s}>{PIPELINE_STATE_META[s].label}</option>
        ))}
      </select>
    </div>
  )
}
