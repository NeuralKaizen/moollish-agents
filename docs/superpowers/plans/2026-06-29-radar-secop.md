# Radar §7 (SECOP / Datos Abiertos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descubrir oportunidades de SECOP/Datos Abiertos por cron, pre-filtrarlas (Anexo D), deduplicarlas y registrarlas como "Detectada" livianas, con una vista `/radar` para promoverlas (→ análisis → pipeline) o descartarlas.

**Architecture:** Tabla separada `detected_opportunities`. Descubrimiento puro y por capas: cliente Socrata inyectable (`secop.ts`), normalización pura (`secop-normalize.ts`), pre-filtro puro (`anexo-d.ts`), orquestación con deps inyectados (`discover.ts`). Un endpoint de cron protegido lo dispara. Promover usa `promoteDetected` (deps inyectados) que corre el análisis existente + match de financiador y crea una `opportunities`.

**Tech Stack:** Next.js 16 (API route + Vercel Cron), Drizzle + Supabase Postgres, AI SDK + OpenRouter, Vitest.

## Global Constraints

- **Producto, no demo** (memoria `building-product-not-demo`): robustez, degradación elegante.
- **"Detectada" liviana**: el radar NO corre el LLM por hallazgo; solo registra metadatos. El análisis completo ocurre al **promover**.
- **Tabla separada** `detected_opportunities` (no se toca el pipeline/dashboard actuales).
- **Dedup**: el `id` de la fila ES la dedup-key (`secop:<sourceRef>`); `recordDetected` usa `onConflictDoNothing` sobre `id`. (Refinamiento del spec: no se agrega una columna `dedup_key` separada; el `id` la cumple.)
- **Fuente: SECOP II en `datos.gov.co`** vía API Socrata pública. Dataset por env `DATOS_GOV_DATASET` (default `p6dx-8zbt`). Token opcional `DATOS_GOV_APP_TOKEN` (header `X-App-Token`). Sin auth obligatoria.
- **Nombres de campos SECOP inciertos**: `normalizeSecopRow` usa **claves candidatas con fallback** y devuelve `null` si faltan id/título. La confirmación contra el dataset real es runtime (como el cliente Gmail) — ajustar la lista de candidatos si hace falta.
- **Pre-filtro Anexo D** (`passesPrefilter`) es el filtro autoritativo (client-side); la query Socrata solo reduce volumen.
- **Cron protegido por `CRON_SECRET`** fail-closed (igual que `/api/cron/gmail`).
- **Inyección de deps** en `discover.ts` y `promote.ts` → testeables con fakes (sin red/LLM/DB).
- Reusar sin reescribir: `analyzeOpportunity`+`generateWithOpenRouter`, match financiador (`listFunders`/`rowToProfile`/`matchFunder`/`formatFunderBlock`), `addOpportunityAction`.
- `pnpm db:push` se cuelga en el pooler Supabase: aplicar la migración vía cliente `postgres` directo y verificar (workaround usado en features previas). La conexión normal (tests) anda bien.
- Tests de DB con `describe.skipIf(!process.env.DATABASE_URL)`; correr individual con `DATABASE_URL` exportada (`pnpm test <archivo>`, SIN `--`).
- Mantener verde la suite (142 tests) y `pnpm typecheck` limpio.

## Prerequisitos (no bloquean el desarrollo)
La API SECOP es pública: discover/normalize/prefilter y el cron se desarrollan y testean sin
credenciales. `DATOS_GOV_APP_TOKEN` es opcional (rate-limits). `CRON_SECRET` solo para correr el
endpoint protegido en vivo. Anotado en `docs/apis-y-credenciales.md`.

---

### Task 1: Tabla `detected_opportunities` + migración

**Files:**
- Modify: `lib/db/schema.ts`
- Create (generado): `drizzle/*.sql`

**Interfaces:**
- Produces: tabla `detectedOpportunities`; tipos `DetectedRow`, `NewDetectedRow`.

- [ ] **Step 1: Agregar la tabla a `lib/db/schema.ts`** (al final)

