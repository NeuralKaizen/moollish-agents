import { analyzeOpportunity } from '@/lib/agent/analyze'
import { generateWithOpenRouter } from '@/lib/agent/llm'
import { createFirecrawlReader } from '@/lib/ingest/firecrawl'
import { extractPdfText } from '@/lib/ingest/pdf'
import { ingestFromUrl, ingestFromText, ingestFromPdf } from '@/lib/ingest/ingest'
import { MAX_UPLOAD_BYTES } from '@/lib/ingest/config'
import type { IngestResult, ProgressEvent } from '@/lib/ingest/types'

export const runtime = 'nodejs'
export const maxDuration = 120

async function runIngest(req: Request, onProgress: (step: string) => void): Promise<IngestResult> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('Falta el archivo PDF.')
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('El PDF supera 4.5 MB. Ingresa la URL de la convocatoria o sube un archivo más liviano.')
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    return ingestFromPdf(bytes, file.name || 'documento.pdf', { extractPdf: extractPdfText, onProgress })
  }

  const body = (await req.json().catch(() => null)) as { url?: unknown; text?: unknown } | null
  if (body && typeof body.url === 'string' && body.url.trim().length > 0) {
    return ingestFromUrl(body.url.trim(), { reader: createFirecrawlReader(), onProgress })
  }
  if (body && typeof body.text === 'string' && body.text.trim().length > 0) {
    return ingestFromText(body.text)
  }
  throw new Error('Ingresa una URL, un texto o un PDF de la convocatoria.')
}

export async function POST(req: Request) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: ProgressEvent) => controller.enqueue(encoder.encode(JSON.stringify(evt) + '\n'))
      try {
        const ingest = await runIngest(req, (step) => send({ type: 'progress', step }))
        send({ type: 'progress', step: 'Analizando…' })
        const analysis = await analyzeOpportunity(ingest.text, { generate: generateWithOpenRouter })
        send({
          type: 'result',
          analysis,
          ingestion: { sources: ingest.sources, truncated: ingest.truncated, notes: ingest.notes },
        })
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Error desconocido al analizar.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  })
}
