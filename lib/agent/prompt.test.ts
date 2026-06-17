import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './prompt'
import { CRITERION_KEYS } from './schema'

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt()

  it('declara la regla de no inventar', () => {
    expect(prompt.toLowerCase()).toContain('no inventar')
  })
  it('exige citar la fuente', () => {
    expect(prompt.toLowerCase()).toContain('evidence')
  })
  it('menciona los 8 criterios ponderados', () => {
    for (const k of CRITERION_KEYS) expect(prompt).toContain(k)
  })
  it('incluye conocimiento de financiadores', () => {
    expect(prompt).toContain('FAO')
    expect(prompt).toContain('FONTAGRO')
  })
  it('aclara que NO debe calcular overall_score ni semáforo', () => {
    expect(prompt).toContain('overall_score')
  })
})
