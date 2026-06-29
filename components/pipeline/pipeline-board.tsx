// components/pipeline/pipeline-board.tsx
import type { DemoOpportunity } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { PIPELINE_STATE_META } from '@/lib/ui/format'
import { OpportunityRow } from './opportunity-row'

export function PipelineBoard({ list }: { list: DemoOpportunity[] }) {
  return (
    <div className="flex flex-col gap-6">
      {PIPELINE_STATES.map((state) => {
        const items = list.filter((o) => o.state === state)
        if (items.length === 0) return null
        return (
          <section key={state} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold" style={{ color: PIPELINE_STATE_META[state].color }}>
              {PIPELINE_STATE_META[state].label}
              <span className="ml-2 text-muted-foreground">({items.length})</span>
            </h2>
            {items.map((o) => <OpportunityRow key={o.analysis.opportunity_id} o={o} />)}
          </section>
        )
      })}
    </div>
  )
}
