import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { submissions, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { listSubmissions, getSubmission } from './submissions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-sub', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('submissions queries (integración)', () => {
  beforeEach(async () => { await db.delete(submissions); await db.delete(opportunities) })

  it('getSubmission devuelve uno o undefined; listSubmissions los lista', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await db.insert(submissions).values({ id: 'op-sub', radicado: 'R-123', fechaPresentacion: '2026-06-15' })

    expect(await getSubmission('nope')).toBeUndefined()
    const got = await getSubmission('op-sub')
    expect(got?.radicado).toBe('R-123')
    expect(got?.fechaPresentacion).toBe('2026-06-15')

    const all = await listSubmissions()
    expect(all.map((s) => s.id)).toEqual(['op-sub'])
  })
})
