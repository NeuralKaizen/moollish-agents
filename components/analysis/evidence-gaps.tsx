import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function EvidenceGaps({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Evidencia (citas)
        </p>
        <div className="flex flex-col gap-3">
          {analysis.evidence.map((e, i) => (
            <div key={i}>
              <p className="text-sm font-medium">{e.claim}</p>
              <p className="border-l-2 border-border pl-2 text-sm italic text-muted-foreground">{e.quote}</p>
              <p className="text-xs text-muted-foreground/70">{e.field}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Gaps · datos faltantes
        </p>
        <p className="text-sm">
          <span className="font-medium">Brecha principal: </span>
          {analysis.main_gap}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.missing_data.map((m, i) => (
            <Badge key={i} style={{ backgroundColor: '#9a6b1222', color: '#9a6b12' }}>{m}</Badge>
          ))}
        </div>
      </Card>
    </div>
  )
}
