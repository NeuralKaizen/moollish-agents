// lib/ingest/image.test.ts
import { describe, it, expect } from 'vitest'
import { ingestFromImage } from './image'
import type { Reader } from './types'
import type { VisionExtract } from '@/lib/agent/vision'

const bytes = new Uint8Array([1, 2, 3])
const visionWith = (e: VisionExtract) => async () => e
const readerOk: Reader = {
  async scrapePage() { return { markdown: 'CONTENIDO DE LA PÁGINA', links: [], title: 'Convocatoria X' } },
  async scrapeDoc() { return { text: '' } },
}
const readerFail: Reader = {
  async scrapePage() { throw new Error('403') },
  async scrapeDoc() { return { text: '' } },
}

describe('ingestFromImage', () => {
  it('con URL detectada combina texto de imagen + página', async () => {
    const { result, extract } = await ingestFromImage(bytes, 'image/png', 'cap.png', {
      visionExtract: visionWith({ text: 'TEXTO IMAGEN', detected_url: 'https://x.org/conv', source_guess: 'Instagram @x' }),
      reader: readerOk,
    })
    expect(result.text).toContain('TEXTO IMAGEN')
    expect(result.text).toContain('CONTENIDO DE LA PÁGINA')
    expect(result.sources.some((s) => s.type === 'page')).toBe(true)
    expect(extract.source_guess).toBe('Instagram @x')
  })

  it('sin URL detectada usa solo la imagen y deja nota', async () => {
    const { result } = await ingestFromImage(bytes, 'image/png', 'cap.png', {
      visionExtract: visionWith({ text: 'TEXTO IMAGEN', detected_url: null, source_guess: null }),
      reader: readerOk,
    })
    expect(result.text).toContain('TEXTO IMAGEN')
    expect(result.sources.some((s) => s.type === 'page')).toBe(false)
    expect(result.notes.join(' ')).toMatch(/no detecté un enlace/i)
  })

  it('si el scrape del enlace falla, degrada a solo-imagen con nota', async () => {
    const { result } = await ingestFromImage(bytes, 'image/png', 'cap.png', {
      visionExtract: visionWith({ text: 'TEXTO IMAGEN', detected_url: 'https://x.org/conv', source_guess: null }),
      reader: readerFail,
    })
    expect(result.text).toContain('TEXTO IMAGEN')
    expect(result.notes.join(' ')).toMatch(/no pude abrirlo/i)
  })

  it('imagen sin texto legible deja nota y corpus vacío', async () => {
    const { result } = await ingestFromImage(bytes, 'image/png', 'cap.png', {
      visionExtract: visionWith({ text: '   ', detected_url: null, source_guess: null }),
    })
    expect(result.text).toBe('')
    expect(result.notes.join(' ')).toMatch(/no pude leer texto/i)
  })
})
