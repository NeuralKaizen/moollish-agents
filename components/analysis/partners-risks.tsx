import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LEVEL_LABEL } from '@/lib/ui/format'

const SEVERITY_COLOR: Record<OpportunityAnalysis['risks'][number]['severity'], string> = {
  bajo: '#3c7d34',
  medio: '#9a6b12',
  alto: '#b23a2e',
}

export function PartnersRisks({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Aliados necesarios
        </p>
        <div className="flex flex-col gap-3">
          {analysis.partners_needed.map((p, i) => (
            <div key={i} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.ally_type}</span>
                <Badge variant="outline">prioridad {LEVEL_LABEL[p.priority]}</Badge>
              </div>
              <p className="text-muted-foreground">{p.suggested_role} — {p.reason}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Riesgos
        </p>
        <div className="flex flex-col gap-3">
          {analysis.risks.map((r, i) => (
            <div key={i} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{r.type}</span>
                <Badge style={{ backgroundColor: `${SEVERITY_COLOR[r.severity]}22`, color: SEVERITY_COLOR[r.severity] }}>
                  {LEVEL_LABEL[r.severity]}
                </Badge>
              </div>
              <p className="text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
