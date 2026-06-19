import { describe, it, expect } from 'vitest'
import { assembleCorpus } from './corpus'

describe('assembleCorpus', () => {
  it('arma encabezados por fuente y cuenta chars incluidos', () => {
    const r = assembleCorpus(
      [
        { type: 'page', name: 'Convocatoria X', url: 'https://x.org', body: 'cuerpo pagina' },
        { type: 'pdf', name: 'bases.pdf', url: 'https://x.org/bases.pdf', body: 'cuerpo pdf' },
      ],
      { maxCharsPerDoc: 1000, totalBudget: 1000 },
    )
    expect(r.truncated).toBe(false)
    expect(r.text).toContain('### Página: Convocatoria X (https://x.org)')
    expect(r.text).toContain('cuerpo pagina')
    expect(r.text).toContain('### Documento: bases.pdf (https://x.org/bases.pdf)')
    expect(r.sources).toEqual([
      { type: 'page', name: 'Convocatoria X', url: 'https://x.org', chars: 'cuerpo pagina'.length },
      { type: 'pdf', name: 'bases.pdf', url: 'https://x.org/bases.pdf', chars: 'cuerpo pdf'.length },
    ])
  })

  it('recorta por maxCharsPerDoc y marca truncated', () => {
    const r = assembleCorpus(
      [{ type: 'pdf', name: 'g.pdf', url: null, body: 'abcdefghij' }],
      { maxCharsPerDoc: 4, totalBudget: 1000 },
    )
    expect(r.truncated).toBe(true)
    expect(r.sources[0].chars).toBe(4)
    expect(r.text).toContain('abcd')
    expect(r.text).not.toContain('abcde')
  })

  it('respeta el presupuesto total y marca truncated', () => {
    const r = assembleCorpus(
      [
        { type: 'page', name: 'p', url: null, body: 'aaaa' },
        { type: 'pdf', name: 'd', url: null, body: 'bbbb' },
      ],
      { maxCharsPerDoc: 1000, totalBudget: 6 },
    )
    expect(r.truncated).toBe(true)
    expect(r.sources[0].chars).toBe(4)
    expect(r.sources[1].chars).toBe(2)
  })

  it('omite el encabezado de URL cuando es null', () => {
    const r = assembleCorpus(
      [{ type: 'upload', name: 'subido.pdf', url: null, body: 'x' }],
      { maxCharsPerDoc: 1000, totalBudget: 1000 },
    )
    expect(r.text).toContain('### Documento: subido.pdf\n')
  })
})
