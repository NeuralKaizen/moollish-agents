// lib/demo/seed.test.ts
import { describe, it, expect } from 'vitest'
import { SEED_OPPORTUNITIES } from './seed'
import { OpportunityAnalysisSchema } from '@/lib/agent/schema'

describe('SEED_OPPORTUNITIES', () => {
  it('siembra los 5 casos del §20', () => {
    expect(SEED_OPPORTUNITIES).toHaveLength(5)
  })
  it('cada análisis cumple el contrato OpportunityAnalysis', () => {
    for (const o of SEED_OPPORTUNITIES) {
      expect(() => OpportunityAnalysisSchema.parse(o.analysis)).not.toThrow()
    }
  })
  it('cubre estados variados del pipeline', () => {
    const states = new Set(SEED_OPPORTUNITIES.map((o) => o.state))
    expect(states.size).toBeGreaterThanOrEqual(4)
  })
  it('la oportunidad descartada registra su causa', () => {
    const descartada = SEED_OPPORTUNITIES.find((o) => o.state === 'descartada')
    expect(descartada?.decision_reason).toBeTruthy()
  })
})