```ts
export const detectedOpportunities = pgTable('detected_opportunities', {
  id: text('id').primaryKey(), // dedup key, ej. 'secop:<sourceRef>'
  source: text('source').notNull(),
  sourceRef: text('source_ref').notNull(),
  title: text('title').notNull(),
  funder: text('funder'),
  amount: text('amount'),
  currency: text('currency'),
  deadline: text('deadline'),
  url: text('url'),
  themes: text('themes'),
  status: text('status').$type<'detectada' | 'promovida' | 'descartada'>().notNull(),
  opportunityId: text('opportunity_id'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DetectedRow = typeof detectedOpportunities.$inferSelect
export type NewDetectedRow = typeof detectedOpportunities.$inferInsert
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Generar la migración**

Run: `pnpm db:generate`
Expected: nuevo `drizzle/*.sql` con `CREATE TABLE "detected_opportunities"`.

- [ ] **Step 4: Aplicar a Supabase**

Run: `pnpm db:push`.
Expected: "Changes applied". **Si se cuelga** en "Pulling schema" (pooler), cancelar y aplicar la migración directo: ejecutar el SQL del archivo generado vía un script tsx con el cliente `postgres` (mismo patrón que se usó para `processed_emails`), y verificar con `information_schema.columns` que la tabla tiene las 12 columnas. Documentar en el report cuál vía se usó.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): tabla detected_opportunities (radar §7)"
```

---

### Task 2: Queries de `detected_opportunities`

**Files:**
- Create: `lib/db/detected.ts`
- Test: `lib/db/detected.test.ts`

**Interfaces:**
- Consumes: `db`, `detectedOpportunities`, `DetectedRow`, `NewDetectedRow` (de `@/lib/db/*`).
- Produces:
  - `recordDetected(row: NewDetectedRow): Promise<void>` (insert `onConflictDoNothing` target id)
  - `listDetected(): Promise<DetectedRow[]>` (orden `detectedAt` desc)
  - `getDetected(id: string): Promise<DetectedRow | undefined>`
  - `markDetected(id: string, status: 'detectada' | 'promovida' | 'descartada', opportunityId?: string): Promise<void>`

> Integración: `describe.skipIf(!process.env.DATABASE_URL)`; limpia en `beforeEach`.

- [ ] **Step 1: Escribir el test**

```ts
// lib/db/detected.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { detectedOpportunities } from './schema'
import { recordDetected, listDetected, getDetected, markDetected } from './detected'

const hasDb = !!process.env.DATABASE_URL
const row = { id: 'secop:1', source: 'secop', sourceRef: '1', title: 'Riego rural', status: 'detectada' as const }

describe.skipIf(!hasDb)('detected queries (integración)', () => {
  beforeEach(async () => { await db.delete(detectedOpportunities) })

  it('recordDetected inserta y deduplica por id', async () => {
    await recordDetected(row)
    await recordDetected({ ...row, title: 'OTRO' }) // mismo id → no-op
    const list = await listDetected()
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Riego rural')
  })

  it('getDetected + markDetected (promovida con opportunityId)', async () => {
    await recordDetected(row)
    await markDetected('secop:1', 'promovida', 'op-9')
    const d = await getDetected('secop:1')
    expect(d?.status).toBe('promovida')
    expect(d?.opportunityId).toBe('op-9')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/detected.test.ts`
Expected: FAIL ("recordDetected is not a function").

- [ ] **Step 3: Implementar `lib/db/detected.ts`**

```ts
import { desc, eq } from 'drizzle-orm'
import { db } from './client'
import { detectedOpportunities, type DetectedRow, type NewDetectedRow } from './schema'

export async function recordDetected(row: NewDetectedRow): Promise<void> {
  await db.insert(detectedOpportunities).values(row)
    .onConflictDoNothing({ target: detectedOpportunities.id })
}

export async function listDetected(): Promise<DetectedRow[]> {
  return db.select().from(detectedOpportunities).orderBy(desc(detectedOpportunities.detectedAt))
}

export async function getDetected(id: string): Promise<DetectedRow | undefined> {
  const rows = await db.select().from(detectedOpportunities).where(eq(detectedOpportunities.id, id)).limit(1)
  return rows[0]
}

export async function markDetected(
  id: string, status: 'detectada' | 'promovida' | 'descartada', opportunityId?: string,
): Promise<void> {
  await db.update(detectedOpportunities)
    .set(opportunityId !== undefined ? { status, opportunityId } : { status })
    .where(eq(detectedOpportunities.id, id))
}
```

- [ ] **Step 4: Run → pass**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/detected.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add lib/db/detected.ts lib/db/detected.test.ts
git commit -m "feat(db): queries detected (record/list/get/mark)"
```

---

### Task 3: Pre-filtro Anexo D

**Files:**
- Create: `lib/radar/anexo-d.ts`
- Test: `lib/radar/anexo-d.test.ts`

**Interfaces:**
- Produces: `INCLUDE_KEYWORDS: string[]`, `EXCLUDE_KEYWORDS: string[]`, `passesPrefilter(text: string): boolean`, `matchedKeywords(text: string): string[]`.

- [ ] **Step 1: Escribir el test**

```ts
// lib/radar/anexo-d.test.ts
import { describe, it, expect } from 'vitest'
import { passesPrefilter, matchedKeywords } from './anexo-d'

describe('anexo-d prefilter', () => {
  it('incluye textos con keywords del Anexo D', () => {
    expect(passesPrefilter('Servicio de monitoreo agrícola y riego rural')).toBe(true)
    expect(passesPrefilter('Mejoramiento de ganadería sostenible')).toBe(true)
  })
  it('excluye textos sin keywords relevantes', () => {
    expect(passesPrefilter('Pavimentación de vía urbana y andenes')).toBe(false)
    expect(passesPrefilter('Compra de mobiliario de oficina')).toBe(false)
  })
  it('excluye aunque tenga keyword si hay término excluido dominante', () => {
    expect(passesPrefilter('Construcción de obra civil de acueducto')).toBe(false)
  })
  it('matchedKeywords devuelve las keywords presentes', () => {
    expect(matchedKeywords('riego y agricultura de precisión')).toEqual(expect.arrayContaining(['agricultura']))
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/radar/anexo-d.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar `lib/radar/anexo-d.ts`**

```ts
// Palabras clave del Anexo D (familias de oportunidad de Moollish). En minúsculas.
export const INCLUDE_KEYWORDS = [
  'agricultura', 'agrícola', 'agro', 'agropecuari', 'rural', 'ganaderí', 'ganader',
  'clima', 'climátic', 'ambiental', 'ambiente', 'biodiversidad', 'restauración',
  'riego', 'seguridad alimentaria', 'monitoreo ambiental', 'reforestación',
  'tecnología agropecuaria', 'inteligencia artificial', 'satelital', 'precisión',
]
export const EXCLUDE_KEYWORDS = [
  'obra civil', 'pavimentación', 'pavimento', 'construcción de vía', 'andenes',
  'mobiliario', 'papelería', 'vigilancia', 'aseo y cafetería',
]

export function passesPrefilter(text: string): boolean {
  const t = text.toLowerCase()
  if (EXCLUDE_KEYWORDS.some((k) => t.includes(k))) return false
  return INCLUDE_KEYWORDS.some((k) => t.includes(k))
}

export function matchedKeywords(text: string): string[] {
  const t = text.toLowerCase()
  return INCLUDE_KEYWORDS.filter((k) => t.includes(k))
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test lib/radar/anexo-d.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add lib/radar/anexo-d.ts lib/radar/anexo-d.test.ts
git commit -m "feat(radar): pre-filtro por keywords del Anexo D"
```

---

### Task 4: Tipos + normalización de filas SECOP

**Files:**
- Create: `lib/radar/types.ts`
- Create: `lib/radar/secop-normalize.ts`
- Test: `lib/radar/secop-normalize.test.ts`

**Interfaces:**
- Produces:
  - `lib/radar/types.ts`: `interface DetectedOpportunity { source: string; sourceRef: string; dedupKey: string; title: string; funder: string | null; amount: string | null; currency: string | null; deadline: string | null; url: string | null; themes: string | null }`
  - `lib/radar/secop-normalize.ts`: `normalizeSecopRow(row: Record<string, unknown>): DetectedOpportunity | null`.

- [ ] **Step 1: Crear `lib/radar/types.ts`**

```ts
export interface DetectedOpportunity {
  source: string
  sourceRef: string
  dedupKey: string
  title: string
  funder: string | null
  amount: string | null
  currency: string | null
  deadline: string | null
  url: string | null
  themes: string | null
}
```

- [ ] **Step 2: Escribir el test**

```ts
// lib/radar/secop-normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSecopRow } from './secop-normalize'

const row = {
  id_del_proceso: 'CO1.123',
  descripci_n_del_procedimiento: 'Monitoreo ambiental y riego',
  entidad: 'CAR Cundinamarca',
  precio_base: '500000000',
  fecha_de_recepcion_de: '2026-09-30T00:00:00.000',
  urlproceso: 'https://comunidad.secop.gov.co/proceso/CO1.123',
}

describe('normalizeSecopRow', () => {
  it('mapea una fila SECOP a DetectedOpportunity con dedupKey', () => {
    const d = normalizeSecopRow(row)
    expect(d).not.toBeNull()
    expect(d!.sourceRef).toBe('CO1.123')
    expect(d!.dedupKey).toBe('secop:CO1.123')
    expect(d!.title).toContain('Monitoreo ambiental')
    expect(d!.funder).toBe('CAR Cundinamarca')
    expect(d!.amount).toBe('500000000')
    expect(d!.currency).toBe('COP')
    expect(d!.url).toContain('secop.gov.co')
  })
  it('devuelve null si falta id o título', () => {
    expect(normalizeSecopRow({ entidad: 'X' })).toBeNull()
    expect(normalizeSecopRow({ id_del_proceso: 'A' })).toBeNull()
  })
})
```

- [ ] **Step 3: Run → fail**

Run: `pnpm test lib/radar/secop-normalize.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 4: Implementar `lib/radar/secop-normalize.ts`**

```ts
import type { DetectedOpportunity } from './types'

// Los nombres de campo de SECOP II en datos.gov.co varían; probamos candidatos con fallback.
// Confirmar contra el dataset real en runtime y ajustar estas listas si hace falta.
function pick(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return null
}

export function normalizeSecopRow(row: Record<string, unknown>): DetectedOpportunity | null {
  const sourceRef = pick(row, ['id_del_proceso', 'referencia_del_proceso', 'id', 'numero_del_proceso'])
  const title = pick(row, ['descripci_n_del_procedimiento', 'nombre_del_procedimiento', 'objeto_del_contrato', 'objeto_a_contratar', 'objeto'])
  if (!sourceRef || !title) return null
  return {
    source: 'secop',
    sourceRef,
    dedupKey: `secop:${sourceRef}`,
    title,
    funder: pick(row, ['entidad', 'nombre_entidad', 'nombre_de_la_entidad']),
    amount: pick(row, ['precio_base', 'valor_total_adjudicacion', 'valor_del_contrato', 'cuant_a']),
    currency: 'COP',
    deadline: pick(row, ['fecha_de_recepcion_de', 'fecha_de_presentaci_n_de_oferta', 'fecha_de_publicacion_del']),
    url: pick(row, ['urlproceso', 'url_proceso', 'enlace', 'url']),
    themes: null,
  }
}
```

- [ ] **Step 5: Run → pass + typecheck**

Run: `pnpm test lib/radar/secop-normalize.test.ts` → PASS (2).
Run: `pnpm typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/radar/types.ts lib/radar/secop-normalize.ts lib/radar/secop-normalize.test.ts
git commit -m "feat(radar): tipos + normalización de filas SECOP (claves candidatas)"
```

---

### Task 5: Cliente SECOP + orquestación de descubrimiento

**Files:**
- Create: `lib/radar/secop.ts`
- Create: `lib/radar/discover.ts`
- Test: `lib/radar/secop.test.ts`
- Test: `lib/radar/discover.test.ts`

**Interfaces:**
- Consumes: `normalizeSecopRow` (`./secop-normalize`), `passesPrefilter`/`matchedKeywords` (`./anexo-d`), `NewDetectedRow` (`@/lib/db/schema`).
- Produces:
  - `lib/radar/secop.ts`: `buildSecopUrl(opts: { q?: string; limit?: number }): string`; `fetchSecopRows(q: string, deps?: { fetchImpl?: typeof fetch; appToken?: string }): Promise<Record<string, unknown>[]>`.
  - `lib/radar/discover.ts`: `discoverFromSecop(deps: DiscoverDeps): Promise<DiscoverSummary>` con
    `DiscoverDeps = { fetchRows: (q: string) => Promise<Record<string, unknown>[]>; recordDetected: (row: NewDetectedRow) => Promise<void>; queries?: string[] }` y
    `DiscoverSummary = { found: number; inserted: number; skipped: number }`.

- [ ] **Step 1: Escribir `lib/radar/secop.test.ts`**

```ts
// lib/radar/secop.test.ts
import { describe, it, expect } from 'vitest'
import { buildSecopUrl, fetchSecopRows } from './secop'

describe('secop client', () => {
  it('buildSecopUrl arma la URL con $q y $limit sobre el dataset', () => {
    const url = buildSecopUrl({ q: 'agricultura', limit: 10 })
    expect(url).toContain('/resource/')
    expect(url).toContain('.json')
    expect(url).toContain('%24q=agricultura')
    expect(url).toContain('%24limit=10')
  })
  it('fetchSecopRows usa el fetch inyectado y devuelve las filas', async () => {
    const fakeFetch = (async () => ({ ok: true, json: async () => [{ id_del_proceso: 'X' }] })) as unknown as typeof fetch
    const rows = await fetchSecopRows('agro', { fetchImpl: fakeFetch })
    expect(rows).toEqual([{ id_del_proceso: 'X' }])
  })
  it('fetchSecopRows lanza si la respuesta no es ok', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 429, json: async () => [] })) as unknown as typeof fetch
    await expect(fetchSecopRows('agro', { fetchImpl: fakeFetch })).rejects.toThrow(/429/)
  })
})
```

- [ ] **Step 2: Run → fail, implementar `lib/radar/secop.ts`**

Run: `pnpm test lib/radar/secop.test.ts` → FAIL.
```ts
const DATASET = process.env.DATOS_GOV_DATASET ?? 'p6dx-8zbt'
const BASE = `https://www.datos.gov.co/resource/${DATASET}.json`

export function buildSecopUrl(opts: { q?: string; limit?: number }): string {
  const params = new URLSearchParams()
  if (opts.q) params.set('$q', opts.q)
  params.set('$limit', String(opts.limit ?? 50))
  return `${BASE}?${params.toString()}`
}

export async function fetchSecopRows(
  q: string,
  deps: { fetchImpl?: typeof fetch; appToken?: string } = {},
): Promise<Record<string, unknown>[]> {
  const doFetch = deps.fetchImpl ?? fetch
  const headers: Record<string, string> = {}
  const token = deps.appToken ?? process.env.DATOS_GOV_APP_TOKEN
  if (token) headers['X-App-Token'] = token
  const res = await doFetch(buildSecopUrl({ q, limit: 50 }), { headers })
  if (!res.ok) throw new Error(`SECOP/Datos Abiertos respondió ${res.status}.`)
  return (await res.json()) as Record<string, unknown>[]
}
```
Run again → PASS (3).

- [ ] **Step 3: Escribir `lib/radar/discover.test.ts`**

```ts
// lib/radar/discover.test.ts
import { describe, it, expect } from 'vitest'
import { discoverFromSecop } from './discover'
import type { NewDetectedRow } from '@/lib/db/schema'

const good = { id_del_proceso: 'A', descripci_n_del_procedimiento: 'Riego agrícola rural', entidad: 'ADR' }
const offtopic = { id_del_proceso: 'B', descripci_n_del_procedimiento: 'Pavimentación de vías', entidad: 'Alcaldía' }
const malformed = { entidad: 'sin id ni titulo' }

it('inserta las que pasan el pre-filtro, saltea off-topic, malformadas y duplicadas', async () => {
  const recorded: NewDetectedRow[] = []
  const summary = await discoverFromSecop({
    fetchRows: async () => [good, offtopic, malformed, good],
    recordDetected: async (r) => { recorded.push(r) },
    queries: ['agro'],
  })
  expect(recorded).toHaveLength(1)
  expect(recorded[0].id).toBe('secop:A')
  expect(recorded[0].status).toBe('detectada')
  expect(recorded[0].themes).toContain('agrícola')
  expect(summary.inserted).toBe(1)
  expect(summary.skipped).toBeGreaterThanOrEqual(1)
})

it('una query que falla no frena el resto', async () => {
  let call = 0
  const recorded: NewDetectedRow[] = []
  await discoverFromSecop({
    fetchRows: async () => { call++; if (call === 1) throw new Error('boom'); return [good] },
    recordDetected: async (r) => { recorded.push(r) },
    queries: ['x', 'y'],
  })
  expect(recorded).toHaveLength(1)
})
```

- [ ] **Step 4: Run → fail, implementar `lib/radar/discover.ts`**

Run: `pnpm test lib/radar/discover.test.ts` → FAIL.
```ts
import { normalizeSecopRow } from './secop-normalize'
import { passesPrefilter, matchedKeywords } from './anexo-d'
import type { NewDetectedRow } from '@/lib/db/schema'

export interface DiscoverDeps {
  fetchRows: (q: string) => Promise<Record<string, unknown>[]>
  recordDetected: (row: NewDetectedRow) => Promise<void>
  queries?: string[]
}
export interface DiscoverSummary { found: number; inserted: number; skipped: number }

export async function discoverFromSecop(deps: DiscoverDeps): Promise<DiscoverSummary> {
  const queries = deps.queries ?? ['agricultura', 'ganadería', 'ambiental']
  const summary: DiscoverSummary = { found: 0, inserted: 0, skipped: 0 }
  const seen = new Set<string>()

  for (const q of queries) {
    let rows: Record<string, unknown>[]
    try { rows = await deps.fetchRows(q) } catch { continue }
    for (const raw of rows) {
      try {
        const d = normalizeSecopRow(raw)
        if (!d) { summary.skipped += 1; continue }
        summary.found += 1
        const hay = `${d.title} ${d.funder ?? ''}`
        if (!passesPrefilter(hay)) { summary.skipped += 1; continue }
        if (seen.has(d.dedupKey)) { summary.skipped += 1; continue }
        seen.add(d.dedupKey)
        await deps.recordDetected({
          id: d.dedupKey, source: d.source, sourceRef: d.sourceRef, title: d.title,
          funder: d.funder, amount: d.amount, currency: d.currency, deadline: d.deadline,
          url: d.url, themes: matchedKeywords(hay).join(', '), status: 'detectada',
        })
        summary.inserted += 1
      } catch { summary.skipped += 1 }
    }
  }
  return summary
}
```
Run again → PASS (2).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/radar/secop.ts lib/radar/secop.test.ts lib/radar/discover.ts lib/radar/discover.test.ts
git commit -m "feat(radar): cliente SECOP (Socrata) + discoverFromSecop (prefiltro+dedup)"
```

---

### Task 6: Endpoint de cron `/api/cron/radar` + vercel.json

**Files:**
- Create: `app/api/cron/radar/route.ts`
- Modify: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `discoverFromSecop` (`@/lib/radar/discover`), `fetchSecopRows` (`@/lib/radar/secop`), `recordDetected` (`@/lib/db/detected`).

- [ ] **Step 1: Crear `app/api/cron/radar/route.ts`**

```ts
import { discoverFromSecop } from '@/lib/radar/discover'
import { fetchSecopRows } from '@/lib/radar/secop'
import { recordDetected } from '@/lib/db/detected'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const summary = await discoverFromSecop({
      fetchRows: (q) => fetchSecopRows(q),
      recordDetected,
    })
    return Response.json(summary)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Agregar el cron a `vercel.json`**

El archivo ya tiene un `crons` (gmail). Añadir la entrada del radar:
```json
{
  "crons": [
    { "path": "/api/cron/gmail", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/radar", "schedule": "0 */12 * * *" }
  ]
}
```

- [ ] **Step 3: Documentar env en `.env.example`** (agregar al final)

```bash
# Radar SECOP/Datos Abiertos (§7). API pública; token opcional para rate-limits.
DATOS_GOV_APP_TOKEN=
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck` → PASS.
Run: `pnpm build` → compila; `/api/cron/radar` aparece como ƒ (dynamic).

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/radar/route.ts vercel.json .env.example
git commit -m "feat(api): cron /api/cron/radar (auth CRON_SECRET) + vercel cron + env"
```

