// app/dashboard/page.tsx
import { listOpportunities } from '@/lib/db/queries'
import { listSubmissions } from '@/lib/db/submissions'
import { buildTrackingInputs, rankInFlight, deadlineCounts } from '@/lib/agent/tracking/deadlines'
import { DashboardView } from '@/components/dashboard/dashboard-view'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const list = await listOpportunities()
  let tracking = { vencidas: 0, estaSemana: 0, enEvaluacion: 0 }
  try {
    const subs = await listSubmissions()
    tracking = deadlineCounts(rankInFlight(buildTrackingInputs(list, subs), new Date()))
  } catch (e) {
    console.error('[dashboard] no se pudieron calcular deadlines:', e)
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Dashboard ejecutivo</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Qué apareció, qué vale la pena, qué requiere acción y qué riesgos hay.
      </p>
      <DashboardView list={list} now={Date.now()} tracking={tracking} />
    </main>
  )
}
