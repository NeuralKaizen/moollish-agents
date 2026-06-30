import '../lib/load-env'
import { db } from '../lib/db/client'
import { allies } from '../lib/db/schema'
import { ALLY_SEED } from '../lib/db/allies-seed'

async function main() {
  await db.delete(allies)
  await db.insert(allies).values(ALLY_SEED)
  console.error(`[seed-allies] Insertados ${ALLY_SEED.length} aliados.`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