---

### Task 7: Promover detectada → análisis → pipeline

**Files:**
- Create: `lib/radar/promote.ts`
- Create: `lib/db/detected-actions.ts`
- Test: `lib/radar/promote.test.ts`

**Interfaces:**
- Consumes: `getDetected`/`markDetected` (`@/lib/db/detected`); para la action: `analyzeOpportunity`, `generateWithOpenRouter`, `listFunders`/`rowToProfile`, `matchFunder`/`formatFunderBlock`, `addOpportunityAction`.
- Produces:
  - `lib/radar/promote.ts`: `detectedToCorpus(d: DetectedRow): string`; `promoteDetected(id: string, deps: PromoteDeps): Promise<'promoted' | 'not_found'>` con
    `PromoteDeps = { getDetected: (id) => Promise<DetectedRow | undefined>; analyzeAndSave: (text: string) => Promise<string>; markPromoted: (id: string, opportunityId: string) => Promise<void> }`.
  - `lib/db/detected-actions.ts`: `promoteDetectedAction(id: string): Promise<void>`; `discardDetectedAction(id: string): Promise<void>`.

- [ ] **Step 1: Escribir `lib/radar/promote.test.ts`**

```ts
// lib/radar/promote.test.ts
import { describe, it, expect } from 'vitest'
import { promoteDetected, detectedToCorpus } from './promote'
import type { DetectedRow } from '@/lib/db/schema'

const d: DetectedRow = {
  id: 'secop:A', source: 'secop', sourceRef: 'A', title: 'Riego agrícola', funder: 'ADR',
  amount: '1000', currency: 'COP', deadline: '2026-09-30', url: 'https://x', themes: 'agrícola',
  status: 'detectada', opportunityId: null, detectedAt: new Date(),
}

it('detectedToCorpus incluye título, entidad y monto', () => {
  const text = detectedToCorpus(d)
  expect(text).toContain('Riego agrícola')
  expect(text).toContain('ADR')
  expect(text).toContain('1000')
})

it('promoteDetected analiza, guarda y marca promovida', async () => {
  let markedWith: { id: string; op: string } | null = null
  const res = await promoteDetected('secop:A', {
    getDetected: async () => d,
    analyzeAndSave: async () => 'op-7',
    markPromoted: async (id, op) => { markedWith = { id, op } },
  })
  expect(res).toBe('promoted')
  expect(markedWith).toEqual({ id: 'secop:A', op: 'op-7' })
})

it('promoteDetected devuelve not_found y no marca si no existe', async () => {
  let marked = false
  const res = await promoteDetected('nope', {
    getDetected: async () => undefined,
    analyzeAndSave: async () => 'x',
    markPromoted: async () => { marked = true },
  })
  expect(res).toBe('not_found')
  expect(marked).toBe(false)
})
```

