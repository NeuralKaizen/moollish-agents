import { describe, it, expect } from 'vitest'
import {
  nextRelevantDate, rankInFlight, deadlineCounts, buildTrackingInputs,
  type TrackingInput,
} from './deadlines'
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import type { SubmissionRow } from '@/lib/db/schema'

const today = new Date('2026-06-30T00:00:00Z')

describe('nextRelevantDate', () => {
  it('antes de presentar usa el deadline de la convocatoria', () => {
    const r = nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-07-15', submission: null }, today)
    expect(r.kind).toBe('deadline')
    expect(r.date).toBe('2026-07-15')
    expect(r.daysLeft).toBe(15)
    expect(r.urgency).toBe('proxima')
  })

  it('presentada elige la fecha más temprana entre hito y resultado', () => {
    const r = nextRelevantDate(
      { state: 'presentada', deadlineDate: '2026-12-01', submission: { proximoHitoFecha: '2026-07-10', fechaResultadoEsp: '2026-09-01' } },
      today,
    )
    expect(r.kind).toBe('hito')
    expect(r.date).toBe('2026-07-10')
  })

  it('en_evaluacion sin fechas de postulación cae al deadline', () => {
    const r = nextRelevantDate(
      { state: 'en_evaluacion', deadlineDate: '2026-07-05', submission: { proximoHitoFecha: null, fechaResultadoEsp: null } },
      today,
    )
    expect(r.kind).toBe('deadline')
    expect(r.daysLeft).toBe(5)
    expect(r.urgency).toBe('urgente')
  })

  it('clasifica los buckets de urgencia', () => {
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-06-01', submission: null }, today).urgency).toBe('vencida')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-07-02', submission: null }, today).urgency).toBe('urgente')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-07-20', submission: null }, today).urgency).toBe('proxima')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-09-30', submission: null }, today).urgency).toBe('lejana')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: null, submission: null }, today).urgency).toBe('sin_fecha')
  })

  it('fecha inválida → sin_fecha', () => {
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: 'no-es-fecha', submission: null }, today).urgency).toBe('sin_fecha')
  })
})

function input(opportunityId: string, state: PipelineState, deadlineDate: string | null, submission: TrackingInput['submission'] = null): TrackingInput {
  return { opportunityId, name: opportunityId, state, deadlineDate, submission }
}

describe('rankInFlight', () => {
  it('filtra fuera pre-decisión y cerradas, ordena por daysLeft asc con sin_fecha al final', () => {
    const items: TrackingInput[] = [
      input('cerrada', 'aprobada', '2026-07-01'),
      input('pre', 'analizada', '2026-07-01'),
      input('lejana', 'priorizada', '2026-09-30'),
      input('vencida', 'en_formulacion', '2026-06-10'),
      input('sinfecha', 'en_alianzas', null),
      input('urgente', 'priorizada', '2026-07-03'),
    ]
    const ranked = rankInFlight(items, today)
    expect(ranked.map((r) => r.opportunityId)).toEqual(['vencida', 'urgente', 'lejana', 'sinfecha'])
  })
})

describe('deadlineCounts', () => {
  it('cuenta vencidas, esta semana y en evaluación', () => {
    const items: TrackingInput[] = [
      input('a', 'priorizada', '2026-06-10'),   // vencida
      input('b', 'priorizada', '2026-07-03'),   // urgente
      input('c', 'en_evaluacion', '2026-09-30'), // lejana + en_evaluacion
    ]
    const counts = deadlineCounts(rankInFlight(items, today))
    expect(counts).toEqual({ vencidas: 1, estaSemana: 1, enEvaluacion: 1 })
  })
})

describe('buildTrackingInputs', () => {
  function opp(id: string, state: PipelineState, deadline: string | null): DemoOpportunity {
    return {
      analysis: { opportunity_id: id, source: { name: `n-${id}` }, deadline: { date: deadline, verified: false } },
      state, created_at: '', responsible: null, tasks: [], decision_reason: null,
    } as unknown as DemoOpportunity
  }
  it('une cada oportunidad con su submission por id (null si no hay)', () => {
    const opps = [opp('a', 'presentada', '2026-08-01'), opp('b', 'priorizada', null)]
    const subs = [{ id: 'a', fechaResultadoEsp: '2026-09-01', proximoHitoFecha: null } as SubmissionRow]
    const inputs = buildTrackingInputs(opps, subs)
    expect(inputs[0]).toMatchObject({ opportunityId: 'a', name: 'n-a', state: 'presentada', deadlineDate: '2026-08-01' })
    expect(inputs[0].submission).toEqual({ id: 'a', fechaResultadoEsp: '2026-09-01', proximoHitoFecha: null })
    expect(inputs[1].submission).toBeNull()
  })
})
