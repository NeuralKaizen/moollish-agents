# Agente 1 — Capa de Ingestión (URL · PDF · texto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Alex pegue una URL, suba un PDF o pegue texto y el agente lea la página, descargue los documentos enlazados (pliego, términos, cronograma), extraiga su contenido y lo analice — resolviendo el gap de la demo (fechas que sí existían pero el agente no leyó).

**Architecture:** Una capa nueva `lib/ingest/` se monta delante del núcleo `lib/agent/` (que no cambia). Funciones puras y testeables (selección de documentos, ensamblado de corpus) + adaptadores externos finos detrás de una interfaz `Reader` (Firecrawl vía REST) y un extractor de PDF (`unpdf`). El endpoint `/api/analyze` orquesta `ingest → analyze` y emite progreso por stream NDJSON.

**Tech Stack:** TypeScript, Next.js 16 App Router (runtime nodejs), Vercel AI SDK + OpenRouter (núcleo existente), Firecrawl REST API v2 (lectura web + PDF remoto), `unpdf` (PDF subido), Zod, vitest.

## Global Constraints

- **LLM siempre vía OpenRouter** (`lib/agent/llm.ts`), nunca Anthropic directo.
- **Español neutro, sin voseo, en TODO el copy visible al usuario** — incluye textos de progreso y `notes`. (Ej.: "Lee", "Pega", "Sube", no "Leé", "Pegá", "Subí".)
- **Núcleo `lib/agent/` no se modifica.** La ingestión sólo produce texto que `analyzeOpportunity` consume.
- **Endpoint:** `export const runtime = 'nodejs'`, `export const maxDuration = 120`.
- **Subida de PDF ≤ 4.5 MB** (límite de body de Vercel Function). PDFs más grandes → mensaje claro, no se procesan en esta fase.
- **No inventar / degradación honesta:** si una fuente no se puede leer (sitio bloqueado, PDF escaneado), se registra en `notes` y se sigue; nunca se fabrica contenido.
- **Tests:** vitest, archivos `lib/**/*.test.ts`. Correr uno: `pnpm exec vitest run <ruta>`. Todos: `pnpm test`.
- **Endpoint REST de Firecrawl:** `POST https://api.firecrawl.dev/v2/scrape`, header `Authorization: Bearer <key>`, body `{ url, formats, timeout }`, respuesta `{ success, data: { markdown, links, metadata: { title } } }`. Usamos `fetch` directo (sin SDK) para evitar drift de versión.
- DRY, YAGNI, TDD, commits frecuentes.

---

### Task 1: Tipos, config y selección de documentos enlazados

**Files:**
- Create: `lib/ingest/types.ts`
- Create: `lib/ingest/config.ts`
- Create: `lib/ingest/document-links.ts`
- Test: `lib/ingest/document-links.test.ts`

**Interfaces:**
- Consumes: `OpportunityAnalysis` de `@/lib/agent/schema`.
- Produces:
  - `types.ts`: `IngestSource`, `IngestResult`, `IngestionSummary`, `PageContent`, `Reader`, `ProgressEvent`.
  - `config.ts`: `INGEST_MAX_DOCS`, `INGEST_MAX_CHARS_PER_DOC`, `INGEST_TOTAL_BUDGET`, `FIRECRAWL_TIMEOUT_MS`, `MAX_UPLOAD_BYTES` (números).
  - `document-links.ts`: `selectDocumentLinks(links: string[], opts: { pageUrl: string; maxDocs: number }): string[]` y `docNameFromUrl(url: string): string`.

- [ ] **Step 1: Write the failing test**

Create `lib/ingest/document-links.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectDocumentLinks, docNameFromUrl } from './document-links'

const PAGE = 'https://fontagro.org/convocatoria-2026'

describe('selectDocumentLinks', () => {
  it('elige PDFs y docs por extensión, resolviendo relativos a absolutos', () => {
    const links = ['/files/bases.pdf', 'https://fontagro.org/anexo.docx', 'https://fontagro.org/']
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 5 })).toEqual([
      'https://fontagro.org/files/bases.pdf',
      'https://fontagro.org/anexo.docx',
    ])
  })

  it('elige por palabra clave aunque no tenga extensión de doc', () => {
    const links = ['https://fontagro.org/cronograma', 'https://fontagro.org/inicio']
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 5 })).toEqual([
      'https://fontagro.org/cronograma',
    ])
  })

  it('prioriza el mismo dominio y respeta el cap', () => {
    const links = [
      'https://otrositio.com/a.pdf',
      'https://fontagro.org/b.pdf',
      'https://fontagro.org/c.pdf',
    ]
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 2 })).toEqual([
      'https://fontagro.org/b.pdf',
      'https://fontagro.org/c.pdf',
    ])
  })

  it('deduplica y descarta links inválidos', () => {
    const links = ['/x.pdf', '/x.pdf', 'no es url']
    expect(selectDocumentLinks(links, { pageUrl: PAGE, maxDocs: 5 })).toEqual([
      'https://fontagro.org/x.pdf',
    ])
  })

  it('docNameFromUrl saca el nombre de archivo legible', () => {
    expect(docNameFromUrl('https://fontagro.org/files/bases%20generales.pdf')).toBe('bases generales.pdf')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/ingest/document-links.test.ts`
