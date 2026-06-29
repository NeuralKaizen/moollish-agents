# Conector de correo reenviado (Gmail, §8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leer periódicamente una casilla Gmail dedicada (correos reenviados con convocatorias), analizarlos con el pipeline existente y dejarlos en el pipeline de oportunidades, deduplicando por mensaje.

**Architecture:** Un endpoint de cron protegido (`/api/cron/gmail`) que Vercel Cron dispara; lee Gmail vía `googleapis` (OAuth refresh token, scope readonly) detrás de una interfaz inyectable; parsea cuerpo + adjuntos PDF a corpus (puro); orquesta análisis+guardado en una función `processInbox` con dependencias inyectadas (testeable con fakes); deduplica con una tabla `processed_emails`.

**Tech Stack:** Next.js 16 (API route + Vercel Cron), `googleapis`, Drizzle + Supabase Postgres, AI SDK + OpenRouter, Vitest.

## Global Constraints

- **Producto, no demo** (memoria `building-product-not-demo`): robustez, degradación elegante.
- **Auth Gmail: OAuth + refresh token, scope `gmail.readonly`** (solo lectura; nunca modifica la casilla). Lib `googleapis`.
- **Trigger: Vercel Cron polling** (no push). Endpoint protegido por `CRON_SECRET` (header `Authorization: Bearer <CRON_SECRET>`; 401 si no coincide).
- **Dedup por `message_id`** en tabla `processed_emails` (no se toca Gmail).
- **Un correo = una oportunidad.** Adjuntos: solo PDF se extraen (reusa `extractPdfText`); otros se omiten con nota. **El binario del adjunto NO se retiene** (storage diferido).
- **Sin envíos automáticos** (§22): solo lectura + registro.
- **Cliente Gmail lazy**: importar `lib/gmail/client.ts` no debe lanzar; el throw por env ausente recién en el primer uso (patrón de `lib/db/client.ts`).
- **`processInbox` recibe TODO inyectado** (reader, dedup, extractPdf, analyzeAndSave) → testeable sin red/LLM/DB. La ruta hace el wiring real.
- Reusar sin reescribir: `assembleCorpus`/`extractPdfText`, `analyzeOpportunity`+`generateWithOpenRouter`, match de financiador (`listFunders`/`matchFunder`/`formatFunderBlock`), `addOpportunityAction`.
- Tests de DB con `describe.skipIf(!process.env.DATABASE_URL)`; correr individual con `DATABASE_URL` exportada (`pnpm test <archivo>`, SIN `--`).
- Mantener verde la suite (134 tests) y `pnpm typecheck` limpio en cada tarea.

## Prerequisitos (no es código — para verificación en vivo, NO bloquean el desarrollo)

