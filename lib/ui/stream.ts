import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { IngestionSummary, ProgressEvent } from '@/lib/ingest/types'

export interface AnalyzeResult {
  analysis: OpportunityAnalysis
  ingestion: IngestionSummary
}

export async function readAnalyzeStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (step: string) => void,
): Promise<AnalyzeResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: AnalyzeResult | null = null

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line.length === 0) continue
      const evt = JSON.parse(line) as ProgressEvent
      if (evt.type === 'progress') onProgress?.(evt.step)
      else if (evt.type === 'error') throw new Error(evt.error)
      else if (evt.type === 'result') result = { analysis: evt.analysis, ingestion: evt.ingestion }
    }
  }

  if (!result) throw new Error('La respuesta no incluyó un análisis.')
  return result
}