Expected: FAIL — "Cannot find module './document-links'".

- [ ] **Step 3: Create the types**

Create `lib/ingest/types.ts`:

```ts
import type { OpportunityAnalysis } from '@/lib/agent/schema'

export interface IngestSource {
  type: 'page' | 'pdf' | 'upload'
  name: string
  url: string | null
  chars: number
}

export interface IngestResult {
  text: string
  sources: IngestSource[]
  truncated: boolean
  notes: string[]
}

export type IngestionSummary = Omit<IngestResult, 'text'>

export interface PageContent {
  markdown: string
  links: string[]
  title: string | null
}

export interface Reader {
  scrapePage(url: string): Promise<PageContent>
  scrapeDoc(url: string): Promise<{ text: string }>
}

export type ProgressEvent =
  | { type: 'progress'; step: string }
  | { type: 'result'; analysis: OpportunityAnalysis; ingestion: IngestionSummary }
  | { type: 'error'; error: string }
```

- [ ] **Step 4: Create the config**

Create `lib/ingest/config.ts`:

```ts
// Caps de ingestión, ajustables por env sin tocar código. Defaults conservadores.
export const INGEST_MAX_DOCS = Number(process.env.INGEST_MAX_DOCS ?? 5)
export const INGEST_MAX_CHARS_PER_DOC = Number(process.env.INGEST_MAX_CHARS_PER_DOC ?? 40_000)
export const INGEST_TOTAL_BUDGET = Number(process.env.INGEST_TOTAL_BUDGET ?? 120_000)
export const FIRECRAWL_TIMEOUT_MS = Number(process.env.FIRECRAWL_TIMEOUT_MS ?? 30_000)

// Límite de body de una Vercel Function: 4.5 MB.
export const MAX_UPLOAD_BYTES = 4_500_000
```

- [ ] **Step 5: Implement document-links**

Create `lib/ingest/document-links.ts`:

```ts
const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?|#|$)/i
const DOC_KEYWORDS = /(pliego|t[eé]rminos|terminos|anexo|cronograma|convocatoria|bases|tdr)/i

export function selectDocumentLinks(
  links: string[],
  opts: { pageUrl: string; maxDocs: number },
): string[] {
  const { pageUrl, maxDocs } = opts
  let host: string | null = null
  try { host = new URL(pageUrl).host } catch { host = null }

  const seen = new Set<string>()
  const scored: { url: string; sameHost: boolean }[] = []

  for (const raw of links) {
    let abs: string
    try { abs = new URL(raw, pageUrl).toString() } catch { continue }
    if (seen.has(abs)) continue
    if (!DOC_EXT.test(abs) && !DOC_KEYWORDS.test(abs)) continue
    seen.add(abs)
    let sameHost = false
    try { sameHost = host != null && new URL(abs).host === host } catch { sameHost = false }
    scored.push({ url: abs, sameHost })
  }

  // Mismo dominio primero; Array.sort es estable, así se preserva el orden original dentro de cada grupo.
  scored.sort((a, b) => Number(b.sameHost) - Number(a.sameHost))
  return scored.slice(0, maxDocs).map((s) => s.url)
}

export function docNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : url
  } catch {
    return url
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run lib/ingest/document-links.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/ingest/types.ts lib/ingest/config.ts lib/ingest/document-links.ts lib/ingest/document-links.test.ts
git commit -m "feat(ingest): tipos, config y selección de documentos enlazados"
```

---

### Task 2: Ensamblado del corpus con presupuesto de caracteres

**Files:**
- Create: `lib/ingest/corpus.ts`
- Test: `lib/ingest/corpus.test.ts`

**Interfaces:**
- Consumes: `IngestSource` de `./types`.
- Produces: `assembleCorpus(inputs: CorpusInput[], opts: { maxCharsPerDoc: number; totalBudget: number }): { text: string; sources: IngestSource[]; truncated: boolean }` y el tipo `CorpusInput = { type: IngestSource['type']; name: string; url: string | null; body: string }`.

- [ ] **Step 1: Write the failing test**

