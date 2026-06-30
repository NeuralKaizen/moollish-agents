// lib/agent/drafts/generate.test.ts
import { describe, it, expect } from 'vitest'
import { buildDraftPrompt, generateDraft, GUARDRAIL } from './generate'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const analysis = { opportunity_id: 'op-1', source: { name: 'FAO AgrInnovation' } } as unknown as OpportunityAnalysis

describe('generic draft generator', () => {
  it('GUARDRAIL declara borrador y no-inventar', () => {
    expect(GUARDRAIL.toLowerCase()).toContain('borrador')
    expect(GUARDRAIL.toLowerCase()).toContain('no inventar')
  })

  it('buildDraftPrompt incluye guardrail, secciones del tipo y contexto', () => {
    const p = buildDraftPrompt('matriz_riesgos', analysis, 'PERFIL: FAO')
    expect(p.toLowerCase()).toContain('no inventar')
    expect(p).toContain('Mitigaciones')         // sección del tipo matriz_riesgos
    expect(p).toContain('FAO AgrInnovation')    // del análisis serializado
    expect(p).toContain('PERFIL: FAO')          // funderBlock
  })

  it('generateDraft separa content (secciones) de missingData', async () => {
    const fake = async () => ({ fin: 'F', proposito: 'P', componentes: 'C', actividades: 'A', indicadores: 'I', medios_verificacion: 'M', supuestos: 'S', missing_data: ['indicador base'] })
    const { content, missingData } = await generateDraft('marco_logico', analysis, 'PERFIL', { generate: fake })
    expect(content.fin).toBe('F')
    expect(content.missing_data).toBeUndefined() // no se filtra a content
    expect(missingData).toEqual(['indicador base'])
  })
})
