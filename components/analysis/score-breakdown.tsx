import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'
import { CRITERION_LABEL, criterionWeightPct } from '@/lib/ui/format'

type CriterionKey = keyof OpportunityAnalysis['criteria_scores']

export function ScoreBreakdown({ analysis }: { analysis: OpportunityAnalysis }) {
  const keys = Object.keys(analysis.criteria_scores) as CriterionKey[]

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Score explicable — desglose ponderado
        </p>
        <p className="text-[10px] text-muted-foreground/70">100 = más favorable</p>
      </div>
      <div className="flex flex-col gap-3">
        {keys.map((key) => {
          const { score, justification } = analysis.criteria_scores[key]
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  {CRITERION_LABEL[key]}{' '}
                  <span className="text-muted-foreground">· {criterionWeightPct(key)}%</span>
                </span>
                <span className="font-semibold text-primary">{score}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{justification}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
