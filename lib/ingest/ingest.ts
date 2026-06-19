import type { Reader, IngestResult } from './types'
import { assembleCorpus, type CorpusInput } from './corpus'
import { selectDocumentLinks, docNameFromUrl } from './document-links'
import { INGEST_MAX_DOCS, INGEST_MAX_CHARS_PER_DOC, INGEST_TOTAL_BUDGET } from './config'

export interface IngestDeps {
  reader?: Reader
  extractPdf?: (bytes: Uint8Array) => Promise<string>
  onProgress?: (step: string) => void
}

export interface IngestCaps {
  maxDocs?: number
  maxCharsPerDoc?: number
  totalBudget?: number
}

function resolveCaps(caps: IngestCaps) {
  return {
    maxDocs: caps.maxDocs ?? INGEST_MAX_DOCS,
    maxCharsPerDoc: caps.maxCharsPerDoc ?? INGEST_MAX_CHARS_PER_DOC,
    totalBudget: caps.totalBudget ?? INGEST_TOTAL_BUDGET,
  }
}

export async function ingestFromText(text: string): Promise<IngestResult> {
  const { maxCharsPerDoc, totalBudget } = resolveCaps({})
  const { text: corpus, sources, truncated } = assembleCorpus(
    [{ type: 'page', name: 'Texto pegado', url: null, body: text }],
    { maxCharsPerDoc: Math.max(maxCharsPerDoc, totalBudget), totalBudget },
  )
  return { text: corpus, sources, truncated, notes: [] }
}

export async function ingestFromUrl(
  url: string,
  deps: IngestDeps,
  caps: IngestCaps = {},
): Promise<IngestResult> {
  if (!deps.reader) throw new Error('Falta el lector web (Reader) para ingerir una URL.')
  const { maxDocs, maxCharsPerDoc, totalBudget } = resolveCaps(caps)
  const notes: string[] = []

  deps.onProgress?.('Leyendo la página…')
  const page = await deps.reader.scrapePage(url)

  const docUrls = selectDocumentLinks(page.links, { pageUrl: url, maxDocs })
  const inputs: CorpusInput[] = [
    { type: 'page', name: page.title ?? url, url, body: page.markdown },
  ]

  let i = 0
  for (const docUrl of docUrls) {
    i += 1
    const name = docNameFromUrl(docUrl)
    deps.onProgress?.(`Descargando documento ${i}/${docUrls.length}…`)
    try {
      const doc = await deps.reader.scrapeDoc(docUrl)
      if (doc.text.trim().length === 0) {
        notes.push(`No pude extraer texto de ${name} (puede ser un PDF escaneado).`)
        continue
      }
      inputs.push({ type: 'pdf', name, url: docUrl, body: doc.text })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error desconocido'
      notes.push(`No pude leer ${name}: ${msg}.`)
    }
  }

  const { text, sources, truncated } = assembleCorpus(inputs, { maxCharsPerDoc, totalBudget })
  return { text, sources, truncated, notes }
}

export async function ingestFromPdf(
  bytes: Uint8Array,
  name: string,
  deps: IngestDeps,
  caps: IngestCaps = {},
): Promise<IngestResult> {
  if (!deps.extractPdf) throw new Error('Falta el extractor de PDF.')
  const { maxCharsPerDoc, totalBudget } = resolveCaps(caps)

  deps.onProgress?.('Extrayendo texto del PDF…')
  const body = await deps.extractPdf(bytes)
  const notes: string[] = []
  if (body.trim().length === 0) {
    notes.push('PDF escaneado: no pude extraer texto. Pega el contenido o ingresa la URL de la convocatoria.')
  }

  const { text, sources, truncated } = assembleCorpus(
    [{ type: 'upload', name, url: null, body }],
    { maxCharsPerDoc: Math.max(maxCharsPerDoc, totalBudget), totalBudget },
  )
  return { text, sources, truncated, notes }
}
