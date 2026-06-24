import { describe, it, expect } from 'vitest'
import { PIPELINE_STATES, tasksFromAnalysis } from './types'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'

describe('PIPELINE_STATES', () => {
  it('tiene los 10 estados del §14 en orden', () => {
    expect(PIPELINE_STATES).toEqual([
      'detectada', 'analizada', 'priorizada', 'en_alianzas', 'en_formulacion',
      'presentada', 'en_evaluacion', 'aprobada', 'rechazada', 'descartada',
    ])
  })
})

describe('tasksFromAnalysis', () => {
  it('convierte next_actions en tareas no completadas', () => {
    expect(SAMPLE_ANALYSIS.next_actions.length).toBeGreaterThan(0)
    const tasks = tasksFromAnalysis(SAMPLE_ANALYSIS)
    expect(tasks).toHaveLength(SAMPLE_ANALYSIS.next_actions.length)
    expect(tasks[0]).toEqual({
      action: SAMPLE_ANALYSIS.next_actions[0].action,
      responsible: SAMPLE_ANALYSIS.next_actions[0].responsible,
      due_date: SAMPLE_ANALYSIS.next_actions[0].due_date,
      dependency: SAMPLE_ANALYSIS.next_actions[0].dependency,
      done: false,
    })
  })
})
