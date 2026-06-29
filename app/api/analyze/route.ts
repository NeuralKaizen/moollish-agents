import { analyzeOpportunity } from '@/lib/agent/analyze'
import { generateWithOpenRouter } from '@/lib/agent/llm'
import { listFunders, rowToProfile } from '@/lib/db/funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { createFirecrawlReader } from '@/lib/ingest/firecrawl'
import { extractPdfText } from '@/lib/ingest/pdf'
import { ingestFromUrl, ingestFromText, ingestFromPdf } from '@/lib/ingest/ingest'
import { ingestFromImage } from '@/lib/ingest/image'
import { generateVisionExtract } from '@/lib/agent/vision'
import { MAX_UPLOAD_BYTES } from '@/lib/ingest/config'
import type { IngestResult, ProgressEvent } from '@/lib/ingest/types'

export const runtime = 'nodejs'
export const maxDuration = 120

type CaptureMeta = { ocr_text: string; source_guess: string | null }

async function runIngest(
  req: Request, onProgress: (step: string) => void,
): Promise<{ ingest: IngestResult; capture: CaptureMeta | null }> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('Falta el archivo.')
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('El archivo supera 4.5 MB. Subí uno más liviano o pegá la URL/el texto.')
    }
    const bytes = new Uint8Array(await file.arrayBuffer())

    if (file.type.startsWith('image/')) {
      const reader = process.env.FIRECRAWL_API_KEY ? createFirecrawlReader() : undefined
      const { result, extract } = await ingestFromImage(
        bytes, file.type, file.name || 'captura.png',
        { visionExtract: (b, m) => generateVisionExtract(b, m), reader, onProgress },
      )
      return { ingest: result, capture: { ocr_text: extract.text, source_guess: extract.source_guess } }
    }

    const ingest = await ingestFromPdf(bytes, file.name || 'documento.pdf', { extractPdf: extractPdfText, onProgress })
    return { ingest, capture: null }
  }

  const body = (await req.json().catch(() => null)) as { url?: unknown; text?: unknown } | null
  if (body && typeof body.url === 'string' && body.url.trim().length > 0) {
    return { ingest: await ingestFromUrl(body.url.trim(), { reader: createFirecrawlReader(), onProgress }), capture: null }
  }
  if (body && typeof body.text === 'string' && body.text.trim().length > 0) {
    return { ingest: await ingestFromText(body.text), capture: null }
  }
  throw new Error('Ingresa una URL, un texto, un PDF o una captura de la convocatoria.')
}

export async function POST(req: Request) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: ProgressEvent) => controller.enqueue(encoder.encode(JSON.stringify(evt) + '\n'))
      try {
        const { ingest, capture } = await runIngest(req, (step) => send({ type: 'progress', step }))
        send({ type: 'progress', step: 'Analizando…' })
        let funderBlock = formatFunderBlock(null)
        try {
          const rows = await listFunders()
          funderBlock = formatFunderBlock(matchFunder(ingest.text, rows.map(rowToProfile)))
        } catch {
          // Si la tabla de financiadores no está disponible, seguimos con el bloque genérico.
        }
        const analysis = await analyzeOpportunity(ingest.text, { generate: generateWithOpenRouter }, { funderBlock })
        send({
          type: 'result',
          analysis,
          ingestion: { sources: ingest.sources, truncated: ingest.truncated, notes: ingest.notes },
          ...(capture ? { capture } : {}),
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
