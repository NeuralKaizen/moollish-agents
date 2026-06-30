import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { submissions, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { getSubmission } from './submissions'
import { saveSubmissionAction } from './submission-actions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-sa', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('submission actions (integración)', () => {
  beforeEach(async () => { await db.delete(submissions); await db.delete(opportunities) })

  it('upsert: crea y luego actualiza por id', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))

    await saveSubmissionAction('op-sa', { radicado: 'R-1', fechaPresentacion: '2026-06-15' })
    expect((await getSubmission('op-sa'))?.radicado).toBe('R-1')

    await saveSubmissionAction('op-sa', { radicado: 'R-2', proximoHito: 'sustentación' })
    const got = await getSubmission('op-sa')
    expect(got?.radicado).toBe('R-2')
    expect(got?.proximoHito).toBe('sustentación')
  })
})
