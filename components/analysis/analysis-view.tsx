import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { VerdictHero } from './verdict-hero'
import { ScoreBreakdown } from './score-breakdown'
import { EvidenceGaps } from './evidence-gaps'
import { PartnersRisks } from './partners-risks'
import { NextActions } from './next-actions'
import { DraftOutputs } from './draft-outputs'

export function AnalysisView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="flex flex-col gap-4">
      <VerdictHero analysis={analysis} />
      <ScoreBreakdown analysis={analysis} />
      <EvidenceGaps analysis={analysis} />
      <PartnersRisks analysis={analysis} />
      <NextActions analysis={analysis} />
      <DraftOutputs analysis={analysis} />
    </div>
  )
}
