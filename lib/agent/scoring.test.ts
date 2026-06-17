import { describe, it, expect } from 'vitest'
import {
  computeOverallScore, scoreToSemaforo, semaforoToRecommendation,
  deriveRecommendation, hasCriticalGap,
} from './scoring'
import { DEFAULT_WEIGHTS } from './config'
import { CRITERION_KEYS, type CriterionKey } from './schema'

const scoresAll = (n: number) =>
  Object.fromEntries(CRITERION_KEYS.map((k) => [k, { score: n, justification: 'x' }])) as Record<
    CriterionKey, { score: number; justification: string }
  >

describe('pesos', () => {
  it('los pesos por defecto suman 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })
})

describe('computeOverallScore', () => {
  it('todo en 80 da 80', () => {
    expect(computeOverallScore(scoresAll(80))).toBe(80)
  })
  it('promedia ponderado y redondea', () => {
    const s = scoresAll(0)
    s.alineacion_estrategica.score = 100 // peso 0.20 -> 20
    expect(computeOverallScore(s)).toBe(20)
  })
})

describe('scoreToSemaforo', () => {
  it.each([
    [90, 'verde_alto'], [85, 'verde_alto'],
    [84, 'verde_condicionado'], [70, 'verde_condicionado'],
    [69, 'amarillo'], [55, 'amarillo'],
    [54, 'naranja'], [40, 'naranja'],
    [39, 'rojo'], [0, 'rojo'],
  ])('%i -> %s', (score, expected) => {
    expect(scoreToSemaforo(score as number)).toBe(expected)
  })
})

describe('semaforoToRecommendation', () => {
  it.each([
    ['verde_alto', 'apply_now'],
    ['verde_condicionado', 'apply_with_partner'],
    ['amarillo', 'observe'],
    ['naranja', 'observe'],
    ['rojo', 'discard'],
  ])('%s -> %s', (s, expected) => {
    expect(semaforoToRecommendation(s as never)).toBe(expected)
  })
})

describe('hasCriticalGap', () => {
  const ok = {
    deadline: { date: '2026-09-30', verified: true },
    funding_amount: { value: 100000, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null },
    eligibility: { eligible_entities: ['ONG'], countries: [], restrictions: [], required_documents: [], gaps: [] },
  }
  it('false cuando hay deadline, monto y elegibilidad', () => {
    expect(hasCriticalGap(ok)).toBe(false)
  })
  it('true si falta deadline', () => {
    expect(hasCriticalGap({ ...ok, deadline: { date: null, verified: false } })).toBe(true)
  })
  it('true si no hay entidades elegibles', () => {
    expect(hasCriticalGap({ ...ok, eligibility: { ...ok.eligibility, eligible_entities: [] } })).toBe(true)
  })
})

describe('deriveRecommendation', () => {
  it('verde_alto sin gap -> apply_now', () => {
    expect(deriveRecommendation('verde_alto', false)).toBe('apply_now')
  })
  it('verde_alto con gap crítico -> request_info', () => {
    expect(deriveRecommendation('verde_alto', true)).toBe('request_info')
  })
  it('rojo con gap -> sigue discard (descartar gana)', () => {
    expect(deriveRecommendation('rojo', true)).toBe('discard')
  })
})
