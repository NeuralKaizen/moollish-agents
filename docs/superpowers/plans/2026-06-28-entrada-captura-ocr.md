# Entrada por captura (OCR/visión) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir/pegar una captura de una convocatoria → leerla con visión → seguir el enlace detectado → analizarla con el pipeline existente → persistir la captura como Documento auditable.

**Architecture:** Un paso de visión (OpenRouter multimodal) extrae texto + URL de la imagen; `ingestFromImage` combina ese texto con la página enlazada (Firecrawl) en el mismo `IngestResult` que las otras vías, y `analyzeOpportunity` corre sin cambios. La captura se sube a Supabase Storage y se registra en una nueva tabla `documents` al guardar la oportunidad.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle, `@supabase/supabase-js` (Storage), AI SDK v6 + OpenRouter (visión), Vitest.

> **NOTA DE EJECUCIÓN (2026-06-28):** la persistencia de la captura se DIFIERE hasta que el
> cliente confirme el proveedor de almacenamiento (Supabase Storage vs S3/R2/etc.). Tareas
> diferidas: **2, 3, 9, 11, 13**. Se implementan ahora solo las storage-free: **4, 5, 6, 7, 8,
> 10, 12** (las capturas se analizan y entran al pipeline vía `addOpportunityAction`; la imagen
> original aún no se retiene). El diseño ya es agnóstico del proveedor (la tabla `documents`
> guarda solo `storage_path`), así que retomar la persistencia toca sobre todo `lib/db/storage.ts`.

## Global Constraints

- **Producto, no demo:** robustez, persistencia real de artefactos, degradación elegante. (memoria `building-product-not-demo`)
- **Reusar el pipeline existente:** `analyzeOpportunity`, `assembleCorpus`, el `Reader` de Firecrawl y la persistencia de oportunidades de Fase A NO se reescriben.
- **Visión vive en `lib/agent/vision.ts`** (refina la mención del spec a llm.ts, por responsabilidad única). Modelo: `process.env.VISION_MODEL ?? DEFAULT_MODEL` (de `@/lib/agent/config`, hoy `google/gemini-2.5-flash`, ya multimodal).
- **`ingestFromImage` recibe la visión y el reader inyectados** (`deps.visionExtract`, `deps.reader`) → testeable con mocks, sin pegarle al LLM en tests.
- **Degradación:** sin URL detectada o si el scrape/Firecrawl falla → análisis solo-imagen + nota; nunca romper.
- **Tabla `documents` acotada (YAGNI):** id, opportunity_id (FK → opportunities.id, on delete cascade), kind, storage_path, ocr_text, created_at. Nada más.
- **Secuencia de guardado sin huérfanos:** subir a Storage → upsert oportunidad → insertar documento; si Storage falla, abortar antes de tocar la DB.
- **Storage server-side only:** la service role key nunca llega al cliente. Cliente Storage lazy (importar no debe lanzar), igual que `lib/db/client.ts`.
- **Multipart por mime:** distinguir imagen vs PDF por `file.type` (`image/...`), no por extensión.
- **Tests de DB/Storage** usan `describe.skipIf(!<env>)`; correr individualmente con la env exportada (`pnpm test <archivo>`, SIN `--`).
- Mantener verde la suite actual (116 tests) y `pnpm typecheck` limpio en cada tarea.

## Prerequisitos (no es código — el implementador los necesita disponibles)

- `.env.local` ya tiene `DATABASE_URL` y `OPENROUTER_API_KEY`. Añadir además:
  - `SUPABASE_URL=https://<ref>.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY=<service role key>` (Supabase → Project Settings → API)
- El bucket privado `captures` se crea con `pnpm init:storage` (Task 2).

---

### Task 1: Tabla `documents` + migración

**Files:**
- Modify: `lib/db/schema.ts`
- Create (generado): `drizzle/*.sql`

**Interfaces:**
- Consumes: `opportunities` (de `@/lib/db/schema`).
- Produces: tabla `documents`; tipos `DocumentRow` ($inferSelect), `NewDocumentRow` ($inferInsert).

- [ ] **Step 1: Agregar la tabla a `lib/db/schema.ts`**

