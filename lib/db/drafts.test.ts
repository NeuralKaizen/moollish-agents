// lib/db/drafts.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { drafts, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { recordDraft, getDraft } from './drafts'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-cn', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('drafts queries (integración)', () => {
  beforeEach(async () => { await db.delete(drafts); await db.delete(opportunities) })

  it('recordDraft inserta y getDraft lo recupera; regenerar reemplaza', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: { problema: 'A' }, missingData: ['x'] })
    let d = await getDraft('op-cn', 'concept_note')
    expect((d?.content as { problema?: string }).problema).toBe('A')

    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: { problema: 'B' }, missingData: [] })
    d = await getDraft('op-cn', 'concept_note')
    expect((d?.content as { problema?: string }).problema).toBe('B') // reemplazado
    expect(d?.missingData).toEqual([])
  })

  it('getDraft devuelve undefined si no existe', async () => {
    expect(await getDraft('nope', 'concept_note')).toBeUndefined()
  })
})