Las credenciales de Gmail (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN`) y `CRON_SECRET` se necesitan solo para correr el job contra Gmail real
y para el deploy del cron. Todo el código + los tests (parse puro, dedup integración, job con
reader mockeado) se desarrollan y verifican SIN esas credenciales. Anotadas en
`docs/apis-y-credenciales.md`.

---

### Task 1: Tabla `processed_emails` + migración

**Files:**
- Modify: `lib/db/schema.ts`
- Create (generado): `drizzle/*.sql`

**Interfaces:**
- Produces: tabla `processedEmails`; tipos `ProcessedEmailRow`, `NewProcessedEmailRow`.

- [ ] **Step 1: Agregar la tabla a `lib/db/schema.ts`** (al final)

```ts
export const processedEmails = pgTable('processed_emails', {
  messageId: text('message_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').$type<'ok' | 'failed'>().notNull(),
  error: text('error'),
  opportunityId: text('opportunity_id'),
})

export type ProcessedEmailRow = typeof processedEmails.$inferSelect
export type NewProcessedEmailRow = typeof processedEmails.$inferInsert
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Generar la migración**

Run: `pnpm db:generate`
Expected: nuevo `drizzle/*.sql` con `CREATE TABLE "processed_emails"`.

- [ ] **Step 4: Aplicar a Supabase**

Run: `pnpm db:push`
Expected: "Changes applied".

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): tabla processed_emails (dedup de correos)"
```

---

### Task 2: Queries de `processed_emails`

**Files:**
- Create: `lib/db/processed-emails.ts`
- Test: `lib/db/processed-emails.test.ts`

**Interfaces:**
- Consumes: `db`, `processedEmails`, `NewProcessedEmailRow` (de `@/lib/db/*`).
- Produces: `listProcessedIds(): Promise<Set<string>>`; `recordProcessed(row: NewProcessedEmailRow): Promise<void>`.

> Integración: `describe.skipIf(!process.env.DATABASE_URL)`; limpia en `beforeEach`.

- [ ] **Step 1: Escribir el test**

```ts
// lib/db/processed-emails.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { processedEmails } from './schema'
import { listProcessedIds, recordProcessed } from './processed-emails'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('processed-emails (integración)', () => {
  beforeEach(async () => { await db.delete(processedEmails) })

  it('record + list deduplica por message_id', async () => {
    await recordProcessed({ messageId: 'm1', status: 'ok', opportunityId: 'op1' })
    await recordProcessed({ messageId: 'm2', status: 'failed', error: 'boom' })
    const ids = await listProcessedIds()
    expect(ids.has('m1')).toBe(true)
    expect(ids.has('m2')).toBe(true)
    expect(ids.size).toBe(2)
  })

  it('recordProcessed sobre un id existente no rompe (onConflictDoNothing)', async () => {
    await recordProcessed({ messageId: 'm1', status: 'ok' })
    await recordProcessed({ messageId: 'm1', status: 'ok' })
    expect((await listProcessedIds()).size).toBe(1)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/processed-emails.test.ts`
Expected: FAIL ("listProcessedIds is not a function").

- [ ] **Step 3: Implementar `lib/db/processed-emails.ts`**

```ts
import { db } from './client'
import { processedEmails, type NewProcessedEmailRow } from './schema'

export async function listProcessedIds(): Promise<Set<string>> {
  const rows = await db.select({ id: processedEmails.messageId }).from(processedEmails)
  return new Set(rows.map((r) => r.id))
}

export async function recordProcessed(row: NewProcessedEmailRow): Promise<void> {
  await db.insert(processedEmails).values(row)
    .onConflictDoNothing({ target: processedEmails.messageId })
}
```

- [ ] **Step 4: Run → pass**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/processed-emails.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add lib/db/processed-emails.ts lib/db/processed-emails.test.ts
git commit -m "feat(db): queries listProcessedIds/recordProcessed"
```

---

### Task 3: Tipos Gmail + parseo de correo a corpus (puro)

**Files:**
- Create: `lib/gmail/types.ts`
- Create: `lib/gmail/parse.ts`
- Test: `lib/gmail/parse.test.ts`

**Interfaces:**
- Consumes: `CorpusInput` (de `@/lib/ingest/corpus`).
- Produces:
  - `lib/gmail/types.ts`: `GmailAttachment { filename: string; mimeType: string; data: Uint8Array }`; `GmailMessage { id: string; from: string; subject: string; body: string; attachments: GmailAttachment[] }`; `GmailReader { listMessageIds(opts?: { max?: number }): Promise<string[]>; getMessage(id: string): Promise<GmailMessage> }`.
  - `lib/gmail/parse.ts`: `messageToCorpusInputs(msg: GmailMessage, extractPdf: (bytes: Uint8Array) => Promise<string>): Promise<{ inputs: CorpusInput[]; notes: string[] }>`.

- [ ] **Step 1: Crear `lib/gmail/types.ts`**

```ts
export interface GmailAttachment {
  filename: string
  mimeType: string
  data: Uint8Array
}

export interface GmailMessage {
  id: string
  from: string
  subject: string
  body: string
  attachments: GmailAttachment[]
}

export interface GmailReader {
  listMessageIds(opts?: { max?: number }): Promise<string[]>
  getMessage(id: string): Promise<GmailMessage>
}
```

- [ ] **Step 2: Escribir el test de parse**

```ts
// lib/gmail/parse.test.ts
import { describe, it, expect } from 'vitest'
import { messageToCorpusInputs } from './parse'
import type { GmailMessage } from './types'

const extractPdf = async (bytes: Uint8Array) => (bytes.length > 0 ? 'TEXTO DEL PDF' : '')

function msg(over: Partial<GmailMessage> = {}): GmailMessage {
  return { id: 'm1', from: 'fao@un.org', subject: 'Convocatoria X', body: 'Cuerpo del correo', attachments: [], ...over }
}

describe('messageToCorpusInputs', () => {
  it('arma un input con el cuerpo + encabezado de remitente/asunto', async () => {
    const { inputs } = await messageToCorpusInputs(msg(), extractPdf)
    expect(inputs).toHaveLength(1)
    expect(inputs[0].body).toContain('fao@un.org')
    expect(inputs[0].body).toContain('Convocatoria X')
    expect(inputs[0].body).toContain('Cuerpo del correo')
  })

  it('extrae el texto de un adjunto PDF', async () => {
    const { inputs } = await messageToCorpusInputs(
      msg({ attachments: [{ filename: 'terminos.pdf', mimeType: 'application/pdf', data: new Uint8Array([1]) }] }),
      extractPdf,
    )
    expect(inputs.some((i) => i.body.includes('TEXTO DEL PDF'))).toBe(true)
  })

  it('omite adjuntos no-PDF con nota', async () => {
    const { inputs, notes } = await messageToCorpusInputs(
      msg({ body: '', attachments: [{ filename: 'foto.png', mimeType: 'image/png', data: new Uint8Array([1]) }] }),
      extractPdf,
    )
    expect(inputs).toHaveLength(0)
    expect(notes.join(' ')).toMatch(/no es PDF/i)
  })

  it('correo vacío → sin inputs + nota', async () => {
    const { inputs, notes } = await messageToCorpusInputs(msg({ body: '   ' }), extractPdf)
    expect(inputs).toHaveLength(0)
    expect(notes.join(' ')).toMatch(/no traía texto/i)
  })
})
```

- [ ] **Step 3: Run → fail**

Run: `pnpm test lib/gmail/parse.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 4: Implementar `lib/gmail/parse.ts`**

```ts
import type { CorpusInput } from '@/lib/ingest/corpus'
import type { GmailMessage } from './types'

function isPdf(filename: string, mimeType: string): boolean {
  return mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
}

export async function messageToCorpusInputs(
  msg: GmailMessage,
  extractPdf: (bytes: Uint8Array) => Promise<string>,
): Promise<{ inputs: CorpusInput[]; notes: string[] }> {
  const inputs: CorpusInput[] = []
  const notes: string[] = []

  const body = msg.body.trim()
  if (body.length > 0) {
    const header = `Correo reenviado — De: ${msg.from} · Asunto: ${msg.subject}`
    inputs.push({ type: 'upload', name: msg.subject || 'Correo', url: null, body: `${header}\n\n${body}` })
  }

  for (const att of msg.attachments) {
    if (!isPdf(att.filename, att.mimeType)) {
      notes.push(`Adjunto omitido (no es PDF): ${att.filename}.`)
      continue
    }
    const text = await extractPdf(att.data)
    if (text.trim().length > 0) {
      inputs.push({ type: 'pdf', name: att.filename, url: null, body: text })
    } else {
      notes.push(`No pude extraer texto del adjunto ${att.filename} (¿PDF escaneado?).`)
    }
  }

  if (inputs.length === 0) notes.push('El correo no traía texto ni PDF legible.')
  return { inputs, notes }
}
```

- [ ] **Step 5: Run → pass + typecheck**

Run: `pnpm test lib/gmail/parse.test.ts` → PASS (4).
Run: `pnpm typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/gmail/types.ts lib/gmail/parse.ts lib/gmail/parse.test.ts
git commit -m "feat(gmail): tipos + parseo de correo (cuerpo+PDF) a corpus"
```

---

### Task 4: Cliente Gmail (`googleapis`, lazy)

**Files:**
- Create: `lib/gmail/client.ts`
- Modify: `package.json` (dep `googleapis`)
- Test: `lib/gmail/client.test.ts`

**Interfaces:**
- Consumes: `GmailReader`, `GmailMessage`, `GmailAttachment` (de `./types`).
- Produces: `createGmailReader(): GmailReader`.

- [ ] **Step 1: Instalar `googleapis`**

Run: `pnpm add googleapis`

- [ ] **Step 2: Escribir el test (import-safe / lazy)**

```ts
// lib/gmail/client.test.ts
import { describe, it, expect } from 'vitest'

describe('gmail client', () => {
  it('importar el módulo no lanza aunque falten credenciales', async () => {
    const mod = await import('./client')
    expect(typeof mod.createGmailReader).toBe('function')
  })
})
```

- [ ] **Step 3: Run → (módulo no existe aún)**

Run: `pnpm test lib/gmail/client.test.ts`
Expected: FAIL (no module './client').

- [ ] **Step 4: Implementar `lib/gmail/client.ts`**

```ts
import { google, type gmail_v1 } from 'googleapis'
import type { GmailReader, GmailMessage, GmailAttachment } from './types'

let cached: GmailReader | null = null

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

interface AttachmentRef { filename: string; mimeType: string; attachmentId: string }

function walk(part: gmail_v1.Schema$MessagePart | undefined, bodyParts: string[], atts: AttachmentRef[]): void {
  if (!part) return
  if (part.parts && part.parts.length > 0) {
    for (const p of part.parts) walk(p, bodyParts, atts)
    return
  }
  if (part.mimeType === 'text/plain' && part.body?.data) {
    bodyParts.push(Buffer.from(part.body.data, 'base64url').toString('utf8'))
  } else if (part.filename && part.body?.attachmentId) {
    atts.push({ filename: part.filename, mimeType: part.mimeType ?? '', attachmentId: part.body.attachmentId })
  }
}

export function createGmailReader(): GmailReader {
  if (cached) return cached
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Faltan GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GMAIL_REFRESH_TOKEN (revisá las env).')
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  const gmail = google.gmail({ version: 'v1', auth })

  cached = {
    async listMessageIds(opts) {
      const res = await gmail.users.messages.list({ userId: 'me', q: 'in:inbox', maxResults: opts?.max ?? 25 })
      return (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id)
    },
    async getMessage(id): Promise<GmailMessage> {
      const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      const payload = res.data.payload
      const headers = payload?.headers
      const bodyParts: string[] = []
      const refs: AttachmentRef[] = []
      walk(payload, bodyParts, refs)
      const attachments: GmailAttachment[] = []
      for (const ref of refs) {
        const att = await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: ref.attachmentId })
        const data = att.data.data ? new Uint8Array(Buffer.from(att.data.data, 'base64url')) : new Uint8Array()
        attachments.push({ filename: ref.filename, mimeType: ref.mimeType, data })
      }
      return {
        id,
        from: headerValue(headers, 'From'),
        subject: headerValue(headers, 'Subject'),
        body: bodyParts.join('\n').trim(),
        attachments,
      }
    },
  }
  return cached
}
```

- [ ] **Step 5: Run → pass + typecheck**

Run: `pnpm test lib/gmail/client.test.ts` → PASS (1).
Run: `pnpm typecheck` → PASS.
(El llamado real a Gmail se verifica en runtime/staging con credenciales, no en tests.)

- [ ] **Step 6: Commit**

```bash
git add lib/gmail/client.ts lib/gmail/client.test.ts package.json pnpm-lock.yaml
git commit -m "feat(gmail): cliente googleapis lazy (OAuth readonly) que implementa GmailReader"
```

---

### Task 5: Orquestación `processInbox`

**Files:**
- Create: `lib/gmail/process.ts`
- Test: `lib/gmail/process.test.ts`

**Interfaces:**
- Consumes: `assembleCorpus` (`@/lib/ingest/corpus`), `INGEST_MAX_CHARS_PER_DOC`/`INGEST_TOTAL_BUDGET` (`@/lib/ingest/config`), `messageToCorpusInputs` (`./parse`), `GmailReader` (`./types`).
- Produces: `processInbox(deps: ProcessDeps): Promise<ProcessSummary>` con
  ```ts
  interface ProcessDeps {
    reader: GmailReader
    alreadyProcessed: () => Promise<Set<string>>
    record: (row: { messageId: string; status: 'ok' | 'failed'; error?: string | null; opportunityId?: string | null }) => Promise<void>
    extractPdf: (bytes: Uint8Array) => Promise<string>
    analyzeAndSave: (corpusText: string) => Promise<string>
    max?: number
  }
  interface ProcessSummary { processed: number; skipped: number; failed: number }
  ```

- [ ] **Step 1: Escribir el test**

```ts
// lib/gmail/process.test.ts
import { describe, it, expect } from 'vitest'
import { processInbox } from './process'
import type { GmailReader, GmailMessage } from './types'

const extractPdf = async () => ''

function readerOf(msgs: Record<string, GmailMessage>): GmailReader {
  return {
    async listMessageIds() { return Object.keys(msgs) },
    async getMessage(id) { return msgs[id] },
  }
}
const baseMsg = (id: string, over: Partial<GmailMessage> = {}): GmailMessage =>
  ({ id, from: 'x@y.org', subject: `S${id}`, body: `cuerpo ${id}`, attachments: [], ...over })

it('procesa nuevos, saltea ya-procesados y registra opportunity_id', async () => {
  const recorded: any[] = []
  const summary = await processInbox({
    reader: readerOf({ a: baseMsg('a'), b: baseMsg('b') }),
    alreadyProcessed: async () => new Set(['b']),
    record: async (r) => { recorded.push(r) },
    extractPdf,
    analyzeAndSave: async () => 'op-1',
  })
  expect(summary).toEqual({ processed: 1, skipped: 1, failed: 0 })
  expect(recorded).toEqual([{ messageId: 'a', status: 'ok', opportunityId: 'op-1' }])
})

it('un correo que falla se registra failed sin frenar el lote', async () => {
  const recorded: any[] = []
  let calls = 0
  const summary = await processInbox({
    reader: readerOf({ a: baseMsg('a'), b: baseMsg('b') }),
    alreadyProcessed: async () => new Set(),
    record: async (r) => { recorded.push(r) },
    extractPdf,
    analyzeAndSave: async () => { calls++; if (calls === 1) throw new Error('boom'); return 'op-2' },
  })
  expect(summary.processed).toBe(1)
  expect(summary.failed).toBe(1)
  expect(recorded.find((r) => r.status === 'failed')?.error).toBe('boom')
})

it('correo sin contenido se registra ok sin oportunidad y no llama analyzeAndSave', async () => {
  const recorded: any[] = []
  let analyzed = 0
  const summary = await processInbox({
    reader: readerOf({ a: baseMsg('a', { body: '   ' }) }),
    alreadyProcessed: async () => new Set(),
    record: async (r) => { recorded.push(r) },
    extractPdf,
    analyzeAndSave: async () => { analyzed++; return 'op' },
  })
  expect(analyzed).toBe(0)
  expect(summary.processed).toBe(1)
  expect(recorded[0]).toEqual({ messageId: 'a', status: 'ok', opportunityId: null })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/gmail/process.test.ts`
Expected: FAIL ("processInbox is not a function").

- [ ] **Step 3: Implementar `lib/gmail/process.ts`**

```ts
import { assembleCorpus } from '@/lib/ingest/corpus'
import { INGEST_MAX_CHARS_PER_DOC, INGEST_TOTAL_BUDGET } from '@/lib/ingest/config'
import { messageToCorpusInputs } from './parse'
import type { GmailReader } from './types'

export interface ProcessDeps {
  reader: GmailReader
  alreadyProcessed: () => Promise<Set<string>>
  record: (row: { messageId: string; status: 'ok' | 'failed'; error?: string | null; opportunityId?: string | null }) => Promise<void>
  extractPdf: (bytes: Uint8Array) => Promise<string>
  analyzeAndSave: (corpusText: string) => Promise<string>
  max?: number
}

export interface ProcessSummary { processed: number; skipped: number; failed: number }

export async function processInbox(deps: ProcessDeps): Promise<ProcessSummary> {
  const ids = await deps.reader.listMessageIds({ max: deps.max ?? 25 })
  const seen = await deps.alreadyProcessed()
  const summary: ProcessSummary = { processed: 0, skipped: 0, failed: 0 }

  for (const id of ids) {
    if (seen.has(id)) { summary.skipped += 1; continue }
    try {
      const msg = await deps.reader.getMessage(id)
      const { inputs } = await messageToCorpusInputs(msg, deps.extractPdf)
      if (inputs.length === 0) {
        await deps.record({ messageId: id, status: 'ok', opportunityId: null })
        summary.processed += 1
        continue
      }
      const { text } = assembleCorpus(inputs, { maxCharsPerDoc: INGEST_MAX_CHARS_PER_DOC, totalBudget: INGEST_TOTAL_BUDGET })
      const opportunityId = await deps.analyzeAndSave(text)
      await deps.record({ messageId: id, status: 'ok', opportunityId })
      summary.processed += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error desconocido'
      await deps.record({ messageId: id, status: 'failed', error: message })
      summary.failed += 1
    }
  }
  return summary
}
```

- [ ] **Step 4: Run → pass + typecheck**

Run: `pnpm test lib/gmail/process.test.ts` → PASS (3).
Run: `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gmail/process.ts lib/gmail/process.test.ts
git commit -m "feat(gmail): processInbox (dedup + corpus + analyze/save inyectados)"
```

---

### Task 6: Endpoint de cron + config Vercel + env

**Files:**
- Create: `app/api/cron/gmail/route.ts`
- Create: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `processInbox` (`@/lib/gmail/process`), `createGmailReader` (`@/lib/gmail/client`), `listProcessedIds`/`recordProcessed` (`@/lib/db/processed-emails`), `extractPdfText` (`@/lib/ingest/pdf`), `analyzeOpportunity` (`@/lib/agent/analyze`), `generateWithOpenRouter` (`@/lib/agent/llm`), `listFunders`/`rowToProfile` (`@/lib/db/funders`), `matchFunder`/`formatFunderBlock` (`@/lib/agent/funder-match`), `addOpportunityAction` (`@/lib/db/actions`).

- [ ] **Step 1: Crear `app/api/cron/gmail/route.ts`**

```ts
import { processInbox } from '@/lib/gmail/process'
import { createGmailReader } from '@/lib/gmail/client'
import { listProcessedIds, recordProcessed } from '@/lib/db/processed-emails'
import { extractPdfText } from '@/lib/ingest/pdf'
import { analyzeOpportunity } from '@/lib/agent/analyze'
import { generateWithOpenRouter } from '@/lib/agent/llm'
import { listFunders, rowToProfile } from '@/lib/db/funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { addOpportunityAction } from '@/lib/db/actions'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function analyzeAndSave(text: string): Promise<string> {
  let funderBlock = formatFunderBlock(null)
  try {
    const rows = await listFunders()
    funderBlock = formatFunderBlock(matchFunder(text, rows.map(rowToProfile)))
  } catch {
    // sin financiadores → bloque genérico
  }
  const analysis = await analyzeOpportunity(text, { generate: generateWithOpenRouter }, { funderBlock })
  await addOpportunityAction(analysis)
  return analysis.opportunity_id
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const summary = await processInbox({
      reader: createGmailReader(),
      alreadyProcessed: listProcessedIds,
      record: recordProcessed,
      extractPdf: extractPdfText,
      analyzeAndSave,
    })
    return Response.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error'
    return Response.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Crear `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/gmail", "schedule": "*/30 * * * *" }
  ]
}
```
> Nota: Vercel Cron solo corre en deploys de producción; en plan Hobby el mínimo es 1×/día — el intervalo `*/30` requiere plan Pro. Anotar en `docs/apis-y-credenciales.md` si hace falta.

- [ ] **Step 3: Documentar env en `.env.example`**

Agregar al final:
```bash
# Gmail connector (correo reenviado §8). Valores reales solo en .env.local / Vercel.
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
# Protege el endpoint de cron (lo generás vos, p. ej. openssl rand -hex 32).
CRON_SECRET=
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: compila; `/api/cron/gmail` aparece como ƒ (dynamic) en la tabla de rutas. (No requiere credenciales de Gmail en build — el cliente es lazy.)