- [ ] **Step 2: Run → fail, implementar `lib/radar/promote.ts`**

Run: `pnpm test lib/radar/promote.test.ts` → FAIL.
```ts
import type { DetectedRow } from '@/lib/db/schema'

export function detectedToCorpus(d: DetectedRow): string {
  return [
    'Convocatoria detectada por el radar (SECOP / Datos Abiertos).',
    `Título: ${d.title}`,
    d.funder ? `Entidad: ${d.funder}` : null,
    d.amount ? `Valor: ${d.amount} ${d.currency ?? ''}`.trim() : null,
    d.deadline ? `Fecha límite: ${d.deadline}` : null,
    d.url ? `URL: ${d.url}` : null,
  ].filter(Boolean).join('\n')
}

export interface PromoteDeps {
  getDetected: (id: string) => Promise<DetectedRow | undefined>
  analyzeAndSave: (text: string) => Promise<string>
  markPromoted: (id: string, opportunityId: string) => Promise<void>
}

export async function promoteDetected(id: string, deps: PromoteDeps): Promise<'promoted' | 'not_found'> {
  const d = await deps.getDetected(id)
  if (!d) return 'not_found'
  const opportunityId = await deps.analyzeAndSave(detectedToCorpus(d))
  await deps.markPromoted(id, opportunityId)
  return 'promoted'
}
```
Run again → PASS (3).

