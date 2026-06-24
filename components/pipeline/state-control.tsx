'use client'

import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { demoStore } from '@/lib/demo/use-store'
import { PIPELINE_STATE_META } from '@/lib/ui/format'

export function StateControl({ o }: { o: DemoOpportunity }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Estado:</span>
      <select
        value={o.state}
        onChange={(e) => demoStore.setState(o.analysis.opportunity_id, e.target.value as PipelineState)}
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
