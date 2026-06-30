import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { submissions, opportunities, funders } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { getSubmission } from './submissions'
import { getOpportunity } from './queries'
import { getFunder } from './funders'
import { saveSubmissionAction, recordOutcomeAction, saveLessonToFunderAction } from './submission-actions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-sa', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis
const analysisFao = { opportunity_id: 'op-out', source: { name: 'FAO AgrInnovation' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('submission actions (integración)', () => {
  beforeEach(async () => { await db.delete(submissions); await db.delete(opportunities); await db.delete(funders) })

  it('upsert: crea y luego actualiza por id', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))

    await saveSubmissionAction('op-sa', { radicado: 'R-1', fechaPresentacion: '2026-06-15' })
    expect((await getSubmission('op-sa'))?.radicado).toBe('R-1')

    await saveSubmissionAction('op-sa', { radicado: 'R-2', proximoHito: 'sustentación' })
    const got = await getSubmission('op-sa')
    expect(got?.radicado).toBe('R-2')
    expect(got?.proximoHito).toBe('sustentación')
  })

  it('recordOutcomeAction guarda el resultado y sincroniza el estado', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordOutcomeAction('op-sa', { resultado: 'ganada', montoOtorgado: 'USD 100k', leccion: 'buena alianza' })
    const sub = await getSubmission('op-sa')
    expect(sub?.resultado).toBe('ganada')
    expect(sub?.montoOtorgado).toBe('USD 100k')
    expect((await getOpportunity('op-sa'))?.state).toBe('aprobada')
  })

  it('saveLessonToFunderAction anexa la lección al financiador matcheado y marca el flag', async () => {
    await db.insert(funders).values({ id: 'fao', name: 'FAO', aliases: ['FAO'] })
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysisFao, new Date().toISOString())))
    await recordOutcomeAction('op-out', { resultado: 'perdida', montoOtorgado: null, leccion: 'faltó socio local' })

    const res = await saveLessonToFunderAction('op-out')
    expect(res.status).toBe('anexada')
    expect((await getFunder('fao'))?.lessonsLearned).toContain('faltó socio local')
    expect((await getSubmission('op-out'))?.leccionAnexada).toBe(true)
  })

  it('saveLessonToFunderAction sin lección → sin_leccion', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    expect((await saveLessonToFunderAction('op-sa')).status).toBe('sin_leccion')
  })

  it('saveLessonToFunderAction sin financiador matcheado → sin_financiador', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordOutcomeAction('op-sa', { resultado: 'otro', montoOtorgado: null, leccion: 'algo aprendí' })
    expect((await saveLessonToFunderAction('op-sa')).status).toBe('sin_financiador')
  })
})