Create `lib/ingest/corpus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assembleCorpus } from './corpus'

describe('assembleCorpus', () => {
  it('arma encabezados por fuente y cuenta chars incluidos', () => {
    const r = assembleCorpus(
      [
        { type: 'page', name: 'Convocatoria X', url: 'https://x.org', body: 'cuerpo pagina' },
        { type: 'pdf', name: 'bases.pdf', url: 'https://x.org/bases.pdf', body: 'cuerpo pdf' },
      ],
      { maxCharsPerDoc: 1000, totalBudget: 1000 },
    )
    expect(r.truncated).toBe(false)
    expect(r.text).toContain('### Página: Convocatoria X (https://x.org)')
    expect(r.text).toContain('cuerpo pagina')
    expect(r.text).toContain('### Documento: bases.pdf (https://x.org/bases.pdf)')
    expect(r.sources).toEqual([
      { type: 'page', name: 'Convocatoria X', url: 'https://x.org', chars: 'cuerpo pagina'.length },
      { type: 'pdf', name: 'bases.pdf', url: 'https://x.org/bases.pdf', chars: 'cuerpo pdf'.length },
    ])
  })

  it('recorta por maxCharsPerDoc y marca truncated', () => {
    const r = assembleCorpus(
      [{ type: 'pdf', name: 'g.pdf', url: null, body: 'abcdefghij' }],
      { maxCharsPerDoc: 4, totalBudget: 1000 },
    )
    expect(r.truncated).toBe(true)
    expect(r.sources[0].chars).toBe(4)
    expect(r.text).toContain('abcd')
    expect(r.text).not.toContain('abcde')
  })

  it('respeta el presupuesto total y marca truncated', () => {
    const r = assembleCorpus(
      [
        { type: 'page', name: 'p', url: null, body: 'aaaa' },
        { type: 'pdf', name: 'd', url: null, body: 'bbbb' },
      ],
      { maxCharsPerDoc: 1000, totalBudget: 6 },
    )
    expect(r.truncated).toBe(true)
    expect(r.sources[0].chars).toBe(4)
    expect(r.sources[1].chars).toBe(2)
  })

  it('omite el encabezado de URL cuando es null', () => {
    const r = assembleCorpus(
      [{ type: 'upload', name: 'subido.pdf', url: null, body: 'x' }],
      { maxCharsPerDoc: 1000, totalBudget: 1000 },
    )
    expect(r.text).toContain('### Documento: subido.pdf\n')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/ingest/corpus.test.ts`
Expected: FAIL — "Cannot find module './corpus'".

- [ ] **Step 3: Implement corpus**

Create `lib/ingest/corpus.ts`:

```ts
import type { IngestSource } from './types'

export interface CorpusInput {
  type: IngestSource['type']
  name: string
  url: string | null
  body: string
}

function heading(input: CorpusInput): string {
  const label = input.type === 'page' ? 'Página' : 'Documento'
  const suffix = input.url ? ` (${input.url})` : ''
  return `${label}: ${input.name}${suffix}`
}

export function assembleCorpus(
  inputs: CorpusInput[],
  opts: { maxCharsPerDoc: number; totalBudget: number },
): { text: string; sources: IngestSource[]; truncated: boolean } {
  const { maxCharsPerDoc, totalBudget } = opts
  let truncated = false
  let used = 0
  const blocks: string[] = []
  const sources: IngestSource[] = []

  for (const input of inputs) {
    let body = input.body
    if (body.length > maxCharsPerDoc) { body = body.slice(0, maxCharsPerDoc); truncated = true }
    const remaining = totalBudget - used
    if (body.length > remaining) { body = body.slice(0, Math.max(0, remaining)); truncated = true }

    blocks.push(`### ${heading(input)}\n${body}`)
    sources.push({ type: input.type, name: input.name, url: input.url, chars: body.length })
    used += body.length
  }

  return { text: blocks.join('\n\n'), sources, truncated }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/ingest/corpus.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/corpus.ts lib/ingest/corpus.test.ts
git commit -m "feat(ingest): ensamblado de corpus con presupuesto de caracteres"
```

---

### Task 3: Orquestador de ingestión (URL · texto · PDF)

**Files:**
- Create: `lib/ingest/ingest.ts`
- Test: `lib/ingest/ingest.test.ts`

**Interfaces:**
- Consumes: `Reader`, `IngestResult` de `./types`; `assembleCorpus`/`CorpusInput` de `./corpus`; `selectDocumentLinks`/`docNameFromUrl` de `./document-links`; caps de `./config`.
- Produces:
  - `IngestDeps = { reader?: Reader; extractPdf?: (bytes: Uint8Array) => Promise<string>; onProgress?: (step: string) => void }`
  - `IngestCaps = { maxDocs?: number; maxCharsPerDoc?: number; totalBudget?: number }`
  - `ingestFromText(text: string): Promise<IngestResult>`
  - `ingestFromUrl(url: string, deps: IngestDeps, caps?: IngestCaps): Promise<IngestResult>`
  - `ingestFromPdf(bytes: Uint8Array, name: string, deps: IngestDeps, caps?: IngestCaps): Promise<IngestResult>`

- [ ] **Step 1: Write the failing test**

Create `lib/ingest/ingest.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/ingest/ingest.test.ts`
Expected: FAIL — "Cannot find module './ingest'".

- [ ] **Step 3: Implement the orchestrator**

Create `lib/ingest/ingest.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/ingest/ingest.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/ingest.ts lib/ingest/ingest.test.ts
git commit -m "feat(ingest): orquestador URL/texto/PDF con degradación honesta"
```

---

### Task 4: Lector Firecrawl (REST v2, con fetch inyectable)

**Files:**
- Create: `lib/ingest/firecrawl.ts`
- Test: `lib/ingest/firecrawl.test.ts`

**Interfaces:**
- Consumes: `Reader`, `PageContent` de `./types`; `FIRECRAWL_TIMEOUT_MS` de `./config`.
- Produces: `createFirecrawlReader(opts?: { apiKey?: string; fetchImpl?: typeof fetch }): Reader`.

- [ ] **Step 1: Write the failing test**

Create `lib/ingest/firecrawl.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createFirecrawlReader } from './firecrawl'

