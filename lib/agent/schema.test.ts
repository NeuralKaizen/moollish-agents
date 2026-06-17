import { describe, it, expect } from 'vitest'
import { LlmAnalysisSchema, CRITERION_KEYS } from './schema'

const validLlm = {
  source: { name: 'FAO', url: null, channel: 'manual', confidence_level: 'media' },
  classification: { category: 'financiacion_no_reembolsable', subcategory: null, instrument: null, themes: ['agtech'], geography: ['CO'] },
  deadline: { date: '2026-09-30', verified: true },
  funding_amount: { value: 100000, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null, range_min: null, range_max: null },
  eligibility: { eligible_entities: ['ONG'], countries: ['CO'], restrictions: [], required_documents: [], gaps: [] },
  recommended_vehicle: 'moollish_sat2farm',
  vehicle_rationale: 'componente satelital',
  criteria_scores: Object.fromEntries(CRITERION_KEYS.map((k) => [k, { score: 80, justification: 'x' }])),
  institutional_fit: { moollish: 90, sat2farm: 85, foundation_nova: 40, alliance: 70 },
  effort: 'medio',
  risk: 'bajo',
  main_gap: 'aliado académico',
  partners_needed: [{ gap: 'investigación', ally_type: 'universidad', suggested_role: 'metodología', priority: 'alto', reason: 'exige I+D' }],
  risks: [{ type: 'tiempo', description: 'deadline ajustado', severity: 'medio' }],
  next_actions: [{ action: 'contactar universidad', responsible: 'Alex', due_date: '2026-06-19', dependency: null }],
  evidence: [{ claim: 'fecha límite', quote: 'cierre 30 sep', field: 'deadline' }],
  missing_data: [],
  draft_outputs: { executive_summary: 'resumen', narrative_angle: 'agricultura resiliente' },
}

describe('LlmAnalysisSchema', () => {
  it('acepta un objeto válido', () => {
    expect(LlmAnalysisSchema.parse(validLlm)).toBeTruthy()
  })

  it('rechaza un sub-score fuera de rango', () => {
    const bad = { ...validLlm, criteria_scores: { ...validLlm.criteria_scores, elegibilidad: { score: 150, justification: 'x' } } }
    expect(() => LlmAnalysisSchema.parse(bad)).toThrow()
  })

  it('rechaza si falta un criterio', () => {
    const { riesgo_ejecucion, ...partial } = validLlm.criteria_scores as Record<string, unknown>
    const bad = { ...validLlm, criteria_scores: partial }
    expect(() => LlmAnalysisSchema.parse(bad)).toThrow()
  })
})
