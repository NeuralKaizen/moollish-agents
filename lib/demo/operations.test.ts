import { describe, it, expect } from 'vitest'
import { addOpportunity, setOpportunityState, toggleOpportunityTask } from './operations'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'

const A = SAMPLE_ANALYSIS
const id = A.opportunity_id

describe('addOpportunity', () => {
  it('inserta al principio en estado analizada con tareas', () => {
    const list = addOpportunity([], A, '2026-06-23T00:00:00.000Z')
    expect(list).toHaveLength(1)
    expect(list[0].state).toBe('analizada')
    expect(list[0].created_at).toBe('2026-06-23T00:00:00.000Z')
    expect(list[0].tasks).toHaveLength(A.next_actions.length)
  })
  it('reemplaza (no duplica) si vuelve el mismo opportunity_id', () => {
    const list = addOpportunity(addOpportunity([], A, 't1'), A, 't2')
    expect(list).toHaveLength(1)
    expect(list[0].created_at).toBe('t2')
  })
})

describe('setOpportunityState', () => {
  it('cambia estado y guarda la razón', () => {
    const list = setOpportunityState(addOpportunity([], A, 't'), id, 'descartada', 'no alineada')
    expect(list[0].state).toBe('descartada')
    expect(list[0].decision_reason).toBe('no alineada')
  })
})

describe('toggleOpportunityTask', () => {
  it('alterna done de la tarea por índice', () => {
    const list = toggleOpportunityTask(addOpportunity([], A, 't'), id, 0)
    expect(list[0].tasks[0].done).toBe(true)
  })
})
