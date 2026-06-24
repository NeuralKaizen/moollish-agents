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
  it('al deduplicar, deja la entrada actualizada en el índice 0', () => {
    const a = SAMPLE_ANALYSIS
    const b = { ...SAMPLE_ANALYSIS, opportunity_id: 'b' }
    let list = addOpportunity([], a, 't1')   // [a]
    list = addOpportunity(list, b, 't2')      // [b, a]
    list = addOpportunity(list, a, 't3')      // [a', b]
    expect(list).toHaveLength(2)
    expect(list[0].analysis.opportunity_id).toBe(a.opportunity_id)
    expect(list[0].created_at).toBe('t3')
  })
})

describe('setOpportunityState', () => {
  it('cambia estado y guarda la razón', () => {
    const list = setOpportunityState(addOpportunity([], A, 't'), id, 'descartada', 'no alineada')
    expect(list[0].state).toBe('descartada')
    expect(list[0].decision_reason).toBe('no alineada')
  })
  it('setOpportunityState con id inexistente no cambia nada', () => {
    const list = addOpportunity([], SAMPLE_ANALYSIS, 't')
    expect(setOpportunityState(list, 'no-existe', 'descartada')).toEqual(list)
  })
})

describe('toggleOpportunityTask', () => {
  it('alterna done de la tarea por índice', () => {
    const list = toggleOpportunityTask(addOpportunity([], A, 't'), id, 0)
    expect(list[0].tasks[0].done).toBe(true)
  })
  it('toggleOpportunityTask con índice fuera de rango no cambia nada', () => {
    const list = addOpportunity([], SAMPLE_ANALYSIS, 't')
    expect(toggleOpportunityTask(list, SAMPLE_ANALYSIS.opportunity_id, 999)).toEqual(list)
  })
})

describe('pureza', () => {
  it('no muta la lista ni las oportunidades de entrada (es puro)', () => {
    const original = addOpportunity([], SAMPLE_ANALYSIS, 't')
    const snapshot = JSON.parse(JSON.stringify(original))
    setOpportunityState(original, SAMPLE_ANALYSIS.opportunity_id, 'descartada', 'x')
    toggleOpportunityTask(original, SAMPLE_ANALYSIS.opportunity_id, 0)
    expect(original).toEqual(snapshot)
  })
})
