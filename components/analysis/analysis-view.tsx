import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'

export function AnalysisView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Tasks 7–10 insertan aquí: VerdictHero, ScoreBreakdown, EvidenceGaps, PartnersRisks, NextActions, DraftOutputs */}
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Resumen ejecutivo (borrador)</p>
        <p className="mt-1">{analysis.draft_outputs.executive_summary}</p>
      </Card>
    </div>
  )
}
