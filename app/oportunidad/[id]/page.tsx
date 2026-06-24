'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { useOpportunity } from '@/lib/demo/use-store'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const o = useOpportunity(id)
  if (!o) return notFound()

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <TaskList o={o} />
    </main>
  )
}
