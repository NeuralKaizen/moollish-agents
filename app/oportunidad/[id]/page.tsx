import { notFound } from 'next/navigation'
import { getOpportunity } from '@/lib/db/queries'
import { listDrafts } from '@/lib/db/drafts'
import { listAllies, rowToProfile } from '@/lib/db/allies'
import { getSubmission } from '@/lib/db/submissions'
import { suggestAllies, type GapSuggestion } from '@/lib/agent/alliance/match'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'
import { DraftsSection } from '@/components/drafts/drafts-section'
import { AlliesSuggested } from '@/components/allies/allies-suggested'
import { SubmissionSection } from '@/components/tracking/submission-section'
import { OutcomeSection } from '@/components/tracking/outcome-section'

export const dynamic = 'force-dynamic'

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await getOpportunity(id)
  if (!o) return notFound()
  const draftMap = new Map((await listDrafts(id)).map((d) => [d.kind, d]))

  let suggestions: GapSuggestion[] = []
  let loadError = false
  try {
    const allies = await listAllies()
    suggestions = suggestAllies(
      o.analysis.partners_needed,
      allies.map(rowToProfile),
      { themes: `${o.analysis.source.name} ${o.analysis.draft_outputs?.executive_summary ?? ''}`, country: null },
    )
  } catch (e) {
    console.error('[oportunidad] no se pudieron cargar aliados sugeridos:', e)
    loadError = true
  }

  let submission = null
  try {
    submission = (await getSubmission(id)) ?? null
  } catch (e) {
    console.error('[oportunidad] no se pudo cargar el seguimiento:', e)
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <AlliesSuggested suggestions={suggestions} loadError={loadError} />
      <DraftsSection opportunityId={id} drafts={draftMap} />
      <SubmissionSection opportunityId={id} submission={submission} />
      <OutcomeSection opportunityId={id} submission={submission} />
      <TaskList o={o} />
    </main>
  )
}
