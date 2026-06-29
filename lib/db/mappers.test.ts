import { describe, it, expect } from 'vitest'
import { rowToOpportunity, opportunityToRow } from './mappers'
import type { OpportunityRow } from './schema'
import type { DemoOpportunity } from '@/lib/demo/types'

const analysis = {
  opportunity_id: 'fao-agrinno',
  source: { name: 'FAO AgrInnovation', url: null, kind: 'text', captured_at: '2026-06-28', confidence: 'alta' },
  deadline: { date: '2026-09-30', verified: true },
  funding_amount: { value: 250000, currency: 'USD', confirmed: true, estimated_usd: 250000 },
  eligibility: { who: 'ONG y empresas', restrictions: [], gaps: [] },
  fit: { moollish: 90, sat2farm: 88, foundation_nova: 55 },
  semaforo: 'verde_condicionado',
  overall_score: 82,
  recommendation: 'apply_with_partner',
  risk: 'medio',
  risks: [],
  partners_needed: [],
  next_actions: [],
  evidence: [],
  missing_data: [],
  scores: {},
  draft_outputs: {},
} as unknown as DemoOpportunity['analysis']

describe('mappers', () => {
  it('rowToOpportunity convierte fila a dominio (created_at a ISO)', () => {
    const row: OpportunityRow = {
      id: 'fao-agrinno',
      state: 'priorizada',
      createdAt: new Date('2026-06-27T10:00:00.000Z'),
      responsible: 'Alex',
      decisionReason: null,
      analysis,
      tasks: [{ action: 'Contactar universidad', responsible: 'Alex', due_date: '2026-06-29', dependency: null, done: false }],
    }
    const o = rowToOpportunity(row)
    expect(o.state).toBe('priorizada')
    expect(o.created_at).toBe('2026-06-27T10:00:00.000Z')
    expect(o.responsible).toBe('Alex')
    expect(o.decision_reason).toBeNull()
    expect(o.tasks).toHaveLength(1)
    expect(o.analysis.opportunity_id).toBe('fao-agrinno')
  })

  it('opportunityToRow es el inverso (id desde opportunity_id, created_at a Date)', () => {
    const o: DemoOpportunity = {
      analysis,
      state: 'analizada',
      created_at: '2026-06-27T10:00:00.000Z',
      responsible: null,
      decision_reason: 'sin fondos',
      tasks: [],
    }
    const row = opportunityToRow(o)
    expect(row.id).toBe('fao-agrinno')
    expect(row.state).toBe('analizada')
    expect(row.createdAt).toEqual(new Date('2026-06-27T10:00:00.000Z'))
    expect(row.decisionReason).toBe('sin fondos')
    expect(row.tasks).toEqual([])
  })
})