Añadir al final del archivo (después de los exports de opportunities):
```ts
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'captura'
  storagePath: text('storage_path').notNull(),
  ocrText: text('ocr_text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DocumentRow = typeof documents.$inferSelect
export type NewDocumentRow = typeof documents.$inferInsert
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Generar la migración**

Run: `pnpm db:generate`
Expected: nuevo archivo en `drizzle/` con `CREATE TABLE "documents"` y el FK a `opportunities`.

- [ ] **Step 4: Aplicar a Supabase**

Run: `pnpm db:push`
Expected: "Changes applied"; tabla `documents` creada.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): tabla documents (§15 Documento) con FK a opportunities"
```

---

### Task 2: Cliente de Storage + bucket

**Files:**
- Create: `lib/db/storage.ts`
- Create: `scripts/init-storage.ts`
- Modify: `package.json` (dep + script)
- Test: `lib/db/storage.test.ts`

**Interfaces:**
- Produces:
  - `uploadCapture(path: string, bytes: Uint8Array, mime: string): Promise<void>`
  - `signedCaptureUrl(path: string, expiresInSec?: number): Promise<string>`
  - `capturePath(opportunityId: string, filename: string, ts: string): string`

- [ ] **Step 1: Instalar el SDK de Supabase**

Run: `pnpm add @supabase/supabase-js`

- [ ] **Step 2: Agregar script a `package.json`**

En `"scripts"`, añadir:
```json
    "init:storage": "tsx scripts/init-storage.ts",
```

- [ ] **Step 3: Escribir el test de la parte pura (`capturePath`)**

```ts
// lib/db/storage.test.ts
import { describe, it, expect } from 'vitest'
import { capturePath } from './storage'

describe('capturePath', () => {
  it('arma una ruta determinística bajo el opportunity_id, saneando el nombre', () => {
    expect(capturePath('fao-agrinno', 'mi captura (1).png', '1700000000000'))
      .toBe('fao-agrinno/1700000000000-mi_captura__1_.png')
  })
})
```

- [ ] **Step 4: Run test → fail**

Run: `pnpm test lib/db/storage.test.ts`
Expected: FAIL ("capturePath is not a function" / módulo no encontrado).

- [ ] **Step 5: Implementar `lib/db/storage.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const CAPTURES_BUCKET = 'captures'

let client: SupabaseClient | null = null

// Lazy: importar este módulo no lanza; el error por env ausente recién en el primer uso.
function getClient(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY para Storage (revisá .env.local).')
  }
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

export function capturePath(opportunityId: string, filename: string, ts: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${opportunityId}/${ts}-${safe}`
}

export async function uploadCapture(path: string, bytes: Uint8Array, mime: string): Promise<void> {
  const { error } = await getClient().storage.from(CAPTURES_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false })
  if (error) throw new Error(`No pude subir la captura a Storage: ${error.message}`)
}

