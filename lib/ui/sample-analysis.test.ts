import { describe, it, expect } from 'vitest'
import { OpportunityAnalysisSchema } from '@/lib/agent/schema'
import { SAMPLE_ANALYSIS } from './sample-analysis'

describe('SAMPLE_ANALYSIS', () => {
  it('cumple el contrato OpportunityAnalysis', () => {
    expect(() => OpportunityAnalysisSchema.parse(SAMPLE_ANALYSIS)).not.toThrow()
  })
})
