// lib/agent/drafts/registry.test.ts
import { describe, it, expect } from 'vitest'
import { DRAFT_KINDS, getDraftKind, buildKindSchema } from './registry'

describe('draft registry', () => {
  it('define los 6 entregables del §13 con secciones no vacías', () => {
    const kinds = DRAFT_KINDS.map((k) => k.kind)
    expect(kinds).toEqual(['concept_note', 'teoria_cambio', 'marco_logico', 'presupuesto', 'cronograma', 'matriz_riesgos'])
    for (const k of DRAFT_KINDS) {
      expect(k.label.length).toBeGreaterThan(0)
      expect(k.sections.length).toBeGreaterThan(0)
      for (const s of k.sections) { expect(s.key.length).toBeGreaterThan(0); expect(s.label.length).toBeGreaterThan(0) }
    }
  })

  it('getDraftKind devuelve el tipo o undefined', () => {
    expect(getDraftKind('concept_note')?.label).toBeTruthy()
    expect(getDraftKind('nope')).toBeUndefined()
  })

  it('buildKindSchema deriva un schema con las secciones del tipo + missing_data', () => {
    const schema = buildKindSchema('concept_note')
    const full = { problema: 'p', solucion: 's', beneficiarios: 'b', innovacion: 'i', resultados: 'r', presupuesto_marco: 'pm', missing_data: ['x'] }
    expect(schema.parse(full).problema).toBe('p')
    expect(() => schema.parse({ problema: 'p' })).toThrow() // falta el resto de secciones
  })

  it('buildKindSchema lanza con un kind desconocido', () => {
    expect(() => buildKindSchema('nope')).toThrow()
  })
})
