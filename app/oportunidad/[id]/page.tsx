import { notFound } from 'next/navigation'
import { getOpportunity } from '@/lib/db/queries'
import { getDraft } from '@/lib/db/drafts'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'
import { ConceptNoteSection } from '@/components/drafts/concept-note-section'

export const dynamic = 'force-dynamic'

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await getOpportunity(id)
  if (!o) return notFound()
  const conceptNote = (await getDraft(id, 'concept_note')) ?? null

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <ConceptNoteSection opportunityId={id} draft={conceptNote} />
      <TaskList o={o} />
    </main>
  )
}