- [ ] **Step 3: Implementar `lib/db/detected-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getDetected, markDetected } from './detected'
import { promoteDetected } from '@/lib/radar/promote'
import { analyzeOpportunity } from '@/lib/agent/analyze'
import { generateWithOpenRouter } from '@/lib/agent/llm'
import { listFunders, rowToProfile } from './funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { addOpportunityAction } from './actions'

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

export async function promoteDetectedAction(id: string): Promise<void> {
  await promoteDetected(id, {
    getDetected,
    analyzeAndSave,
    markPromoted: (detectedId, opportunityId) => markDetected(detectedId, 'promovida', opportunityId),
  })
  revalidatePath('/radar')
  revalidatePath('/pipeline')
  revalidatePath('/dashboard')
}

export async function discardDetectedAction(id: string): Promise<void> {
  await markDetected(id, 'descartada')
  revalidatePath('/radar')
}
```

- [ ] **Step 4: Typecheck + run promote test**

Run: `pnpm typecheck` → PASS.
Run: `pnpm test lib/radar/promote.test.ts` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add lib/radar/promote.ts lib/radar/promote.test.ts lib/db/detected-actions.ts
git commit -m "feat(radar): promover detectada (análisis+pipeline) y descartar"
```

---

### Task 8: Vista `/radar` + nav

**Files:**
- Create: `app/radar/page.tsx`
- Create: `components/radar/detected-list.tsx`
- Modify: `components/nav-header.tsx`

**Interfaces:**
- Consumes: `listDetected` (`@/lib/db/detected`); `promoteDetectedAction`/`discardDetectedAction` (`@/lib/db/detected-actions`); `DetectedRow` (`@/lib/db/schema`); `daysRemaining` (`@/lib/ui/format`).

- [ ] **Step 1: `app/radar/page.tsx` (Server Component)**

```tsx
import { listDetected } from '@/lib/db/detected'
import { DetectedList } from '@/components/radar/detected-list'

