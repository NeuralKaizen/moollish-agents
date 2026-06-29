import { listDetected } from '@/lib/db/detected'
import { DetectedList } from '@/components/radar/detected-list'

export const dynamic = 'force-dynamic'

export default async function RadarPage() {
  const detected = await listDetected()
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Radar</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Oportunidades detectadas automáticamente (SECOP / Datos Abiertos). Promové las relevantes para analizarlas.
      </p>
      <DetectedList detected={detected} />
    </main>
  )
}
