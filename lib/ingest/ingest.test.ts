import { describe, it, expect } from 'vitest'
import { ingestFromUrl, ingestFromText, ingestFromPdf } from './ingest'
import type { Reader } from './types'

const reader = (over: Partial<Reader> = {}): Reader => ({
  scrapePage: async () => ({ markdown: 'CUERPO PAGINA', links: ['https://x.org/bases.pdf'], title: 'Convocatoria X' }),
  scrapeDoc: async (url) => ({ text: `TEXTO DE ${url}` }),
  ...over,
})

describe('ingestFromUrl', () => {
  it('lee la página, baja los documentos y ensambla fuentes', async () => {
    const r = await ingestFromUrl('https://x.org/conv', { reader: reader() })
    expect(r.sources.map((s) => s.type)).toEqual(['page', 'pdf'])
    expect(r.text).toContain('CUERPO PAGINA')
    expect(r.text).toContain('TEXTO DE https://x.org/bases.pdf')
    expect(r.notes).toEqual([])
  })

  it('registra nota honesta si un documento viene vacío (escaneado)', async () => {
    const r = await ingestFromUrl('https://x.org/conv', {
      reader: reader({ scrapeDoc: async () => ({ text: '   ' }) }),
    })
    expect(r.sources.map((s) => s.type)).toEqual(['page'])
    expect(r.notes[0]).toMatch(/no pude extraer texto/i)
  })

  it('registra nota si scrapeDoc lanza, sin abortar el resto', async () => {
    const r = await ingestFromUrl('https://x.org/conv', {
      reader: reader({ scrapeDoc: async () => { throw new Error('403') } }),
    })
    expect(r.sources.map((s) => s.type)).toEqual(['page'])
    expect(r.notes[0]).toMatch(/403/)
  })

  it('lanza si falta el reader', async () => {
    await expect(ingestFromUrl('https://x.org', {})).rejects.toThrow(/lector/i)
  })

  it('emite progreso', async () => {
    const steps: string[] = []
    await ingestFromUrl('https://x.org/conv', { reader: reader(), onProgress: (s) => steps.push(s) })
    expect(steps[0]).toMatch(/Leyendo/i)
    expect(steps.some((s) => /documento/i.test(s))).toBe(true)
  })
})

describe('ingestFromText', () => {
  it('pasa el texto como única fuente de página', async () => {
    const r = await ingestFromText('convocatoria pegada')
    expect(r.sources).toEqual([{ type: 'page', name: 'Texto pegado', url: null, chars: 'convocatoria pegada'.length }])
    expect(r.text).toContain('convocatoria pegada')
  })
})

describe('ingestFromPdf', () => {
  it('extrae con el extractor inyectado', async () => {
    const r = await ingestFromPdf(new Uint8Array([1]), 'tdr.pdf', { extractPdf: async () => 'TEXTO PDF' })
    expect(r.sources).toEqual([{ type: 'upload', name: 'tdr.pdf', url: null, chars: 'TEXTO PDF'.length }])
    expect(r.text).toContain('TEXTO PDF')
  })

  it('nota honesta si el PDF no tiene texto', async () => {
    const r = await ingestFromPdf(new Uint8Array([1]), 'scan.pdf', { extractPdf: async () => '' })
    expect(r.notes[0]).toMatch(/escaneado/i)
  })

  it('lanza si falta el extractor de PDF', async () => {
    await expect(ingestFromPdf(new Uint8Array([1]), 'x.pdf', {})).rejects.toThrow(/extractor/i)
  })
})
