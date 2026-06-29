// lib/db/detected.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { detectedOpportunities } from './schema'
import { recordDetected, listDetected, getDetected, markDetected } from './detected'

const hasDb = !!process.env.DATABASE_URL
const row = { id: 'secop:1', source: 'secop', sourceRef: '1', title: 'Riego rural', status: 'detectada' as const }

describe.skipIf(!hasDb)('detected queries (integración)', () => {
  beforeEach(async () => { await db.delete(detectedOpportunities) })

  it('recordDetected inserta y deduplica por id', async () => {
    await recordDetected(row)
    await recordDetected({ ...row, title: 'OTRO' }) // mismo id → no-op
    const list = await listDetected()
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Riego rural')
  })

  it('getDetected + markDetected (promovida con opportunityId)', async () => {
    await recordDetected(row)
    await markDetected('secop:1', 'promovida', 'op-9')
    const d = await getDetected('secop:1')
    expect(d?.status).toBe('promovida')
    expect(d?.opportunityId).toBe('op-9')
  })
})