export async function signedCaptureUrl(path: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await getClient().storage.from(CAPTURES_BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error || !data) throw new Error(`No pude firmar la URL de la captura: ${error?.message ?? 'sin datos'}.`)
  return data.signedUrl
}
```

- [ ] **Step 6: Run test → pass**

Run: `pnpm test lib/db/storage.test.ts`
Expected: PASS (1).

- [ ] **Step 7: Escribir `scripts/init-storage.ts`**

```ts
import '../lib/load-env'
import { createClient } from '@supabase/supabase-js'
import { CAPTURES_BUCKET } from '../lib/db/storage'

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1) }
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: buckets, error: listErr } = await sb.storage.listBuckets()
  if (listErr) { console.error(listErr.message); process.exit(1) }
  if (buckets?.some((b) => b.name === CAPTURES_BUCKET)) {
    console.error(`[init-storage] El bucket '${CAPTURES_BUCKET}' ya existe.`); process.exit(0)
  }
  const { error } = await sb.storage.createBucket(CAPTURES_BUCKET, { public: false })
  if (error) { console.error(error.message); process.exit(1) }
  console.error(`[init-storage] Bucket privado '${CAPTURES_BUCKET}' creado.`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 8: Crear el bucket** (requiere las env de Supabase en `.env.local`)

Run: `pnpm init:storage`
Expected: "Bucket privado 'captures' creado." (o "ya existe").

- [ ] **Step 9: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/db/storage.ts lib/db/storage.test.ts scripts/init-storage.ts package.json pnpm-lock.yaml
git commit -m "feat(db): cliente Supabase Storage (lazy) + script init:storage para bucket captures"
```

---

### Task 3: Queries de documentos

**Files:**
- Create: `lib/db/documents.ts`
- Test: `lib/db/documents.test.ts`

**Interfaces:**
- Consumes: `db`, `documents`, `DocumentRow` (de `@/lib/db/*`); `opportunities`, `opportunityToRow` (en el test); `makeOpportunity` (en el test).
- Produces:
  - `addDocument(doc: { id: string; opportunityId: string; kind: string; storagePath: string; ocrText: string }): Promise<void>`
  - `listDocuments(opportunityId: string): Promise<DocumentRow[]>`

> Integración: `describe.skipIf(!process.env.DATABASE_URL)`. Limpia `documents` y `opportunities` en `beforeEach`.

- [ ] **Step 1: Escribir el test**

```ts
// lib/db/documents.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { documents, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { addDocument, listDocuments } from './documents'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'caso-doc', source: { name: 'Caso Doc' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('documents (integración)', () => {
  beforeEach(async () => { await db.delete(documents); await db.delete(opportunities) })

  it('addDocument inserta y listDocuments lo recupera por opportunity_id', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await addDocument({ id: 'caso-doc-1', opportunityId: 'caso-doc', kind: 'captura', storagePath: 'caso-doc/1-x.png', ocrText: 'texto ocr' })
    const docs = await listDocuments('caso-doc')
    expect(docs).toHaveLength(1)
    expect(docs[0].kind).toBe('captura')
    expect(docs[0].ocrText).toBe('texto ocr')
    expect(await listDocuments('otra')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/documents.test.ts`
Expected: FAIL ("addDocument is not a function").

- [ ] **Step 3: Implementar `lib/db/documents.ts`**

```ts
import { eq } from 'drizzle-orm'
import { db } from './client'
import { documents, type DocumentRow } from './schema'

export async function addDocument(doc: {
  id: string; opportunityId: string; kind: string; storagePath: string; ocrText: string
}): Promise<void> {
  await db.insert(documents).values(doc)
}

export async function listDocuments(opportunityId: string): Promise<DocumentRow[]> {
  return db.select().from(documents).where(eq(documents.opportunityId, opportunityId))
}
```

- [ ] **Step 4: Run → pass**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/documents.test.ts`
Expected: PASS (1).

- [ ] **Step 5: Commit**

```bash
git add lib/db/documents.ts lib/db/documents.test.ts
git commit -m "feat(db): queries addDocument/listDocuments"
```

---

### Task 4: Visión — extracción desde imagen

**Files:**
- Create: `lib/agent/vision.ts`
- Test: `lib/agent/vision.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MODEL` (de `@/lib/agent/config`).
- Produces:
  - `VisionExtractSchema` (Zod) y `type VisionExtract = { text: string; detected_url: string | null; source_guess: string | null }`
  - `type VisionExtractor = (bytes: Uint8Array, mime: string) => Promise<VisionExtract>`
  - `toImageDataUrl(bytes: Uint8Array, mime: string): string`
  - `generateVisionExtract(bytes: Uint8Array, mime: string, model?: string): Promise<VisionExtract>`
  - `VISION_MODEL: string`

- [ ] **Step 1: Escribir el test (parte pura)**

```ts
// lib/agent/vision.test.ts
import { describe, it, expect } from 'vitest'
import { toImageDataUrl, VisionExtractSchema } from './vision'

describe('vision (puro)', () => {
  it('toImageDataUrl arma un data URL base64 con el mime', () => {
    const bytes = new Uint8Array([0x68, 0x69]) // "hi"
    expect(toImageDataUrl(bytes, 'image/png')).toBe('data:image/png;base64,aGk=')
  })

  it('VisionExtractSchema acepta detected_url/source_guess nulos', () => {
    const parsed = VisionExtractSchema.parse({ text: 'hola', detected_url: null, source_guess: null })
    expect(parsed.text).toBe('hola')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/agent/vision.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar `lib/agent/vision.ts`**

```ts
import '../load-env'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { DEFAULT_MODEL } from './config'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export const VISION_MODEL = process.env.VISION_MODEL ?? DEFAULT_MODEL

export const VisionExtractSchema = z.object({
  text: z.string().describe('Transcripción fiel del texto visible en la imagen. Vacío si no hay texto legible.'),
  detected_url: z.string().nullable().describe('URL de la convocatoria si aparece o es claramente inferible; si no, null.'),
  source_guess: z.string().nullable().describe('Fuente probable, p. ej. "Instagram @fao" o "correo de FONTAGRO"; si no se infiere, null.'),
})
export type VisionExtract = z.infer<typeof VisionExtractSchema>
export type VisionExtractor = (bytes: Uint8Array, mime: string) => Promise<VisionExtract>

export function toImageDataUrl(bytes: Uint8Array, mime: string): string {
  const base64 = Buffer.from(bytes).toString('base64')
  return `data:${mime};base64,${base64}`
}

const SYSTEM = `Sos un asistente que lee capturas de pantalla de convocatorias de financiación.
Transcribí fielmente TODO el texto visible. No inventes datos que no estén en la imagen.
Si ves una URL de la convocatoria, devolvela en detected_url. Si podés inferir la fuente
(red social, cuenta, remitente de correo), devolvela en source_guess. Si algo es ilegible, omitilo.`

export async function generateVisionExtract(
  bytes: Uint8Array, mime: string, model: string = VISION_MODEL,
): Promise<VisionExtract> {
  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: VisionExtractSchema }),
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Leé esta captura de una convocatoria y devolvé el extracto estructurado.' },
        { type: 'image', image: toImageDataUrl(bytes, mime) },
      ],
    }],
  })
  return output
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test lib/agent/vision.test.ts`
Expected: PASS (2). (`generateVisionExtract` se valida en runtime vía la ruta; no se le pega al LLM en tests.)

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/agent/vision.ts lib/agent/vision.test.ts
git commit -m "feat(agent): extracción por visión (OpenRouter multimodal) con salida estructurada"
```

---

### Task 5: `ingestFromImage`

**Files:**
- Create: `lib/ingest/image.ts`
- Test: `lib/ingest/image.test.ts`

**Interfaces:**
- Consumes: `Reader`, `IngestResult`, `CorpusInput`/`assembleCorpus`, `resolveCaps`/`IngestCaps` (de `./ingest`), `VisionExtract`/`VisionExtractor` (de `@/lib/agent/vision`).
- Produces: `ingestFromImage(bytes: Uint8Array, mime: string, name: string, deps: ImageIngestDeps, caps?: IngestCaps): Promise<{ result: IngestResult; extract: VisionExtract }>` con `ImageIngestDeps = { visionExtract: VisionExtractor; reader?: Reader; onProgress?: (s: string) => void }`.

> `resolveCaps` no está exportado hoy. Step 1 lo exporta.

- [ ] **Step 1: Exportar `resolveCaps` desde `lib/ingest/ingest.ts`**

Cambiar la línea `function resolveCaps(caps: IngestCaps) {` por:
```ts
export function resolveCaps(caps: IngestCaps) {
```

- [ ] **Step 2: Escribir el test**

```ts
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
```

- [ ] **Step 3: Run → fail**

Run: `pnpm test lib/ingest/image.test.ts`
Expected: FAIL ("ingestFromImage is not a function").

- [ ] **Step 4: Implementar `lib/ingest/image.ts`**

```ts
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
```

- [ ] **Step 5: Run → pass**

Run: `pnpm test lib/ingest/image.test.ts`
Expected: PASS (4).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/ingest/image.ts lib/ingest/image.test.ts lib/ingest/ingest.ts
git commit -m "feat(ingest): ingestFromImage (visión + seguir enlace + degradación)"
```

---

### Task 6: Tipo de entrada `image`

**Files:**
- Modify: `lib/ui/input-kind.ts`
- Test: `lib/ui/input-kind.test.ts`

**Interfaces:**
- Produces: `AnalyzeInput` suma `{ kind: 'image'; file: File }`; `decideInput` enruta archivos `image/*` a `image`, el resto de archivos a `pdf`.

- [ ] **Step 1: Agregar el test** (al final de `lib/ui/input-kind.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { decideInput } from './input-kind'

describe('decideInput (imagen)', () => {
  it('un archivo image/* es kind image', () => {
    const file = new File([new Uint8Array([1])], 'cap.png', { type: 'image/png' })
    expect(decideInput('', file)).toEqual({ kind: 'image', file })
  })
  it('un archivo no-imagen sigue siendo pdf', () => {
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' })
    expect(decideInput('', file)).toEqual({ kind: 'pdf', file })
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/ui/input-kind.test.ts`
Expected: FAIL (el archivo image hoy devuelve `{kind:'pdf'}`).

- [ ] **Step 3: Modificar `lib/ui/input-kind.ts`**

Cambiar el tipo y `decideInput`:
```ts
export type AnalyzeInput =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; file: File }
  | { kind: 'image'; file: File }
```
Y la primera línea de `decideInput`:
```ts
  if (file) return file.type.startsWith('image/') ? { kind: 'image', file } : { kind: 'pdf', file }
```
(El resto de `decideInput` y `looksLikeUrl` no cambia.)

- [ ] **Step 4: Run → pass**

Run: `pnpm test lib/ui/input-kind.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/input-kind.ts lib/ui/input-kind.test.ts
git commit -m "feat(ui): decideInput reconoce capturas (kind image)"
```

---

### Task 7: Campo `capture` en el stream

**Files:**
- Modify: `lib/ingest/types.ts`
- Modify: `lib/ui/stream.ts`
- Test: `lib/ui/stream.test.ts`

**Interfaces:**
- Produces: `ProgressEvent` `result` suma `capture?: { ocr_text: string; source_guess: string | null }`; `AnalyzeResult` suma `capture?: { ocr_text: string; source_guess: string | null }`.

- [ ] **Step 1: Agregar el test** (al final de `lib/ui/stream.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { readAnalyzeStream } from './stream'

function streamOf(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({ start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close() } })
}

describe('readAnalyzeStream (capture)', () => {
  it('propaga el campo capture del evento result', async () => {
    const analysis = { opportunity_id: 'x', source: { name: 'X' } }
    const result = await readAnalyzeStream(streamOf([
      JSON.stringify({ type: 'result', analysis, ingestion: { sources: [], truncated: false, notes: [] }, capture: { ocr_text: 'ocr', source_guess: 'IG @x' } }),
    ]))
    expect(result.capture?.ocr_text).toBe('ocr')
    expect(result.capture?.source_guess).toBe('IG @x')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/ui/stream.test.ts`
Expected: FAIL (`result.capture` es undefined / type error en build del test).

- [ ] **Step 3: Modificar `lib/ingest/types.ts`**

Cambiar la variante `result` de `ProgressEvent`:
```ts
  | { type: 'result'; analysis: OpportunityAnalysis; ingestion: IngestionSummary; capture?: { ocr_text: string; source_guess: string | null } }
```

- [ ] **Step 4: Modificar `lib/ui/stream.ts`**

Añadir el campo a `AnalyzeResult`:
```ts
export interface AnalyzeResult {
  analysis: OpportunityAnalysis
  ingestion: IngestionSummary
  capture?: { ocr_text: string; source_guess: string | null }
}
```
Y en la rama `result`:
```ts
      else if (evt.type === 'result') result = { analysis: evt.analysis, ingestion: evt.ingestion, capture: evt.capture }
```

- [ ] **Step 5: Run → pass**

Run: `pnpm test lib/ui/stream.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/ingest/types.ts lib/ui/stream.ts lib/ui/stream.test.ts
git commit -m "feat(ui): el stream propaga el extracto de la captura (capture)"
```

---

### Task 8: `analyze-client` manda la imagen

**Files:**
- Modify: `lib/ui/analyze-client.ts`

**Interfaces:**
- Consumes: `AnalyzeInput` (con `image`).

- [ ] **Step 1: Modificar `buildRequest` en `lib/ui/analyze-client.ts`**

Cambiar el `if (input.kind === 'pdf')` por:
```ts
  if (input.kind === 'pdf' || input.kind === 'image') {
    const form = new FormData()
    form.append('file', input.file)
    return { method: 'POST', body: form }
  }
```
(El resto del archivo no cambia.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/ui/analyze-client.ts
git commit -m "feat(ui): analyze-client envía la captura como multipart"
```

---

### Task 9: Acción `addOpportunityWithCaptureAction`

**Files:**
- Modify: `lib/db/actions.ts`
- Test: `lib/db/actions.test.ts`

**Interfaces:**
- Consumes: `uploadCapture`/`capturePath` (de `@/lib/db/storage`), `addDocument` (de `@/lib/db/documents`).
- Produces: `addOpportunityWithCaptureAction(analysis: OpportunityAnalysis, capture: { base64: string; mime: string; filename: string; ocrText: string }): Promise<void>`; helper interno `upsertOpportunity(analysis)`.

> Integración con DB. La subida a Storage se mockea en el test (no pegamos a Storage real acá; eso lo cubre runtime/Task 2). Mock de `next/cache` ya presente en el archivo.

- [ ] **Step 1: Escribir el test** (añadir al `describe.skipIf(!hasDb)` de `lib/db/actions.test.ts`)

Al tope del archivo, junto a los otros `vi.mock`, agregar un mock de Storage:
```ts
import { vi } from 'vitest'
vi.mock('@/lib/db/storage', () => ({
  capturePath: (id: string, f: string, ts: string) => `${id}/${ts}-${f}`,
  uploadCapture: vi.fn(async () => {}),
}))
```
Y el caso (dentro del describe de integración):
```ts
  it('addOpportunityWithCaptureAction sube, crea la oportunidad y registra el documento', async () => {
    const { listDocuments } = await import('./documents')
    await addOpportunityWithCaptureAction(analysis, { base64: 'aGk=', mime: 'image/png', filename: 'cap.png', ocrText: 'texto ocr' })
    const o = await getOpportunity('caso-x')
    expect(o?.state).toBe('analizada')
    const docs = await listDocuments('caso-x')
    expect(docs).toHaveLength(1)
    expect(docs[0].storagePath).toContain('caso-x/')
    expect(docs[0].ocrText).toBe('texto ocr')
  })
```

- [ ] **Step 2: Run → fail**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/actions.test.ts`
Expected: FAIL ("addOpportunityWithCaptureAction is not a function").

- [ ] **Step 3: Modificar `lib/db/actions.ts`**

Añadir imports al tope:
```ts
import { uploadCapture, capturePath } from './storage'
import { addDocument } from './documents'
```
Extraer el helper de upsert y reusarlo en `addOpportunityAction`:
```ts
async function upsertOpportunity(analysis: OpportunityAnalysis): Promise<void> {
  const row = opportunityToRow(makeOpportunity(analysis, new Date().toISOString()))
  // Re-analizar conserva el progreso del pipeline (state/tasks/responsible); solo refresca el análisis.
  await db.insert(opportunities).values(row)
    .onConflictDoUpdate({ target: opportunities.id, set: { analysis: row.analysis } })
}

export async function addOpportunityAction(analysis: OpportunityAnalysis): Promise<void> {
  await upsertOpportunity(analysis)
  revalidateAll()
}

export async function addOpportunityWithCaptureAction(
  analysis: OpportunityAnalysis,
  capture: { base64: string; mime: string; filename: string; ocrText: string },
): Promise<void> {
  const oppId = analysis.opportunity_id
  const ts = String(Date.now())
  const path = capturePath(oppId, capture.filename, ts)
  const bytes = Uint8Array.from(Buffer.from(capture.base64, 'base64'))
  // Orden sin huérfanos: Storage primero; si falla, no se toca la DB.
  await uploadCapture(path, bytes, capture.mime)
  await upsertOpportunity(analysis)
  await addDocument({ id: `${oppId}-${ts}`, opportunityId: oppId, kind: 'captura', storagePath: path, ocrText: capture.ocrText })
  revalidateAll()
}
```
(Borrar el cuerpo viejo de `addOpportunityAction` que tenía el insert inline.)

- [ ] **Step 4: Run → pass**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/actions.test.ts`
Expected: PASS (las 6 previas + la nueva).

- [ ] **Step 5: Typecheck + no-DB suite limpia**

Run: `pnpm typecheck` → PASS.
Run: `pnpm test` (sin DATABASE_URL) → unit verdes, integración skip.

- [ ] **Step 6: Commit**

```bash
git add lib/db/actions.ts lib/db/actions.test.ts
git commit -m "feat(db): addOpportunityWithCaptureAction (Storage → oportunidad → documento)"
```

---

### Task 10: Ruta `/api/analyze` maneja imágenes

**Files:**
- Modify: `app/api/analyze/route.ts`

**Interfaces:**
- Consumes: `ingestFromImage` (`@/lib/ingest/image`), `generateVisionExtract` (`@/lib/agent/vision`).

- [ ] **Step 1: Reescribir `runIngest` y el `result` en `app/api/analyze/route.ts`**

Imports nuevos (añadir):
```ts
import { ingestFromImage } from '@/lib/ingest/image'
import { generateVisionExtract } from '@/lib/agent/vision'
```
Cambiar la firma y el cuerpo de `runIngest` a:
```ts
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
```
Y en `POST`, cambiar el bloque del try a:
```ts
        const { ingest, capture } = await runIngest(req, (step) => send({ type: 'progress', step }))
        send({ type: 'progress', step: 'Analizando…' })
        const analysis = await analyzeOpportunity(ingest.text, { generate: generateWithOpenRouter })
        send({
          type: 'result',
          analysis,
          ingestion: { sources: ingest.sources, truncated: ingest.truncated, notes: ingest.notes },
          ...(capture ? { capture } : {}),
        })
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat(api): /api/analyze ingiere capturas (visión) y emite capture"
```

---

### Task 11: `page.tsx` guarda la captura

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `addOpportunityWithCaptureAction` (`@/lib/db/actions`).

- [ ] **Step 1: Agregar helper y wiring en `app/page.tsx`**

Añadir import:
```ts
import { addOpportunityAction, addOpportunityWithCaptureAction } from '@/lib/db/actions'
```
Añadir el helper (arriba del componente `Home`, después de `Brand`):
```ts
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
```
En `run()`, reemplazar el bloque que hoy hace `setAnalysis` + `addOpportunityAction`:
```ts
      const result = await analyzeClient(input, setProgress)
      setAnalysis(result.analysis)
      if (input.kind === 'image' && result.capture) {
        const base64 = await fileToBase64(input.file)
        await addOpportunityWithCaptureAction(result.analysis, {
          base64, mime: input.file.type, filename: input.file.name, ocrText: result.capture.ocr_text,
        })
      } else {
        await addOpportunityAction(result.analysis)
      }
      setIngestion(result.ingestion)
      setStatus('done')
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(app): guardar la captura (addOpportunityWithCaptureAction) al analizar imagen"
```

---

### Task 12: UI de subir/pegar captura + preview

**Files:**
- Modify: `components/opportunity-input.tsx`
- Modify: `app/page.tsx` (pasar `file` al componente, en los 2 usos)

**Interfaces:**
- Consumes: `onPickFile`, `file` (nuevo prop).

- [ ] **Step 1: Pasar `file` al `OpportunityInput` en `app/page.tsx`**

En las DOS instancias de `<OpportunityInput ... />` (idle y done), añadir el prop:
```tsx
            file={file}
```
(junto a `fileName={file?.name ?? null}`).

- [ ] **Step 2: Reescribir `components/opportunity-input.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface OpportunityInputProps {
  value: string
  onChange: (value: string) => void
  onAnalyze: () => void
  onPickFile: (file: File | null) => void
  file: File | null
  fileName: string | null
  collapsed: boolean
  loading: boolean
  progress?: string | null
  canAnalyze: boolean
  sourceName?: string
  presets?: { id: string; label: string }[]
  onPickPreset?: (id: string) => void
}

export function OpportunityInput({
  value, onChange, onAnalyze, onPickFile, file, fileName,
  collapsed, loading, progress, canAnalyze, sourceName,
  presets, onPickPreset,
}: OpportunityInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const isImage = file?.type.startsWith('image/') ?? false
  const previewUrl = useMemo(() => (isImage && file ? URL.createObjectURL(file) : null), [isImage, file])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function onPaste(e: React.ClipboardEvent) {
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (img) { e.preventDefault(); onPickFile(img) }
  }

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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm" onPaste={onPaste}>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-muted-foreground">Casos reales:</span>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPickPreset?.(p.id)}
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega el enlace (URL), el texto, o pegá una captura (Ctrl/Cmd+V)…"
        className="min-h-48 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      {fileName && (
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {previewUrl
              ? <img src={previewUrl} alt="captura" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span>📄</span>}
            <span className="truncate">{fileName}</span>
          </span>
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
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={loading}>
          Subir PDF o captura
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

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/opportunity-input.tsx app/page.tsx
git commit -m "feat(ui): subir/pegar captura con preview en el analizador"
```

---

### Task 13: Mostrar la captura como evidencia en el detalle

**Files:**
- Create: `components/analysis/capture-evidence.tsx`
- Modify: `app/oportunidad/[id]/page.tsx`

**Interfaces:**
- Consumes: `listDocuments` (`@/lib/db/documents`), `signedCaptureUrl` (`@/lib/db/storage`).

- [ ] **Step 1: Crear `components/analysis/capture-evidence.tsx`**

```tsx
import { Card } from '@/components/ui/card'

export function CaptureEvidence({ captures }: { captures: { url: string; ocrText: string }[] }) {
  if (captures.length === 0) return null
  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Captura original (evidencia)
      </p>
      <div className="flex flex-col gap-3">
        {captures.map((c, i) => (
          <a key={i} href={c.url} target="_blank" rel="noreferrer">
            <img src={c.url} alt={`captura ${i + 1}`} className="max-h-96 w-auto rounded-md border border-border" />
          </a>
        ))}
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Cargar y firmar las capturas en `app/oportunidad/[id]/page.tsx`**

Añadir imports:
```ts
import { listDocuments } from '@/lib/db/documents'
import { signedCaptureUrl } from '@/lib/db/storage'
import { CaptureEvidence } from '@/components/analysis/capture-evidence'
```
Dentro del componente, después de `if (!o) return notFound()`:
```ts
  const docs = await listDocuments(id)
  const captures = await Promise.all(
    docs.filter((d) => d.kind === 'captura').map(async (d) => ({
      url: await signedCaptureUrl(d.storagePath),
      ocrText: d.ocrText,
    })),
  )
```
Y en el JSX, agregar el componente debajo de `<AnalysisView .../>`:
```tsx
      <AnalysisView analysis={o.analysis} />
      <CaptureEvidence captures={captures} />
      <TaskList o={o} />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Build de producción** (verificación end-to-end de la fase)

Run: `pnpm build`
Expected: compila; `/oportunidad/[id]` sigue dinámica (lee DB + firma URLs).

- [ ] **Step 5: Suite completa**

Run: `pnpm test` (sin DATABASE_URL) → unit verdes, integración skip.
Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/documents.test.ts && pnpm test lib/db/actions.test.ts` → verdes.

- [ ] **Step 6: Commit**

```bash
git add components/analysis/capture-evidence.tsx app/oportunidad/[id]/page.tsx
git commit -m "feat(detalle): mostrar la captura original como evidencia (URL firmada)"
```

---

## Self-Review

**Spec coverage:**
- Tipo de entrada imagen + decideInput → Task 6. ✅
- Subir + pegar + preview → Task 12. ✅
- Visión (texto + detected_url + source_guess) → Task 4. ✅
- Seguir enlace + combinar + degradar → Task 5. ✅
- Reusar analyzeOpportunity → Task 10 (sin tocar el analizador). ✅
- Storage (bucket privado, lazy, server-side) → Task 2. ✅
- Tabla documents (§15 acotada, FK cascade) → Task 1. ✅
- Secuencia sin huérfanos (Storage→opp→doc) → Task 9. ✅
- Mostrar captura en el detalle (URL firmada) → Task 13. ✅
- Campo capture en el stream → Task 7; envío multipart → Task 8; guardado → Task 11. ✅
- Errores product-grade (imagen ilegible, scrape falla, storage falla, tamaño, mime) → Tasks 5, 9, 10. ✅
- Env nuevas (SUPABASE_URL, SERVICE_ROLE_KEY, VISION_MODEL) → Prerequisitos + Tasks 2/4. ✅
- Testing (image puro, input-kind, documents, action, stream) → Tasks 5,6,3,9,7. ✅

**Placeholder scan:** sin TBD/TODO; cada step con código real o comando con salida esperada. Los "(El resto … no cambia)" refieren a archivos abiertos con instrucción precisa de qué línea cambiar.

**Type consistency:** `VisionExtract`/`VisionExtractor` (Task 4) usados en Tasks 5 y 10. `ingestFromImage` devuelve `{ result, extract }` en Tasks 5 y 10. `capture: { ocr_text, source_guess }` consistente en Tasks 7, 10, 11. `addOpportunityWithCaptureAction(analysis, { base64, mime, filename, ocrText })` consistente en Tasks 9 y 11. `capturePath/uploadCapture/signedCaptureUrl` (Task 2) usados en Tasks 9 y 13. `addDocument/listDocuments` (Task 3) usados en Tasks 9 y 13. `OpportunityInput` suma prop `file` (Task 12) pasado desde page (Task 12 Step 1).
