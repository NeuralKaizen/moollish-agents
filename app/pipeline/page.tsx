// app/pipeline/page.tsx
import { listOpportunities } from '@/lib/db/queries'
import { PipelineBoard } from '@/components/pipeline/pipeline-board'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const list = await listOpportunities()
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Pipeline de oportunidades</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Ciclo de vida de cada oportunidad — de detectada a aprobada o descartada.
      </p>
      <PipelineBoard list={list} />
    </main>
  )
}