- [ ] **Step 6: Suite completa**

Run: `pnpm test` (sin DATABASE_URL) → unit verdes, integración skip.

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/gmail/route.ts vercel.json .env.example
git commit -m "feat(api): cron /api/cron/gmail (auth CRON_SECRET) + vercel cron + env"
```

---

## Self-Review

**Spec coverage:**
- Auth Gmail API OAuth readonly (lazy client) → Task 4. ✅
- Trigger Vercel Cron polling + endpoint protegido CRON_SECRET → Task 6. ✅
- Dedup `processed_emails` por message_id → Tasks 1, 2, 5. ✅
- Parseo cuerpo + adjuntos PDF a corpus; no-PDF omitido; binario no retenido → Task 3. ✅
- Un correo = una oportunidad; reusa análisis + match financiador + addOpportunityAction → Tasks 5 (orquestación) + 6 (wiring `analyzeAndSave`). ✅
- Degradación: Gmail falla → 500 sin romper estado; correo puntual falla → registra failed y sigue; correo vacío → ok sin oportunidad → Task 5. ✅
- Sin envíos automáticos (readonly, solo lectura+registro) → Tasks 4/6. ✅
- Testing: parse puro (3), dedup integración (2), processInbox con fakes (5), client import-safe (4) → cubiertos.
- Env nuevas documentadas → Task 6 + `docs/apis-y-credenciales.md` (ya commiteado en el spec).

**Placeholder scan:** sin TBD/TODO; cada step con código real o comando + salida esperada.

**Type consistency:** `GmailReader`/`GmailMessage`/`GmailAttachment` (Task 3 types) usados por client (4), parse (3), process (5). `messageToCorpusInputs(msg, extractPdf)` firma consistente (3, 5). `ProcessDeps`/`processInbox` (5) consumido por la ruta (6) con exactamente esas keys (reader, alreadyProcessed, record, extractPdf, analyzeAndSave). `recordProcessed(NewProcessedEmailRow)` (2) compatible con el `record` de ProcessDeps (messageId/status/error?/opportunityId?). `analyzeAndSave(text): Promise<string>` devuelve `analysis.opportunity_id` y se pasa a `record({opportunityId})`.
