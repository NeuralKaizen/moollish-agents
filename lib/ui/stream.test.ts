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
