import type { Reader, IngestResult } from './types'
import { assembleCorpus, type CorpusInput } from './corpus'
import { resolveCaps, type IngestCaps } from './ingest'
import type { VisionExtract, VisionExtractor } from '@/lib/agent/vision'

export interface ImageIngestDeps {
  visionExtract: VisionExtractor
  reader?: Reader
  onProgress?: (step: string) => void
}

export async function ingestFromImage(
  bytes: Uint8Array, mime: string, name: string, deps: ImageIngestDeps, caps: IngestCaps = {},
): Promise<{ result: IngestResult; extract: VisionExtract }> {
  const { maxCharsPerDoc, totalBudget } = resolveCaps(caps)
  const notes: string[] = []
  const inputs: CorpusInput[] = []

  deps.onProgress?.('Leyendo la captura…')
  const extract = await deps.visionExtract(bytes, mime)

  if (extract.text.trim().length > 0) {
    inputs.push({ type: 'upload', name, url: null, body: extract.text })
  }

  if (extract.detected_url && deps.reader) {
    deps.onProgress?.('Siguiendo el enlace detectado…')
    try {
      const page = await deps.reader.scrapePage(extract.detected_url)
      if (page.markdown.trim().length > 0) {
        inputs.push({ type: 'page', name: page.title ?? extract.detected_url, url: extract.detected_url, body: page.markdown })
      } else {
        notes.push(`Abrí el enlace (${extract.detected_url}) pero no traía texto útil.`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error desconocido'
      notes.push(`Detecté un enlace (${extract.detected_url}) pero no pude abrirlo: ${msg}.`)
    }
  } else if (extract.detected_url && !deps.reader) {
    notes.push(`Detecté un enlace (${extract.detected_url}) pero no hay lector web disponible.`)
  } else if (!extract.detected_url) {
    notes.push('No detecté un enlace en la captura; análisis preliminar desde la imagen.')
  }

  if (inputs.length === 0) {
    notes.push('No pude leer texto en la captura. Probá una imagen más nítida o pegá el texto.')
  }

  const { text, sources, truncated } = assembleCorpus(inputs, { maxCharsPerDoc, totalBudget })
  return { result: { text, sources, truncated, notes }, extract }
}
