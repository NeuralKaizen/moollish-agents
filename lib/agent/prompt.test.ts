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
  it('define la polaridad de los sub-scores (100 = más favorable)', () => {
    expect(prompt.toLowerCase()).toContain('favorable')
    // complejidad y riesgo van invertidos respecto al nombre del criterio
    expect(prompt.toLowerCase()).toContain('invertida')
  })
  it('guía la taxonomía §6 con las categorías del enum', () => {
    expect(prompt).toContain('financiacion_no_reembolsable')
    expect(prompt).toContain('contratacion_publica')
  })
  it('lista la salida obligatoria del Anexo A (acción inmediata)', () => {
    expect(prompt.toLowerCase()).toContain('acción inmediata')
  })
  it('inyecta la fecha de hoy para calcular due_date a 24-72h', () => {
    const p = buildSystemPrompt('2026-06-24')
    expect(p).toContain('2026-06-24')
  })
})