export const dynamic = 'force-dynamic'

export default async function RadarPage() {
  const detected = await listDetected()
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Radar</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Oportunidades detectadas automáticamente (SECOP / Datos Abiertos). Promové las relevantes para analizarlas.
      </p>
      <DetectedList detected={detected} />
    </main>
  )
}
```

- [ ] **Step 2: `components/radar/detected-list.tsx` (client)**

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DetectedRow } from '@/lib/db/schema'
import { promoteDetectedAction, discardDetectedAction } from '@/lib/db/detected-actions'
import { daysRemaining } from '@/lib/ui/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STATUS_LABEL: Record<DetectedRow['status'], string> = {
  detectada: 'Detectada', promovida: 'Promovida', descartada: 'Descartada',
}

export function DetectedList({ detected }: { detected: DetectedRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (detected.length === 0) {
    return <p className="text-sm text-muted-foreground">El radar todavía no detectó oportunidades.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {detected.map((d) => {
        const days = daysRemaining(d.deadline)
        return (
          <Card key={d.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{d.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{STATUS_LABEL[d.status]}</span>
                {d.funder && <span>· {d.funder}</span>}
                {d.amount && <span>· {d.amount} {d.currency ?? ''}</span>}
                {days != null && <span>· ⏳ {days} días</span>}
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">· ver</a>}
              </div>
              {d.themes && <p className="mt-1 text-xs text-muted-foreground">{d.themes}</p>}
            </div>
            {d.status === 'detectada' && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={pending}
                  onClick={() => start(async () => { await promoteDetectedAction(d.id); router.refresh() })}>
                  {pending ? '…' : 'Promover'}
                </Button>
                <Button size="sm" variant="outline" disabled={pending}
                  onClick={() => start(async () => { await discardDetectedAction(d.id); router.refresh() })}>
                  Descartar
                </Button>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Link en `components/nav-header.tsx`**

Agregar a `LINKS`:
```ts
  { href: '/radar', label: 'Radar' },
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck` → PASS.
Run: `pnpm build` → compila; `/radar` aparece como ƒ (dynamic).

- [ ] **Step 5: Suite completa**

Run: `pnpm test` (sin DATABASE_URL) → unit verdes, integración skip.

- [ ] **Step 6: Commit**

```bash
git add app/radar components/radar components/nav-header.tsx
git commit -m "feat(radar): vista /radar con promover/descartar + link en nav"
```

---

## Self-Review

**Spec coverage:**
- Detectada liviana en tabla separada → Task 1. ✅
- Queries detected (record/list/get/mark) → Task 2. ✅
- Pre-filtro Anexo D → Task 3. ✅
- Normalización SECOP (claves candidatas, null si falta clave) → Task 4. ✅
- Cliente Socrata (público, token opcional) + discover (prefiltro+dedup, degradación por query/fila) → Task 5. ✅
- Cron protegido fail-closed + vercel.json + env → Task 6. ✅
- Promover (análisis+match financiador+pipeline, no cambia estado si falla) + descartar → Task 7. ✅
- Vista /radar + nav → Task 8. ✅
- Sin credenciales obligatorias nuevas (API pública); DATOS_GOV_APP_TOKEN opcional → Tasks 5/6. ✅
- Errores: API caída → 500 sin persistir; fila mala → skip; dedup onConflictDoNothing; promover falla → queda detectada (promoteDetected solo marca tras analyzeAndSave OK) → Tasks 5/7. ✅

**Placeholder scan:** sin TBD/TODO; cada step con código real o comando + salida esperada. La incertidumbre de nombres de campo SECOP está acotada (claves candidatas + nota de verificación runtime), no es un placeholder.

**Type consistency:** `DetectedOpportunity` (Task 4) usado por normalize (4) y discover (5). `NewDetectedRow`/`DetectedRow` (Task 1) usados por detected.ts (2), discover (5), promote (7), UI (8). `discoverFromSecop(DiscoverDeps)` (5) consumido por la ruta (6) con `fetchRows`/`recordDetected`. `promoteDetected(id, PromoteDeps)` (7) con `getDetected`/`analyzeAndSave`/`markPromoted`; la action wirea `markDetected(id,'promovida',op)` como `markPromoted`. `fetchSecopRows`/`buildSecopUrl` (5) usados por la ruta (6). `listDetected`/`promoteDetectedAction`/`discardDetectedAction` (2,7) usados por la UI (8). `daysRemaining` ya existe en `@/lib/ui/format`.
