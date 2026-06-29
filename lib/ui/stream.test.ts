import { describe, it, expect } from 'vitest'
import { readAnalyzeStream } from './stream'
import type { ProgressEvent } from '@/lib/ingest/types'

function streamOf(events: ProgressEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'))
      controller.close()
    },
  })
}

const fakeAnalysis = { source: { name: 'X' } } as unknown as Parameters<typeof Object>[0]

describe('readAnalyzeStream', () => {
  it('acumula progreso y resuelve con el result', async () => {
    const steps: string[] = []
    const ingestion = { sources: [], truncated: false, notes: [] }
    const result = await readAnalyzeStream(
      streamOf([
        { type: 'progress', step: 'Leyendo…' },
        { type: 'progress', step: 'Analizando…' },
        { type: 'result', analysis: fakeAnalysis as never, ingestion },
      ]),
      (s) => steps.push(s),
    )
    expect(steps).toEqual(['Leyendo…', 'Analizando…'])
    expect(result.ingestion).toEqual(ingestion)
  })

  it('lanza el error del stream', async () => {
    await expect(
      readAnalyzeStream(streamOf([{ type: 'error', error: 'sitio bloqueado' }])),
    ).rejects.toThrow(/sitio bloqueado/)
  })

  it('lanza si nunca llega un result', async () => {
    await expect(
      readAnalyzeStream(streamOf([{ type: 'progress', step: 'Leyendo…' }])),
    ).rejects.toThrow(/no incluyó un análisis/i)
  })
})

function streamOfLines(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({ start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close() } })
}

describe('readAnalyzeStream (capture)', () => {
  it('propaga el campo capture del evento result', async () => {
    const analysis = { opportunity_id: 'x', source: { name: 'X' } }
    const result = await readAnalyzeStream(streamOfLines([
      JSON.stringify({ type: 'result', analysis, ingestion: { sources: [], truncated: false, notes: [] }, capture: { ocr_text: 'ocr', source_guess: 'IG @x' } }),
    ]))
    expect(result.capture?.ocr_text).toBe('ocr')
    expect(result.capture?.source_guess).toBe('IG @x')
  })
})
