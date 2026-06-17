import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'
import { VerdictHero } from './verdict-hero'
import { ScoreBreakdown } from './score-breakdown'
import { EvidenceGaps } from './evidence-gaps'
import { PartnersRisks } from './partners-risks'

export function AnalysisView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="flex flex-col gap-4">
      <VerdictHero analysis={analysis} />
      <ScoreBreakdown analysis={analysis} />
      <EvidenceGaps analysis={analysis} />
      <PartnersRisks analysis={analysis} />
      {/* Tasks 9–10 insertan aquí: EvidenceGaps, PartnersRisks, NextActions, DraftOutputs */}
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Resumen ejecutivo (borrador)</p>
        <p className="mt-1">{analysis.draft_outputs.executive_summary}</p>
      </Card>
    </div>
  )
}
