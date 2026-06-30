// lib/agent/drafts/concept-note.test.ts
import { describe, it, expect } from 'vitest'
import { buildConceptNotePrompt, generateConceptNote, ConceptNoteSchema } from './concept-note'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const analysis = {
  opportunity_id: 'op-1',
  source: { name: 'FAO AgrInnovation' },
  draft_outputs: { executive_summary: 'Fondo para agricultura resiliente.' },
} as unknown as OpportunityAnalysis

const stub = { problema: 'P', solucion: 'S', beneficiarios: 'B', innovacion: 'I', resultados: 'R', presupuesto_marco: 'PM', missing_data: ['monto exacto'] }

describe('concept-note generator', () => {
  it('buildConceptNotePrompt incluye el guardrail y el contexto del análisis', () => {
    const p = buildConceptNotePrompt(analysis, 'PERFIL: FAO')
    expect(p.toLowerCase()).toContain('borrador')
    expect(p.toLowerCase()).toContain('no inventar')
    expect(p).toContain('FAO AgrInnovation') // del análisis serializado
    expect(p).toContain('PERFIL: FAO')        // funderBlock inyectado
  })

  it('generateConceptNote llama a generate con el prompt y devuelve el ConceptNote', async () => {
    let receivedPrompt = ''
    const result = await generateConceptNote(analysis, 'PERFIL: FAO', {
      generate: async (prompt) => { receivedPrompt = prompt; return stub },
    })
    expect(result).toEqual(stub)
    expect(receivedPrompt.toLowerCase()).toContain('no inventar')
  })

  it('ConceptNoteSchema valida las 6 secciones + missing_data', () => {
    expect(ConceptNoteSchema.parse(stub).problema).toBe('P')
  })
})
