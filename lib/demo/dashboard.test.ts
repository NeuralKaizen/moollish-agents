import { describe, it, expect } from 'vitest'
import {
  montoUSD, newOpportunities, pipelineByState, topToApply,
  criticalRisks, requiredAllies, potentialResources, actionsToday,
} from './dashboard'
import { makeOpportunity, setOpportunityState } from './operations'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'
import type { DemoOpportunity } from './types'

const NOW = Date.parse('2026-06-23T12:00:00.000Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

function opp(overrides: Partial<DemoOpportunity> = {}, analysisOverrides = {}): DemoOpportunity {
  const base = makeOpportunity({ ...SAMPLE_ANALYSIS, ...analysisOverrides }, iso(0))
  return { ...base, ...overrides }
}

describe('montoUSD', () => {
  it('usa estimated_usd si existe', () => {
    expect(montoUSD({ ...SAMPLE_ANALYSIS.funding_amount, estimated_usd: 1000 })).toBe(1000)
  })
  it('usa value si la moneda es USD y no hay estimado', () => {
    expect(montoUSD({ value: 500, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null, range_min: null, range_max: null })).toBe(500)
  })
  it('null si no se puede normalizar', () => {
    expect(montoUSD({ value: 500, currency: 'EUR', confirmed: true, estimated_cop: null, estimated_usd: null, range_min: null, range_max: null })).toBeNull()
  })
})

describe('newOpportunities', () => {
  it('filtra por ventana de 72h', () => {
    const list = [opp({ created_at: iso(0) }), opp({ created_at: iso(100 * 3_600_000) }, { opportunity_id: 'vieja' })]
    expect(newOpportunities(list, NOW, 72)).toHaveLength(1)
  })
})

describe('pipelineByState', () => {
  it('cuenta por estado en orden del §14', () => {
    const list = [opp(), setOpportunityState([opp({}, { opportunity_id: 'b' })], 'b', 'descartada')[0]]
    const buckets = pipelineByState(list)
    const analizada = buckets.find((b) => b.state === 'analizada')
    expect(analizada?.count).toBe(1)
  })
})

describe('topToApply', () => {
  it('ordena por score desc y respeta n', () => {
    const hi = opp({}, { opportunity_id: 'hi', overall_score: 90, recommendation: 'apply_now' })
    const lo = opp({}, { opportunity_id: 'lo', overall_score: 50, recommendation: 'apply_with_partner' })
    const out = topToApply([lo, hi], 10)
    expect(out[0].analysis.opportunity_id).toBe('hi')
  })
  it('excluye recomendaciones que no son aplicar', () => {
    const obs = opp({}, { opportunity_id: 'obs', recommendation: 'observe' })
    expect(topToApply([obs])).toHaveLength(0)
  })
})

describe('criticalRisks', () => {
  it('marca las que tienen gaps de elegibilidad', () => {
    const conGap = opp({}, { opportunity_id: 'g', eligibility: { ...SAMPLE_ANALYSIS.eligibility, gaps: ['falta socio'] } })
    expect(criticalRisks([conGap])).toHaveLength(1)
  })
})

describe('requiredAllies', () => {
  it('agrega partners_needed por tipo', () => {
    const out = requiredAllies([opp()])
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out[0]).toHaveProperty('count')
  })
})

describe('potentialResources', () => {
  it('suma monto USD ponderado por score', () => {
    const o = opp({}, { opportunity_id: 'r', overall_score: 50, funding_amount: { ...SAMPLE_ANALYSIS.funding_amount, estimated_usd: 1000 } })
    expect(potentialResources([o])).toBe(500)
  })
})

describe('actionsToday', () => {
  it('lista tareas no hechas con due_date <= hoy', () => {
    const o = opp()
    o.tasks = [{ action: 'x', responsible: 'y', due_date: '2026-06-23', dependency: null, done: false }]
    expect(actionsToday([o], NOW)).toHaveLength(1)
  })
  it('excluye tareas hechas', () => {
    const o = opp()
    o.tasks = [{ action: 'x', responsible: 'y', due_date: '2026-06-23', dependency: null, done: true }]
    expect(actionsToday([o], NOW)).toHaveLength(0)
  })
})
