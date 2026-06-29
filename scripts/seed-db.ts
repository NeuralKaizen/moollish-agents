import '../lib/load-env'
import { db } from '../lib/db/client'
import { opportunities } from '../lib/db/schema'
import { opportunityToRow } from '../lib/db/mappers'
import { SEED_OPPORTUNITIES } from '../lib/demo/seed'

async function main() {
  if (SEED_OPPORTUNITIES.length === 0) {
    console.error('[seed-db] No hay oportunidades semilla. ¿Corriste `pnpm seed` para generar analyses.generated.json?')
    process.exit(1)
  }
  await db.delete(opportunities)
  await db.insert(opportunities).values(SEED_OPPORTUNITIES.map(opportunityToRow))
  console.error(`[seed-db] Insertadas ${SEED_OPPORTUNITIES.length} oportunidades semilla.`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
