import { listOpportunities } from '@/lib/db/queries'
import { listSubmissions } from '@/lib/db/submissions'
import { buildTrackingInputs, rankInFlight, type InFlightItem } from '@/lib/agent/tracking/deadlines'
import { TrackingList } from '@/components/tracking/tracking-list'

export const dynamic = 'force-dynamic'

export default async function SeguimientoPage() {
  let items: InFlightItem[] = []
  try {
    const [opps, subs] = await Promise.all([listOpportunities(), listSubmissions()])
    items = rankInFlight(buildTrackingInputs(opps, subs), new Date())
  } catch (e) {
    console.error('[seguimiento] no se pudo cargar el seguimiento:', e)
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Seguimiento</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Postulaciones en vuelo ordenadas por urgencia: qué vence, qué está en evaluación.
      </p>
      <TrackingList items={items} />
    </main>
  )
}
