// lib/db/actions.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { opportunities } from './schema'
import { getOpportunity, listOpportunities } from './queries'
import {
  addOpportunityAction, setOpportunityStateAction, toggleOpportunityTaskAction, resetDemoAction,
} from './actions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL

const analysis = {
  opportunity_id: 'caso-x',
  source: { name: 'Caso X' },
  next_actions: [
    { action: 'Pedir términos', responsible: 'Alex', due_date: '2026-07-01', dependency: null },
  ],
} as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('actions (integración)', () => {
  beforeEach(async () => { await db.delete(opportunities) })

  it('addOpportunityAction inserta con estado analizada y tareas desde next_actions', async () => {
    await addOpportunityAction(analysis)
    const o = await getOpportunity('caso-x')
    expect(o?.state).toBe('analizada')
    expect(o?.tasks).toHaveLength(1)
    expect(o?.tasks[0].done).toBe(false)
  })

  it('addOpportunityAction es idempotente (upsert por id)', async () => {
    await addOpportunityAction(analysis)
    await addOpportunityAction(analysis)
    expect(await listOpportunities()).toHaveLength(1)
  })

  it('setOpportunityStateAction cambia estado y guarda razón', async () => {
    await addOpportunityAction(analysis)
    await setOpportunityStateAction('caso-x', 'descartada', 'no alineada')
    const o = await getOpportunity('caso-x')
    expect(o?.state).toBe('descartada')
    expect(o?.decision_reason).toBe('no alineada')
  })

  it('toggleOpportunityTaskAction alterna el done de la tarea por índice', async () => {
    await addOpportunityAction(analysis)
    await toggleOpportunityTaskAction('caso-x', 0)
    expect((await getOpportunity('caso-x'))?.tasks[0].done).toBe(true)
    await toggleOpportunityTaskAction('caso-x', 0)
    expect((await getOpportunity('caso-x'))?.tasks[0].done).toBe(false)
  })

  it('resetDemoAction deja exactamente la semilla', async () => {
    await addOpportunityAction(analysis)
    await resetDemoAction()
    const list = await listOpportunities()
    expect(list.length).toBeGreaterThan(0)
    expect(list.some((o) => o.analysis.opportunity_id === 'caso-x')).toBe(false)
  })
})
