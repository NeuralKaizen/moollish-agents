import { notFound } from 'next/navigation'
import { getOpportunity } from '@/lib/db/queries'
import { listDrafts } from '@/lib/db/drafts'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'
import { DraftsSection } from '@/components/drafts/drafts-section'

export const dynamic = 'force-dynamic'

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await getOpportunity(id)
  if (!o) return notFound()
  const draftMap = new Map((await listDrafts(id)).map((d) => [d.kind, d]))

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <DraftsSection opportunityId={id} drafts={draftMap} />
      <TaskList o={o} />
    </main>
  )
}
