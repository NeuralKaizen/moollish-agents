import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function DraftOutputs({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Borradores
        </p>
        <Badge variant="outline">borrador</Badge>
      </div>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-medium">Resumen ejecutivo</p>
          <p className="text-muted-foreground">{analysis.draft_outputs.executive_summary}</p>
        </div>
        <div>
          <p className="font-medium">Ángulo narrativo</p>
          <p className="text-muted-foreground">{analysis.draft_outputs.narrative_angle}</p>
        </div>
      </div>
    </Card>
  )
}
