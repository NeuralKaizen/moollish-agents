import { describe, it, expect } from 'vitest'
import { analyzeOpportunity } from './analyze'
import { CRITERION_KEYS, type LlmAnalysis } from './schema'

function stubLlm(overrides: Partial<LlmAnalysis> = {}): LlmAnalysis {
  return {
    source: { name: 'FAO', url: null, channel: 'manual', confidence_level: 'media' },
    classification: { category: 'financiacion_no_reembolsable', subcategory: null, instrument: null, themes: ['agtech'], geography: ['CO'] },
    deadline: { date: '2026-09-30', verified: true },
    funding_amount: { value: 100000, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null, range_min: null, range_max: null },
    eligibility: { eligible_entities: ['ONG'], countries: ['CO'], restrictions: [], required_documents: [], gaps: [] },
    recommended_vehicle: 'moollish_sat2farm',
    vehicle_rationale: 'satelital',
    criteria_scores: Object.fromEntries(CRITERION_KEYS.map((k) => [k, { score: 90, justification: 'x' }])) as LlmAnalysis['criteria_scores'],
    institutional_fit: { moollish: 90, sat2farm: 85, foundation_nova: 40, alliance: 70 },
    effort: 'medio', risk: 'bajo', main_gap: 'aliado',
    partners_needed: [], risks: [], next_actions: [], evidence: [], missing_data: [],
    draft_outputs: { executive_summary: 'r', narrative_angle: 'n' },
    ...overrides,
  }
}

const fixedDeps = (llm: LlmAnalysis) => ({
  generate: async () => llm,
  now: () => '2026-06-17T00:00:00.000Z',
  uuid: () => 'fixed-id',
})

describe('analyzeOpportunity', () => {
  it('calcula overall_score, semáforo y decisión a partir de los criterios', async () => {
    const r = await analyzeOpportunity('texto', fixedDeps(stubLlm()))
    expect(r.overall_score).toBe(90)
    expect(r.semaforo).toBe('verde_alto')
    expect(r.recommendation).toBe('apply_now')
    expect(r.opportunity_id).toBe('fixed-id')
    expect(r.analysis_meta.analyzed_at).toBe('2026-06-17T00:00:00.000Z')
  })

  it('fuerza request_info si falta la fecha límite', async () => {
    const llm = stubLlm({ deadline: { date: null, verified: false } })
    const r = await analyzeOpportunity('texto', fixedDeps(llm))
    expect(r.recommendation).toBe('request_info')
  })

  it('aplica pesos personalizados', async () => {
    const llm = stubLlm({
      criteria_scores: Object.fromEntries(
        CRITERION_KEYS.map((k) => [k, { score: k === 'alineacion_estrategica' ? 100 : 0, justification: 'x' }]),
      ) as LlmAnalysis['criteria_scores'],
    })
    const weights = { ...await import('./config').then((m) => m.DEFAULT_WEIGHTS) }
    const r = await analyzeOpportunity('texto', fixedDeps(llm), { weights })
    expect(r.overall_score).toBe(20)
  })

  it('computa days_remaining desde la fecha límite y el timestamp', async () => {
    const r = await analyzeOpportunity('texto', fixedDeps(stubLlm()))
    expect(r.deadline.days_remaining).toBe(105)
  })

  it('days_remaining es null si no hay fecha límite', async () => {
    const r = await analyzeOpportunity('texto', fixedDeps(stubLlm({ deadline: { date: null, verified: false } })))
    expect(r.deadline.days_remaining).toBeNull()
  })

  it('days_remaining cae a null si la fecha es inválida (no NaN)', async () => {
    const r = await analyzeOpportunity('texto', fixedDeps(stubLlm({ deadline: { date: 'no-es-una-fecha', verified: false } })))
    expect(r.deadline.days_remaining).toBeNull()
  })
})
