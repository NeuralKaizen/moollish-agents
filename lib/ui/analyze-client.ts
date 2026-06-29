import type { AnalyzeInput } from './input-kind'
import { readAnalyzeStream, type AnalyzeResult } from './stream'

function buildRequest(input: AnalyzeInput): RequestInit {
  if (input.kind === 'pdf' || input.kind === 'image') {
    const form = new FormData()
    form.append('file', input.file)
    return { method: 'POST', body: form }
  }
  const body = input.kind === 'url' ? { url: input.url } : { text: input.text }
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export async function analyzeClient(
  input: AnalyzeInput,
  onProgress?: (step: string) => void,
): Promise<AnalyzeResult> {
  if (process.env.NEXT_PUBLIC_USE_FIXTURE === '1') {
    const { SAMPLE_ANALYSIS } = await import('./sample-analysis')
    onProgress?.('Analizando…')
    await new Promise((resolve) => setTimeout(resolve, 600))
    return {
      analysis: SAMPLE_ANALYSIS,
      ingestion: {
        sources: [{ type: 'page', name: SAMPLE_ANALYSIS.source.name, url: SAMPLE_ANALYSIS.source.url, chars: 0 }],
        truncated: false,
        notes: [],
      },
    }
  }

  const res = await fetch('/api/analyze', buildRequest(input))
  if (!res.ok || !res.body) {
    throw new Error(`Error ${res.status} al analizar la convocatoria.`)
  }
  return readAnalyzeStream(res.body, onProgress)
}