function okFetch(data: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  })) as unknown as typeof fetch
}

describe('createFirecrawlReader', () => {
  it('scrapePage mapea markdown, links y title', async () => {
    const fetchImpl = okFetch({ markdown: '# Hola', links: ['https://x.org/a.pdf'], metadata: { title: 'Conv' } })
    const reader = createFirecrawlReader({ apiKey: 'k', fetchImpl })
    const page = await reader.scrapePage('https://x.org')
    expect(page).toEqual({ markdown: '# Hola', links: ['https://x.org/a.pdf'], title: 'Conv' })
  })

  it('llama al endpoint v2 con Bearer y formats markdown+links', async () => {
    const fetchImpl = okFetch({ markdown: 'x', links: [], metadata: { title: null } })
    const reader = createFirecrawlReader({ apiKey: 'secret', fetchImpl })
    await reader.scrapePage('https://x.org')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.firecrawl.dev/v2/scrape')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.formats).toEqual(['markdown', 'links'])
    expect(body.url).toBe('https://x.org')
  })

  it('scrapeDoc devuelve el markdown como texto', async () => {
    const fetchImpl = okFetch({ markdown: 'contenido pdf', links: [], metadata: {} })
    const reader = createFirecrawlReader({ apiKey: 'k', fetchImpl })
    expect(await reader.scrapeDoc('https://x.org/a.pdf')).toEqual({ text: 'contenido pdf' })
  })

  it('lanza si la respuesta no es ok', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    const reader = createFirecrawlReader({ apiKey: 'k', fetchImpl })
    await expect(reader.scrapePage('https://x.org')).rejects.toThrow(/500/)
  })

  it('lanza claro si falta la API key', () => {
    expect(() => createFirecrawlReader({ apiKey: '', fetchImpl: okFetch({}) })).toThrow(/FIRECRAWL_API_KEY/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/ingest/firecrawl.test.ts`
Expected: FAIL — "Cannot find module './firecrawl'".

- [ ] **Step 3: Implement the Firecrawl reader**

Create `lib/ingest/firecrawl.ts`:

```ts
import type { Reader, PageContent } from './types'
import { FIRECRAWL_TIMEOUT_MS } from './config'

const ENDPOINT = 'https://api.firecrawl.dev/v2/scrape'

interface ScrapeResponse {
  success: boolean
  error?: string
  data?: {
    markdown?: string
    links?: string[]
    metadata?: { title?: string | null }
  }
}

export function createFirecrawlReader(
  opts: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Reader {
  const apiKey = opts.apiKey ?? process.env.FIRECRAWL_API_KEY
  const doFetch = opts.fetchImpl ?? fetch
  if (!apiKey) {
    throw new Error('Falta FIRECRAWL_API_KEY para leer URLs. Pega el texto o sube el PDF.')
  }

  async function scrape(url: string, formats: string[]): Promise<NonNullable<ScrapeResponse['data']>> {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url, formats, timeout: FIRECRAWL_TIMEOUT_MS }),
    })
    if (!res.ok) throw new Error(`Firecrawl respondió ${res.status} al leer ${url}.`)
    const json = (await res.json()) as ScrapeResponse
    if (!json.success || !json.data) throw new Error(json.error ?? `No pude leer ${url}.`)
    return json.data
  }

  return {
    async scrapePage(url): Promise<PageContent> {
      const data = await scrape(url, ['markdown', 'links'])
      return {
        markdown: data.markdown ?? '',
        links: data.links ?? [],
        title: data.metadata?.title ?? null,
      }
    },
    async scrapeDoc(url) {
      const data = await scrape(url, ['markdown'])
      return { text: data.markdown ?? '' }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/ingest/firecrawl.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/firecrawl.ts lib/ingest/firecrawl.test.ts
git commit -m "feat(ingest): lector Firecrawl REST v2 con fetch inyectable"
```

---

### Task 5: Extractor de PDF subido (`unpdf`) + dependencia + env

**Files:**
- Create: `lib/ingest/pdf.ts`
- Modify: `package.json` (agregar dependencia `unpdf`)
- Modify: `.env.example` (agregar `FIRECRAWL_API_KEY` y caps)

**Interfaces:**
- Produces: `extractPdfText(bytes: Uint8Array): Promise<string>`.

- [ ] **Step 1: Install the dependency**

Run: `pnpm add unpdf`
Expected: `unpdf` aparece en `dependencies` de `package.json`.

- [ ] **Step 2: Implement the PDF extractor**

Create `lib/ingest/pdf.ts`:

```ts
import { extractText, getDocumentProxy } from 'unpdf'

// Extrae la capa de texto de un PDF digital. PDFs escaneados (solo imagen)
// devuelven cadena vacía: el orquestador lo reporta como nota honesta (sin OCR en esta fase).
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm typecheck`
Expected: sin errores (`unpdf` exporta `extractText` y `getDocumentProxy`).

- [ ] **Step 4: Update `.env.example`**

Add these lines to `.env.example`:

```bash
# Firecrawl: lectura web con render JS + parseo de PDFs remotos (https://firecrawl.dev)
FIRECRAWL_API_KEY=fc-...
# Caps de ingestión (opcionales, ver lib/ingest/config.ts)
INGEST_MAX_DOCS=5
INGEST_MAX_CHARS_PER_DOC=40000
INGEST_TOTAL_BUDGET=120000
FIRECRAWL_TIMEOUT_MS=30000
```

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/pdf.ts package.json pnpm-lock.yaml .env.example
git commit -m "feat(ingest): extractor de PDF subido con unpdf + env de Firecrawl"
```

---

### Task 6: Runner CLI de validación en vivo (`pnpm ingest <url>`)

**Files:**
- Create: `scripts/ingest.ts`
- Modify: `package.json` (script `ingest`)

**Interfaces:**
- Consumes: `createFirecrawlReader` de `@/lib/ingest/firecrawl`; `ingestFromUrl` de `@/lib/ingest/ingest`.

- [ ] **Step 1: Add the npm script**

In `package.json`, add to `"scripts"` (junto a `"analyze"`):

```json
    "ingest": "tsx scripts/ingest.ts",
```

- [ ] **Step 2: Implement the CLI**

Create `scripts/ingest.ts`:

```ts
import 'dotenv/config'
import { createFirecrawlReader } from '../lib/ingest/firecrawl'
import { ingestFromUrl } from '../lib/ingest/ingest'

const url = process.argv[2]
if (!url) {
  console.error('Uso: pnpm ingest <url>')
  process.exit(1)
}

try {
  const result = await ingestFromUrl(url, {
    reader: createFirecrawlReader(),
    onProgress: (step) => console.error(`· ${step}`),
  })
  console.error(`\nFuentes (${result.sources.length}):`)
  for (const s of result.sources) {
    console.error(`  - [${s.type}] ${s.name} — ${s.chars} chars${s.url ? ` (${s.url})` : ''}`)
  }
  if (result.notes.length) {
    console.error('Notas:')
    for (const n of result.notes) console.error(`  ! ${n}`)
  }
  console.error(`Truncado: ${result.truncated}\n`)
  console.log(result.text)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n✗ No se pudo ingerir la URL: ${message}`)
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('  → Falta FIRECRAWL_API_KEY. Cárgala en .env.local.')
  }
  process.exit(1)
}
```

- [ ] **Step 3: Live smoke test (requiere FIRECRAWL_API_KEY)**

Run: `pnpm ingest https://www.fontagro.org/es/convocatorias/`
Expected: imprime las fuentes leídas (página + algún documento) y el corpus. Si el contrato REST de Firecrawl cambió, este es el primer lugar donde se ve; ajustar `lib/ingest/firecrawl.ts` (única pieza acoplada al proveedor).
Nota: si no hay API key disponible en el entorno, marcar este step como verificación pendiente y continuar — la lógica ya está cubierta por los tests de la Task 4.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest.ts package.json
git commit -m "feat(ingest): runner CLI pnpm ingest <url> para validación en vivo"
```

---

### Task 7: Endpoint `/api/analyze` — orquesta ingest→analyze con stream NDJSON

**Files:**
- Modify: `app/api/analyze/route.ts` (reescritura completa)

**Interfaces:**
- Consumes: `analyzeOpportunity`, `generateWithOpenRouter` (núcleo); `createFirecrawlReader`, `extractPdfText`, `ingestFromUrl`/`ingestFromText`/`ingestFromPdf`, `MAX_UPLOAD_BYTES`, `ProgressEvent`.
- Produces: respuesta `application/x-ndjson` — una línea JSON por `ProgressEvent` (`progress`*, luego `result` o `error`).

- [ ] **Step 1: Rewrite the route**

Replace the contents of `app/api/analyze/route.ts` with:

```ts
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 3: Verify the build compiles the route**

Run: `pnpm build`
Expected: build OK; `/api/analyze` aparece en la salida de rutas sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat(api): /api/analyze orquesta ingest→analyze con stream de progreso NDJSON"
```

---

### Task 8: Cliente — decisión de entrada + lectura del stream

**Files:**
- Create: `lib/ui/input-kind.ts`
- Test: `lib/ui/input-kind.test.ts`
- Create: `lib/ui/stream.ts`
- Test: `lib/ui/stream.test.ts`
- Modify: `lib/ui/analyze-client.ts` (reescritura)

**Interfaces:**
- Produces:
  - `input-kind.ts`: `AnalyzeInput = { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'pdf'; file: File }`; `looksLikeUrl(s: string): boolean`; `decideInput(value: string, file: File | null): AnalyzeInput | null`.
  - `stream.ts`: `readAnalyzeStream(body: ReadableStream<Uint8Array>, onProgress?: (step: string) => void): Promise<AnalyzeResult>`; `AnalyzeResult = { analysis: OpportunityAnalysis; ingestion: IngestionSummary }`.
  - `analyze-client.ts`: `analyzeClient(input: AnalyzeInput, onProgress?: (step: string) => void): Promise<AnalyzeResult>` (firma nueva).

- [ ] **Step 1: Write the failing test for input-kind**

Create `lib/ui/input-kind.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { looksLikeUrl, decideInput } from './input-kind'

describe('looksLikeUrl', () => {
  it('reconoce http/https sin espacios', () => {
    expect(looksLikeUrl('https://fontagro.org/conv')).toBe(true)
    expect(looksLikeUrl('http://x.org')).toBe(true)
  })
  it('rechaza texto y URLs con espacios', () => {
    expect(looksLikeUrl('convocatoria FAO 2026')).toBe(false)
    expect(looksLikeUrl('https://x.org con texto')).toBe(false)
    expect(looksLikeUrl('')).toBe(false)
  })
})

describe('decideInput', () => {
  const fakeFile = { name: 'a.pdf' } as File
  it('un archivo manda sobre el texto', () => {
    expect(decideInput('lo que sea', fakeFile)).toEqual({ kind: 'pdf', file: fakeFile })
  })
  it('una URL pegada se trata como url', () => {
    expect(decideInput('https://x.org/conv', null)).toEqual({ kind: 'url', url: 'https://x.org/conv' })
  })
  it('texto largo se trata como text', () => {
    expect(decideInput('Convocatoria con bases...', null)).toEqual({ kind: 'text', text: 'Convocatoria con bases...' })
  })
  it('vacío sin archivo devuelve null', () => {
    expect(decideInput('   ', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/ui/input-kind.test.ts`
Expected: FAIL — "Cannot find module './input-kind'".

- [ ] **Step 3: Implement input-kind**

Create `lib/ui/input-kind.ts`:

```ts
export type AnalyzeInput =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; file: File }

export function looksLikeUrl(s: string): boolean {
  const t = s.trim()
  if (t.length === 0 || /\s/.test(t)) return false
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function decideInput(value: string, file: File | null): AnalyzeInput | null {
  if (file) return { kind: 'pdf', file }
  const t = value.trim()
  if (t.length === 0) return null
  return looksLikeUrl(t) ? { kind: 'url', url: t } : { kind: 'text', text: t }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/ui/input-kind.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the stream reader**

Create `lib/ui/stream.test.ts`:

```ts
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm exec vitest run lib/ui/stream.test.ts`
Expected: FAIL — "Cannot find module './stream'".

- [ ] **Step 7: Implement the stream reader**

Create `lib/ui/stream.ts`:

```ts
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
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run lib/ui/stream.test.ts`
Expected: PASS.

- [ ] **Step 9: Rewrite analyze-client**

Replace the contents of `lib/ui/analyze-client.ts` with:

```ts
import type { AnalyzeInput } from './input-kind'
import { readAnalyzeStream, type AnalyzeResult } from './stream'

function buildRequest(input: AnalyzeInput): RequestInit {
  if (input.kind === 'pdf') {
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
```

- [ ] **Step 10: Run the full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: todos los tests PASS; typecheck sin errores. (Nota: `page.tsx` se actualiza en la Task 9 para la nueva firma de `analyzeClient`; si typecheck falla solo por `page.tsx`, continuar a la Task 9.)

- [ ] **Step 11: Commit**

```bash
git add lib/ui/input-kind.ts lib/ui/input-kind.test.ts lib/ui/stream.ts lib/ui/stream.test.ts lib/ui/analyze-client.ts
git commit -m "feat(ui): cliente con decisión de entrada y lectura de stream de progreso"
```

---

### Task 9: UI — entrada inteligente (URL/texto/PDF), progreso y resumen de ingestión

**Files:**
- Modify: `components/opportunity-input.tsx` (reescritura)
- Create: `components/analysis/ingestion-summary.tsx`
- Modify: `app/page.tsx` (cablear estado nuevo)

**Interfaces:**
- Consumes: `decideInput` de `@/lib/ui/input-kind`; `analyzeClient` de `@/lib/ui/analyze-client`; `IngestionSummary` de `@/lib/ingest/types`.
- Produces: UI funcional end-to-end.

- [ ] **Step 1: Rewrite the input component**

Replace the contents of `components/opportunity-input.tsx` with:

```tsx
'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface OpportunityInputProps {
  value: string
  onChange: (value: string) => void
  onAnalyze: () => void
  onPickFile: (file: File | null) => void
  fileName: string | null
  collapsed: boolean
  loading: boolean
  progress?: string | null
  canAnalyze: boolean
  sourceName?: string
}

export function OpportunityInput({
  value, onChange, onAnalyze, onPickFile, fileName,
  collapsed, loading, progress, canAnalyze, sourceName,
}: OpportunityInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  if (collapsed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="truncate text-sm text-muted-foreground">
          {sourceName ?? 'Convocatoria analizada'}
        </span>
        <Button variant="outline" size="sm" onClick={onAnalyze} disabled={loading}>
          {loading ? 'Analizando…' : 'Re-analizar'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega el enlace (URL) de la convocatoria o su texto…"
        className="min-h-48 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      {fileName && (
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="truncate">📄 {fileName}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => { onPickFile(null); if (fileRef.current) fileRef.current.value = '' }}
          >
            Quitar
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={loading}>
          Subir PDF
        </Button>
        <div className="flex items-center gap-3">
          {loading && progress && (
            <span className="text-sm text-muted-foreground">{progress}</span>
          )}
          <Button onClick={onAnalyze} disabled={loading || !canAnalyze}>
            {loading ? 'Analizando…' : 'Analizar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the ingestion summary component**

Create `components/analysis/ingestion-summary.tsx`:

```tsx
import type { IngestionSummary } from '@/lib/ingest/types'

export function IngestionSummaryView({ ingestion }: { ingestion: IngestionSummary }) {
  const page = ingestion.sources.find((s) => s.type === 'page')
  const docs = ingestion.sources.filter((s) => s.type === 'pdf' || s.type === 'upload')

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      {page && (
        <p>
          <span className="font-medium">Leí:</span>{' '}
          {page.url ? (
            <a href={page.url} target="_blank" rel="noreferrer" className="text-primary underline">
              {page.name}
            </a>
          ) : (
            page.name
          )}
        </p>
      )}

      {docs.length > 0 && (
        <p className="mt-1">
          <span className="font-medium">Descargué {docs.length} documento{docs.length > 1 ? 's' : ''}:</span>{' '}
          {docs.map((d) => d.name).join(' · ')}
        </p>
      )}

      {ingestion.truncated && (
        <p className="mt-2 text-muted-foreground">
          ⚠️ Contenido extenso: analicé los primeros caracteres de cada documento.
        </p>
      )}

      {ingestion.notes.map((note, i) => (
        <p key={i} className="mt-1 text-muted-foreground">⚠️ {note}</p>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Wire up the page**

Replace the contents of `app/page.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { IngestionSummary } from '@/lib/ingest/types'
import { analyzeClient } from '@/lib/ui/analyze-client'
import { decideInput } from '@/lib/ui/input-kind'
import { OpportunityInput } from '@/components/opportunity-input'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { IngestionSummaryView } from '@/components/analysis/ingestion-summary'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type Status = 'idle' | 'loading' | 'done' | 'error'

function Brand() {
  return (
    <span>
      <span className="text-lg font-bold text-primary">🐂 moollish</span>{' '}
      <span className="text-muted-foreground">funding officer</span>
    </span>
  )
}

export default function Home() {
  const [status, setStatus] = useState<Status>('idle')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<OpportunityAnalysis | null>(null)
  const [ingestion, setIngestion] = useState<IngestionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canAnalyze = decideInput(text, file) !== null

  async function run() {
    const input = decideInput(text, file)
    if (!input) return
    setStatus('loading')
    setError(null)
    setProgress(null)
    try {
      const result = await analyzeClient(input, setProgress)
      setAnalysis(result.analysis)
      setIngestion(result.ingestion)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al analizar.')
      setStatus('error')
    }
  }

  if (status === 'idle') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 px-4 py-8 text-center">
        <Brand />
        <h1 className="text-3xl font-bold tracking-tight">Tu Chief Funding Officer AI</h1>
        <p className="text-muted-foreground">
          Pega el enlace o el texto de una convocatoria (o sube su PDF) y decido si conviene
          aplicar, con qué vehículo, bajo qué narrativa y qué hacer en las próximas 24-72h.
        </p>
        <div className="w-full text-left">
          <OpportunityInput
            value={text}
            onChange={setText}
            onAnalyze={run}
            onPickFile={setFile}
            fileName={file?.name ?? null}
            collapsed={false}
            loading={false}
            canAnalyze={canAnalyze}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-4 py-8">
      <header className="flex items-center gap-2">
        <Brand />
      </header>

      <OpportunityInput
        value={text}
        onChange={setText}
        onAnalyze={run}
        onPickFile={setFile}
        fileName={file?.name ?? null}
        collapsed={status === 'done'}
        loading={status === 'loading'}
        progress={progress}
        canAnalyze={canAnalyze}
        sourceName={analysis?.source.name}
      />

      {status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-medium">No se pudo analizar la convocatoria.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-3" size="sm" onClick={run}>Reintentar</Button>
        </div>
      )}

      {status === 'done' && ingestion && <IngestionSummaryView ingestion={ingestion} />}
      {status === 'done' && analysis && <AnalysisView analysis={analysis} />}
    </main>
  )
}
```

- [ ] **Step 4: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: sin errores de tipos; build OK.

- [ ] **Step 5: Manual verification (dev server)**

Run: `pnpm dev`, abrir el navegador y verificar tres caminos:
1. **Texto pegado** → análisis igual que antes + resumen "Leí: Texto pegado".
2. **URL** (con `FIRECRAWL_API_KEY` cargada) → progreso visible ("Leyendo la página…", "Descargando documento…"), resumen con página + documentos, y `deadline` poblado si el cronograma estaba en el PDF.
3. **Subir PDF** → análisis a partir del archivo; PDF >4.5 MB muestra el mensaje de límite.

Expected: los tres caminos funcionan; el resumen de ingestión aparece arriba del análisis.

- [ ] **Step 6: Commit**

```bash
git add components/opportunity-input.tsx components/analysis/ingestion-summary.tsx app/page.tsx
git commit -m "feat(ui): entrada inteligente URL/texto/PDF, progreso y resumen de ingestión"
```

---

## Self-Review

**Spec coverage** (contra `2026-06-18-agente1-ingestion-design.md`):

- §3 estructura de archivos (`firecrawl/document-links/pdf/ingest/config` + `ingestion-summary` + runner CLI) → Tasks 1-6, 9. ✅
- §4 `IngestResult` (text/sources/truncated/notes) → Task 1 (tipos) + Task 2 (sources) + Task 3 (notes/truncated). ✅
- §5.1 flujo URL (scrape → select docs → scrape docs → assemble) → Task 3 + 4. ✅
- §5.2 PDF subido + cap 4.5 MB + escaneado→nota → Task 3 (nota) + Task 5 (unpdf) + Task 7 (cap). ✅
- §5.3 texto passthrough → Task 3. ✅
- §6 API ingest→analyze, `maxDuration=120`, stream de progreso, validación entrada → Task 7. ✅
- §7.1 campo inteligente + Subir PDF + progreso → Task 9. ✅
- §7.2 resumen de ingestión → Task 9. ✅
- §8 env/caps → Task 1 (config) + Task 5 (.env.example). ✅
- §9 guardrails (degradación honesta, truncación visible, escaneado) → Tasks 3, 9. ✅
- §10 testing (document-links, corpus, input, cliente Firecrawl mockeado, CLI live) → Tasks 1-6, 8. ✅
- §11 criterios de aceptación → Task 9 step 5 (verificación manual de los 3 caminos). ✅
- §12 dependencias (`unpdf`; Firecrawl vía REST/fetch) → Task 4 (fetch), Task 5 (unpdf). ✅

**Placeholder scan:** sin "TBD"/"TODO"/"handle edge cases"; cada step de código trae el código completo. La única verificación condicionada por entorno (live smoke test, Task 6 step 3) está marcada como tal con fallback, no es un placeholder de implementación.

**Type consistency:** `Reader`/`PageContent`/`IngestSource`/`IngestResult`/`IngestionSummary`/`ProgressEvent` definidos en Task 1 y usados consistentes en Tasks 2-9. `AnalyzeInput`/`AnalyzeResult` definidos en Task 8 y consumidos en Tasks 8-9. `createFirecrawlReader`, `extractPdfText`, `ingestFrom*`, `assembleCorpus`/`CorpusInput`, `selectDocumentLinks`/`docNameFromUrl`, `decideInput`/`looksLikeUrl`, `readAnalyzeStream` — nombres y firmas idénticos entre definición y consumo.
