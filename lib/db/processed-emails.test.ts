import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { processedEmails } from './schema'
import { listProcessedIds, recordProcessed } from './processed-emails'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('processed-emails (integración)', () => {
  beforeEach(async () => { await db.delete(processedEmails) })

  it('record + list deduplica por message_id', async () => {
    await recordProcessed({ messageId: 'm1', status: 'ok', opportunityId: 'op1' })
    await recordProcessed({ messageId: 'm2', status: 'failed', error: 'boom' })
    const ids = await listProcessedIds()
    expect(ids.has('m1')).toBe(true)
    expect(ids.has('m2')).toBe(true)
    expect(ids.size).toBe(2)
  })

  it('recordProcessed sobre un id existente no rompe (onConflictDoNothing)', async () => {
    await recordProcessed({ messageId: 'm1', status: 'ok' })
    await recordProcessed({ messageId: 'm1', status: 'ok' })
    expect((await listProcessedIds()).size).toBe(1)
  })
})
