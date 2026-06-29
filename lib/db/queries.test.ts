// lib/db/queries.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { listOpportunities, getOpportunity } from './queries'
import type { DemoOpportunity } from '@/lib/demo/types'

const hasDb = !!process.env.DATABASE_URL

function fixture(id: string, createdAt: string): DemoOpportunity {
  return {
    analysis: { opportunity_id: id, source: { name: id } } as unknown as DemoOpportunity['analysis'],
    state: 'analizada',
    created_at: createdAt,
    responsible: null,
    decision_reason: null,
    tasks: [],
  }
}

describe.skipIf(!hasDb)('queries (integración)', () => {
  beforeEach(async () => { await db.delete(opportunities) })

  it('listOpportunities devuelve filas ordenadas por created_at desc', async () => {
    await db.insert(opportunities).values([
      opportunityToRow(fixture('vieja', '2026-06-01T00:00:00.000Z')),
      opportunityToRow(fixture('nueva', '2026-06-20T00:00:00.000Z')),
    ])
    const list = await listOpportunities()
    expect(list.map((o) => o.analysis.opportunity_id)).toEqual(['nueva', 'vieja'])
  })

  it('getOpportunity devuelve la fila o undefined', async () => {
    await db.insert(opportunities).values(opportunityToRow(fixture('uno', '2026-06-10T00:00:00.000Z')))
    expect((await getOpportunity('uno'))?.analysis.opportunity_id).toBe('uno')
    expect(await getOpportunity('no-existe')).toBeUndefined()
  })
})
