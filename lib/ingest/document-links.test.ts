import { describe, it, expect } from 'vitest'
import { selectDocumentLinks, docNameFromUrl } from './document-links'

const PAGE = 'https://fontagro.org/convocatoria-2026'

describe('selectDocumentLinks', () => {
  it('elige PDFs y docs por extensión, resolviendo relativos a absolutos', () => {
    const links = ['/files/bases.pdf', 'https://fontagro.org/anexo.docx', 'https://fontagro.org/']
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 5 })).toEqual([
      'https://fontagro.org/files/bases.pdf',
      'https://fontagro.org/anexo.docx',
    ])
  })

  it('elige por palabra clave aunque no tenga extensión de doc', () => {
    const links = ['https://fontagro.org/cronograma', 'https://fontagro.org/inicio']
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 5 })).toEqual([
      'https://fontagro.org/cronograma',
    ])
  })

  it('prioriza el mismo dominio y respeta el cap', () => {
    const links = [
      'https://otrositio.com/a.pdf',
      'https://fontagro.org/b.pdf',
      'https://fontagro.org/c.pdf',
    ]
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 2 })).toEqual([
      'https://fontagro.org/b.pdf',
      'https://fontagro.org/c.pdf',
    ])
  })

  it('deduplica y descarta links inválidos', () => {
    const links = ['/x.pdf', '/x.pdf', 'no es url']
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 5 })).toEqual([
      'https://fontagro.org/x.pdf',
    ])
  })

  it('docNameFromUrl saca el nombre de archivo legible', () => {
    expect(docNameFromUrl('https://fontagro.org/files/bases%20generales.pdf')).toBe('bases generales.pdf')
  })

  it('no matchea extensión que aparece en el query string', () => {
    const links = ['https://fontagro.org/view?file=doc.pdf']
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 5 })).toEqual([])
  })
})
