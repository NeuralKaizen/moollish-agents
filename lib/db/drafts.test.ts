// lib/db/drafts.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { drafts, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { recordDraft, getDraft, listDrafts } from './drafts'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-cn', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('drafts queries (integración)', () => {
  beforeEach(async () => { await db.delete(drafts); await db.delete(opportunities) })

  it('recordDraft inserta y getDraft lo recupera; regenerar reemplaza', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    const stub = { problema: 'A', solucion: '', beneficiarios: '', innovacion: '', resultados: '', presupuesto_marco: '' }
    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: stub, missingData: ['x'] })
    let d = await getDraft('op-cn', 'concept_note')
    expect(d?.content.problema).toBe('A')

    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: { ...stub, problema: 'B' }, missingData: [] })
    d = await getDraft('op-cn', 'concept_note')
    expect(d?.content.problema).toBe('B') // reemplazado
    expect(d?.missingData).toEqual([])
  })

  it('getDraft devuelve undefined si no existe', async () => {
    expect(await getDraft('nope', 'concept_note')).toBeUndefined()
  })

  it('listDrafts devuelve los borradores de la oportunidad', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: { problema: 'A' }, missingData: [] })
    await recordDraft({ id: 'op-cn:cronograma', opportunityId: 'op-cn', kind: 'cronograma', content: { fases: 'F' }, missingData: [] })
    const list = await listDrafts('op-cn')
    expect(list).toHaveLength(2)
    expect(new Set(list.map((d) => d.kind))).toEqual(new Set(['concept_note', 'cronograma']))
  })
})
