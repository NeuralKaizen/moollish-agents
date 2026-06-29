import { listFunders } from '@/lib/db/funders'
import { FunderList } from '@/components/funders/funder-list'
import { FunderForm } from '@/components/funders/funder-form'

export const dynamic = 'force-dynamic'

export default async function FundersPage() {
  const funders = await listFunders()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Financiadores</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Perfiles vivos que el análisis usa para interpretar prioridades de cada financiador.
      </p>
      <FunderForm />
      <FunderList funders={funders} />
    </main>
  )
}
