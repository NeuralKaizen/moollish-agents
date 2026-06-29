import '../lib/load-env'
import { db } from '../lib/db/client'
import { funders } from '../lib/db/schema'
import { FUNDER_SEED } from '../lib/db/funders-seed'

async function main() {
  await db.delete(funders)
  await db.insert(funders).values(FUNDER_SEED)
  console.error(`[seed-funders] Insertados ${FUNDER_SEED.length} financiadores.`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
