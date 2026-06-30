import { listAllies } from '@/lib/db/allies'
import { AllyList } from '@/components/allies/ally-list'
import { AllyForm } from '@/components/allies/ally-form'

export const dynamic = 'force-dynamic'

export default async function AlliesPage() {
  const allies = await listAllies()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Aliados</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Base curada de aliados que el agente usa para sugerir socios por cada brecha de una oportunidad.
      </p>
      <AllyForm />
      <AllyList allies={allies} />
    </main>
  )
}
