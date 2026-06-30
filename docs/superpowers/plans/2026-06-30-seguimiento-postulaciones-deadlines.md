# Seguimiento de postulaciones + deadlines (slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar la metadata de cada postulación (tabla 1:1) y hacer visible de forma transversal qué vence y qué está en evaluación, vía una vista `/seguimiento`, una sección en el detalle y 3 widgets en el dashboard.

**Architecture:** Tabla `submissions` (1:1 con la oportunidad) + un módulo PURO de deadlines (`lib/agent/tracking/deadlines.ts`) que computa la próxima fecha relevante, su urgencia, el ranking de oportunidades en vuelo y los conteos para widgets. Queries + server action (upsert) + UI (vista, sección de detalle, widgets) sobre los patrones ya establecidos en Financiadores §11 / Aliados §12. No toca el análisis ni el pipeline.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions, `force-dynamic`), React 19, Drizzle ORM sobre Supabase Postgres (postgres-js, `prepare:false`), Vitest, tsx.

## Global Constraints

- **Mentalidad: PRODUCTO, no demo.** Código product-grade.
- **Sin variables de entorno ni credenciales nuevas.**
- Fechas como strings ISO `YYYY-MM-DD` (misma convención que `analysis.deadline.date` y `DemoTask.due_date`).
- La lógica de deadlines es **pura y total** con `today: Date` inyectado (sin `Date.now()`/`new Date()` argless dentro de la lógica; el page pasa `new Date()`). Nunca lanza; null/ inválido → `sin_fecha`.
- Urgencia: **vencida** (daysLeft < 0), **urgente** (0–7), **próxima** (8–30), **lejana** (>30), **sin_fecha** (null).
- "En vuelo" = `['priorizada','en_alianzas','en_formulacion','presentada','en_evaluacion']` (excluye pre-decisión y cerradas).
- Tests de integración: `describe.skipIf(!process.env.DATABASE_URL)`, corridos **individualmente** con `DATABASE_URL` exportada inline; **nunca** `pnpm test -- <file>` (carrera de DB en paralelo). Usar `pnpm test <file>`.
- `submissions.id` es **PK y FK** a `opportunities(id)` (on delete cascade): los tests de integración deben insertar primero una oportunidad padre con `db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, ...)))`.
- **`pnpm db:push` cuelga con el pooler de Supabase.** Migración Task 1 vía script throwaway (`postgres` directo) + verificación por `information_schema`, borrar antes de commitear.
- Seguir patrones existentes: `lib/db/funders.ts`/`funder-actions.ts`, `app/financiadores/page.tsx`, `components/funders/*`, `components/dashboard/*`, `lib/db/queries.ts`, `lib/db/mappers.ts`.
- Mantener verde la suite y typecheck limpio; `pnpm build` con `/seguimiento` y el detalle dinámicos.

---

### Task 1: Tabla `submissions` (schema Drizzle + migración aplicada)

**Files:**
- Modify: `lib/db/schema.ts` (agregar al final, después del bloque `allies`)
- Throwaway (crear, aplicar, **borrar antes de commit**): `scripts/apply-submissions-migration.ts`

**Interfaces:**
- Consumes: tabla `opportunities` existente (FK).
- Produces: tabla Drizzle `submissions` y tipos `SubmissionRow` / `NewSubmissionRow` con forma:
  `{ id: string; fechaPresentacion: string|null; radicado: string|null; fechaResultadoEsp: string|null; proximoHito: string|null; proximoHitoFecha: string|null; notas: string|null; updatedAt: Date }`.

- [ ] **Step 1: Agregar la tabla `submissions` al schema**

En `lib/db/schema.ts`, al final del archivo:

```ts
export const submissions = pgTable('submissions', {
  id: text('id') // = opportunityId
    .primaryKey()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  fechaPresentacion: text('fecha_presentacion'),
  radicado: text('radicado'),
  fechaResultadoEsp: text('fecha_resultado_esp'),
  proximoHito: text('proximo_hito'),
  proximoHitoFecha: text('proximo_hito_fecha'),
  notas: text('notas'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type SubmissionRow = typeof submissions.$inferSelect
export type NewSubmissionRow = typeof submissions.$inferInsert
```

(`pgTable`, `text`, `timestamp` ya están importados; `opportunities` ya está definido arriba.)

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Crear el script throwaway de migración**

Crear `scripts/apply-submissions-migration.ts`:

```ts
import '../lib/load-env'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida')
  const sql = postgres(url, { prepare: false })
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id text PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
      fecha_presentacion text,
      radicado text,
      fecha_resultado_esp text,
      proximo_hito text,
      proximo_hito_fecha text,
      notas text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'submissions' ORDER BY column_name;
  `
  console.error('[apply-submissions-migration] columnas:', cols.map((c) => c.column_name).join(', '))
  await sql.end()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: Aplicar y verificar la migración**

Run: `pnpm exec tsx scripts/apply-submissions-migration.ts`
Expected: imprime `[apply-submissions-migration] columnas: fecha_presentacion, fecha_resultado_esp, id, notas, proximo_hito, proximo_hito_fecha, radicado, updated_at`

- [ ] **Step 5: Borrar el script throwaway**

Run: `rm scripts/apply-submissions-migration.ts`
Expected: ya no existe (no se commitea).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(seguimiento): tabla submissions (schema + migración aplicada)"
```

---

### Task 2: Módulo puro de deadlines `lib/agent/tracking/deadlines.ts`

**Files:**
- Create: `lib/agent/tracking/deadlines.ts`
- Test: `lib/agent/tracking/deadlines.test.ts`

**Interfaces:**
- Consumes: `PipelineState`, `DemoOpportunity` (tipos de `@/lib/demo/types`); `SubmissionRow` (tipo de `@/lib/db/schema`, Task 1).
- Produces:
  - `const IN_FLIGHT_STATES: PipelineState[]`
  - `type Urgency = 'vencida'|'urgente'|'proxima'|'lejana'|'sin_fecha'`
  - `type DeadlineKind = 'deadline'|'hito'|'resultado'`
  - `interface NextDate { date: string|null; kind: DeadlineKind|null; daysLeft: number|null; urgency: Urgency }`
  - `interface SubmissionLike { fechaResultadoEsp: string|null; proximoHitoFecha: string|null }`
  - `interface TrackingInput { opportunityId: string; name: string; state: PipelineState; deadlineDate: string|null; submission: SubmissionLike|null }`
  - `interface InFlightItem { opportunityId: string; name: string; state: PipelineState; next: NextDate }`
  - `function nextRelevantDate(input: { state: PipelineState; deadlineDate: string|null; submission: SubmissionLike|null }, today: Date): NextDate`
  - `function rankInFlight(items: TrackingInput[], today: Date): InFlightItem[]`
  - `function deadlineCounts(items: InFlightItem[]): { vencidas: number; estaSemana: number; enEvaluacion: number }`
  - `function buildTrackingInputs(opps: DemoOpportunity[], submissions: SubmissionRow[]): TrackingInput[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/agent/tracking/deadlines.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  nextRelevantDate, rankInFlight, deadlineCounts, buildTrackingInputs,
  type TrackingInput,
} from './deadlines'
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import type { SubmissionRow } from '@/lib/db/schema'

const today = new Date('2026-06-30T00:00:00Z')

describe('nextRelevantDate', () => {
  it('antes de presentar usa el deadline de la convocatoria', () => {
    const r = nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-07-15', submission: null }, today)
    expect(r.kind).toBe('deadline')
    expect(r.date).toBe('2026-07-15')
    expect(r.daysLeft).toBe(15)
    expect(r.urgency).toBe('proxima')
  })

  it('presentada elige la fecha más temprana entre hito y resultado', () => {
    const r = nextRelevantDate(
      { state: 'presentada', deadlineDate: '2026-12-01', submission: { proximoHitoFecha: '2026-07-10', fechaResultadoEsp: '2026-09-01' } },
      today,
    )
    expect(r.kind).toBe('hito')
    expect(r.date).toBe('2026-07-10')
  })

  it('en_evaluacion sin fechas de postulación cae al deadline', () => {
    const r = nextRelevantDate(
      { state: 'en_evaluacion', deadlineDate: '2026-07-05', submission: { proximoHitoFecha: null, fechaResultadoEsp: null } },
      today,
    )
    expect(r.kind).toBe('deadline')
    expect(r.daysLeft).toBe(5)
    expect(r.urgency).toBe('urgente')
  })

  it('clasifica los buckets de urgencia', () => {
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-06-01', submission: null }, today).urgency).toBe('vencida')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-07-02', submission: null }, today).urgency).toBe('urgente')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-07-20', submission: null }, today).urgency).toBe('proxima')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: '2026-09-30', submission: null }, today).urgency).toBe('lejana')
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: null, submission: null }, today).urgency).toBe('sin_fecha')
  })

  it('fecha inválida → sin_fecha', () => {
    expect(nextRelevantDate({ state: 'priorizada', deadlineDate: 'no-es-fecha', submission: null }, today).urgency).toBe('sin_fecha')
  })
})

function input(opportunityId: string, state: PipelineState, deadlineDate: string | null, submission: TrackingInput['submission'] = null): TrackingInput {
  return { opportunityId, name: opportunityId, state, deadlineDate, submission }
}

describe('rankInFlight', () => {
  it('filtra fuera pre-decisión y cerradas, ordena por daysLeft asc con sin_fecha al final', () => {
    const items: TrackingInput[] = [
      input('cerrada', 'aprobada', '2026-07-01'),
      input('pre', 'analizada', '2026-07-01'),
      input('lejana', 'priorizada', '2026-09-30'),
      input('vencida', 'en_formulacion', '2026-06-10'),
      input('sinfecha', 'en_alianzas', null),
      input('urgente', 'priorizada', '2026-07-03'),
    ]
    const ranked = rankInFlight(items, today)
    expect(ranked.map((r) => r.opportunityId)).toEqual(['vencida', 'urgente', 'lejana', 'sinfecha'])
  })
})

describe('deadlineCounts', () => {
  it('cuenta vencidas, esta semana y en evaluación', () => {
    const items: TrackingInput[] = [
      input('a', 'priorizada', '2026-06-10'),   // vencida
      input('b', 'priorizada', '2026-07-03'),   // urgente
      input('c', 'en_evaluacion', '2026-09-30'), // lejana + en_evaluacion
    ]
    const counts = deadlineCounts(rankInFlight(items, today))
    expect(counts).toEqual({ vencidas: 1, estaSemana: 1, enEvaluacion: 1 })
  })
})

describe('buildTrackingInputs', () => {
  function opp(id: string, state: PipelineState, deadline: string | null): DemoOpportunity {
    return {
      analysis: { opportunity_id: id, source: { name: `n-${id}` }, deadline: { date: deadline, verified: false } },
      state, created_at: '', responsible: null, tasks: [], decision_reason: null,
    } as unknown as DemoOpportunity
  }
  it('une cada oportunidad con su submission por id (null si no hay)', () => {
    const opps = [opp('a', 'presentada', '2026-08-01'), opp('b', 'priorizada', null)]
    const subs = [{ id: 'a', fechaResultadoEsp: '2026-09-01', proximoHitoFecha: null } as SubmissionRow]
    const inputs = buildTrackingInputs(opps, subs)
    expect(inputs[0]).toMatchObject({ opportunityId: 'a', name: 'n-a', state: 'presentada', deadlineDate: '2026-08-01' })
    expect(inputs[0].submission).toEqual({ id: 'a', fechaResultadoEsp: '2026-09-01', proximoHitoFecha: null })
    expect(inputs[1].submission).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test lib/agent/tracking/deadlines.test.ts`
Expected: FAIL con "Failed to resolve import './deadlines'".

- [ ] **Step 3: Implementar el módulo**

Crear `lib/agent/tracking/deadlines.ts`:

```ts
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import type { SubmissionRow } from '@/lib/db/schema'

export const IN_FLIGHT_STATES: PipelineState[] = [
  'priorizada', 'en_alianzas', 'en_formulacion', 'presentada', 'en_evaluacion',
]
const POST_SUBMIT: PipelineState[] = ['presentada', 'en_evaluacion']

export type Urgency = 'vencida' | 'urgente' | 'proxima' | 'lejana' | 'sin_fecha'
export type DeadlineKind = 'deadline' | 'hito' | 'resultado'

export interface NextDate {
  date: string | null
  kind: DeadlineKind | null
  daysLeft: number | null
  urgency: Urgency
}

export interface SubmissionLike {
  fechaResultadoEsp: string | null
  proximoHitoFecha: string | null
}

export interface TrackingInput {
  opportunityId: string
  name: string
  state: PipelineState
  deadlineDate: string | null
  submission: SubmissionLike | null
}

export interface InFlightItem {
  opportunityId: string
  name: string
  state: PipelineState
  next: NextDate
}

// Parsea el prefijo YYYY-MM-DD a medianoche UTC. Devuelve null si no matchea.
function toUtcMidnight(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

function dayDiff(iso: string, today: Date): number | null {
  const target = toUtcMidnight(iso)
  if (target == null) return null
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((target - base) / 86_400_000)
}

function classify(date: string | null, kind: DeadlineKind | null, today: Date): NextDate {
  if (!date) return { date: null, kind: null, daysLeft: null, urgency: 'sin_fecha' }
  const daysLeft = dayDiff(date, today)
  if (daysLeft == null) return { date: null, kind: null, daysLeft: null, urgency: 'sin_fecha' }
  let urgency: Urgency
  if (daysLeft < 0) urgency = 'vencida'
  else if (daysLeft <= 7) urgency = 'urgente'
  else if (daysLeft <= 30) urgency = 'proxima'
  else urgency = 'lejana'
  return { date, kind, daysLeft, urgency }
}

export function nextRelevantDate(
  input: { state: PipelineState; deadlineDate: string | null; submission: SubmissionLike | null },
  today: Date,
): NextDate {
  const { state, deadlineDate, submission } = input
  if (POST_SUBMIT.includes(state)) {
    const candidates: { date: string; kind: DeadlineKind; ms: number }[] = []
    if (submission?.proximoHitoFecha) {
      const ms = toUtcMidnight(submission.proximoHitoFecha)
      if (ms != null) candidates.push({ date: submission.proximoHitoFecha, kind: 'hito', ms })
    }
    if (submission?.fechaResultadoEsp) {
      const ms = toUtcMidnight(submission.fechaResultadoEsp)
      if (ms != null) candidates.push({ date: submission.fechaResultadoEsp, kind: 'resultado', ms })
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.ms - b.ms)
      return classify(candidates[0].date, candidates[0].kind, today)
    }
  }
  return classify(deadlineDate, deadlineDate ? 'deadline' : null, today)
}

export function rankInFlight(items: TrackingInput[], today: Date): InFlightItem[] {
  return items
    .filter((it) => IN_FLIGHT_STATES.includes(it.state))
    .map((it) => ({
      opportunityId: it.opportunityId,
      name: it.name,
      state: it.state,
      next: nextRelevantDate({ state: it.state, deadlineDate: it.deadlineDate, submission: it.submission }, today),
    }))
    .sort((a, b) => {
      const da = a.next.daysLeft
      const db = b.next.daysLeft
      if (da == null && db == null) return 0
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
}

export function deadlineCounts(items: InFlightItem[]): { vencidas: number; estaSemana: number; enEvaluacion: number } {
  let vencidas = 0
  let estaSemana = 0
  let enEvaluacion = 0
  for (const it of items) {
    if (it.next.urgency === 'vencida') vencidas++
    if (it.next.urgency === 'urgente') estaSemana++
    if (it.state === 'en_evaluacion') enEvaluacion++
  }
  return { vencidas, estaSemana, enEvaluacion }
}

export function buildTrackingInputs(opps: DemoOpportunity[], submissions: SubmissionRow[]): TrackingInput[] {
  const byId = new Map(submissions.map((s) => [s.id, s]))
  return opps.map((o) => ({
    opportunityId: o.analysis.opportunity_id,
    name: o.analysis.source.name,
    state: o.state,
    deadlineDate: o.analysis.deadline.date,
    submission: byId.get(o.analysis.opportunity_id) ?? null,
  }))
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test lib/agent/tracking/deadlines.test.ts`
Expected: PASS (todos los `describe`, output pristine).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/tracking/deadlines.ts lib/agent/tracking/deadlines.test.ts
git commit -m "feat(seguimiento): módulo puro de deadlines (nextRelevantDate/rankInFlight/counts)"
```

---

### Task 3: Queries `lib/db/submissions.ts`

**Files:**
- Create: `lib/db/submissions.ts`
- Test: `lib/db/submissions.test.ts`

**Interfaces:**
- Consumes: `submissions`, `SubmissionRow` (Task 1); `opportunities`, `opportunityToRow`, `makeOpportunity` (existentes, para el fixture FK).
- Produces:
  - `listSubmissions(): Promise<SubmissionRow[]>`
  - `getSubmission(opportunityId: string): Promise<SubmissionRow | undefined>`

- [ ] **Step 1: Escribir el test de integración que falla**

Crear `lib/db/submissions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { submissions, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { listSubmissions, getSubmission } from './submissions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-sub', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('submissions queries (integración)', () => {
  beforeEach(async () => { await db.delete(submissions); await db.delete(opportunities) })

  it('getSubmission devuelve uno o undefined; listSubmissions los lista', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await db.insert(submissions).values({ id: 'op-sub', radicado: 'R-123', fechaPresentacion: '2026-06-15' })

    expect(await getSubmission('nope')).toBeUndefined()
    const got = await getSubmission('op-sub')
    expect(got?.radicado).toBe('R-123')
    expect(got?.fechaPresentacion).toBe('2026-06-15')

    const all = await listSubmissions()
    expect(all.map((s) => s.id)).toEqual(['op-sub'])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submissions.test.ts`
Expected: FAIL con "Failed to resolve import './submissions'".

- [ ] **Step 3: Implementar las queries**

Crear `lib/db/submissions.ts`:

```ts
import { eq } from 'drizzle-orm'
import { db } from './client'
import { submissions, type SubmissionRow } from './schema'

export async function listSubmissions(): Promise<SubmissionRow[]> {
  return db.select().from(submissions)
}

export async function getSubmission(opportunityId: string): Promise<SubmissionRow | undefined> {
  const rows = await db.select().from(submissions).where(eq(submissions.id, opportunityId)).limit(1)
  return rows[0]
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submissions.test.ts`
Expected: PASS (1/1 ejecutado, no skipped).

- [ ] **Step 5: Commit**

```bash
git add lib/db/submissions.ts lib/db/submissions.test.ts
git commit -m "feat(seguimiento): queries listSubmissions/getSubmission"
```

---

### Task 4: Server action `lib/db/submission-actions.ts`

**Files:**
- Create: `lib/db/submission-actions.ts`
- Test: `lib/db/submission-actions.test.ts`

**Interfaces:**
- Consumes: `submissions`, `NewSubmissionRow` (Task 1); `getSubmission` (Task 3); fixture FK (opportunities).
- Produces: `saveSubmissionAction(opportunityId: string, patch: Partial<Omit<NewSubmissionRow, 'id'>>): Promise<void>` — upsert por id, revalida `/seguimiento`, `/dashboard`, `/oportunidad/${opportunityId}`.

- [ ] **Step 1: Escribir el test de integración que falla**

Crear `lib/db/submission-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { submissions, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { getSubmission } from './submissions'
import { saveSubmissionAction } from './submission-actions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-sa', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('submission actions (integración)', () => {
  beforeEach(async () => { await db.delete(submissions); await db.delete(opportunities) })

  it('upsert: crea y luego actualiza por id', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))

    await saveSubmissionAction('op-sa', { radicado: 'R-1', fechaPresentacion: '2026-06-15' })
    expect((await getSubmission('op-sa'))?.radicado).toBe('R-1')

    await saveSubmissionAction('op-sa', { radicado: 'R-2', proximoHito: 'sustentación' })
    const got = await getSubmission('op-sa')
    expect(got?.radicado).toBe('R-2')
    expect(got?.proximoHito).toBe('sustentación')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submission-actions.test.ts`
Expected: FAIL con "Failed to resolve import './submission-actions'".

- [ ] **Step 3: Implementar la action**

Crear `lib/db/submission-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { db } from './client'
import { submissions } from './schema'
import type { NewSubmissionRow } from './schema'

export async function saveSubmissionAction(
  opportunityId: string,
  patch: Partial<Omit<NewSubmissionRow, 'id'>>,
): Promise<void> {
  await db.insert(submissions).values({ id: opportunityId, ...patch })
    .onConflictDoUpdate({ target: submissions.id, set: { ...patch, updatedAt: new Date() } })
  revalidatePath('/seguimiento')
  revalidatePath('/dashboard')
  revalidatePath(`/oportunidad/${opportunityId}`)
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submission-actions.test.ts`
Expected: PASS (1/1 ejecutado, no skipped).

- [ ] **Step 5: Commit**

```bash
git add lib/db/submission-actions.ts lib/db/submission-actions.test.ts
git commit -m "feat(seguimiento): server action saveSubmissionAction (upsert)"
```

---

### Task 5: Sección "Seguimiento de la postulación" en el detalle

**Files:**
- Create: `components/tracking/submission-section.tsx`
- Modify: `app/oportunidad/[id]/page.tsx`

**Interfaces:**
- Consumes: `saveSubmissionAction` (Task 4); `SubmissionRow` (Task 1); `getSubmission` (Task 3).
- Produces: componente cliente `SubmissionSection` y su cableado en el detalle.

- [ ] **Step 1: Crear el componente de formulario**

Crear `components/tracking/submission-section.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SubmissionRow } from '@/lib/db/schema'
import { saveSubmissionAction } from '@/lib/db/submission-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const DATE_FIELDS: { key: keyof SubmissionRow; label: string }[] = [
  { key: 'fechaPresentacion', label: 'Fecha de presentación' },
  { key: 'fechaResultadoEsp', label: 'Fecha esperada de resultado' },
  { key: 'proximoHitoFecha', label: 'Fecha del próximo hito' },
]

export function SubmissionSection({ opportunityId, submission }: { opportunityId: string; submission: SubmissionRow | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    const patch = {
      fechaPresentacion: text('fechaPresentacion'),
      fechaResultadoEsp: text('fechaResultadoEsp'),
      proximoHitoFecha: text('proximoHitoFecha'),
      radicado: text('radicado'),
      proximoHito: text('proximoHito'),
      notas: text('notas'),
    }
    setSaved(false)
    start(async () => {
      await saveSubmissionAction(opportunityId, patch)
      router.refresh()
      setSaved(true)
    })
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold">Seguimiento de la postulación</h2>
      <p className="mb-3 text-xs text-muted-foreground">Registrá fechas y referencias para seguir la postulación y sus deadlines.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input name="radicado" defaultValue={submission?.radicado ?? ''} placeholder="Radicado / referencia"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        {DATE_FIELDS.map((f) => (
          <label key={f.key as string} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {f.label}
            <input type="date" name={f.key as string} defaultValue={(submission?.[f.key] as string | null) ?? ''}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
        ))}
        <input name="proximoHito" defaultValue={submission?.proximoHito ?? ''} placeholder="Próximo hito (descripción)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <textarea name="notas" defaultValue={submission?.notas ?? ''} placeholder="Notas"
          className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar seguimiento'}</Button>
          {saved && !pending && <span className="text-xs text-muted-foreground">Guardado ✓</span>}
        </div>
      </form>
    </Card>
  )
}
```

- [ ] **Step 2: Cablear el detalle**

En `app/oportunidad/[id]/page.tsx`, agregá los imports y la carga, y renderizá la sección después de `<DraftsSection>` y antes de `<TaskList>`. El archivo queda así:

```tsx
import { notFound } from 'next/navigation'
import { getOpportunity } from '@/lib/db/queries'
import { listDrafts } from '@/lib/db/drafts'
import { listAllies, rowToProfile } from '@/lib/db/allies'
import { getSubmission } from '@/lib/db/submissions'
import { suggestAllies, type GapSuggestion } from '@/lib/agent/alliance/match'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'
import { DraftsSection } from '@/components/drafts/drafts-section'
import { AlliesSuggested } from '@/components/allies/allies-suggested'
import { SubmissionSection } from '@/components/tracking/submission-section'

export const dynamic = 'force-dynamic'

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await getOpportunity(id)
  if (!o) return notFound()
  const draftMap = new Map((await listDrafts(id)).map((d) => [d.kind, d]))

  let suggestions: GapSuggestion[] = []
  let loadError = false
  try {
    const allies = await listAllies()
    suggestions = suggestAllies(
      o.analysis.partners_needed,
      allies.map(rowToProfile),
      { themes: `${o.analysis.source.name} ${o.analysis.draft_outputs?.executive_summary ?? ''}`, country: null },
    )
  } catch (e) {
    console.error('[oportunidad] no se pudieron cargar aliados sugeridos:', e)
    loadError = true
  }

  let submission = null
  try {
    submission = (await getSubmission(id)) ?? null
  } catch (e) {
    console.error('[oportunidad] no se pudo cargar el seguimiento:', e)
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <AlliesSuggested suggestions={suggestions} loadError={loadError} />
      <DraftsSection opportunityId={id} drafts={draftMap} />
      <SubmissionSection opportunityId={id} submission={submission} />
      <TaskList o={o} />
    </main>
  )
}
```

- [ ] **Step 3: Verificar typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS (el detalle sigue dinámico).

- [ ] **Step 4: Commit**

```bash
git add components/tracking/submission-section.tsx app/oportunidad/[id]/page.tsx
git commit -m "feat(seguimiento): sección de postulación en el detalle de oportunidad"
```

---

### Task 6: Vista `/seguimiento` + link en nav

**Files:**
- Create: `app/seguimiento/page.tsx`
- Create: `components/tracking/tracking-list.tsx`
- Modify: `components/nav-header.tsx` (array `LINKS`)

**Interfaces:**
- Consumes: `listOpportunities` (`@/lib/db/queries`); `listSubmissions` (Task 3); `buildTrackingInputs`, `rankInFlight`, `type InFlightItem`, `type Urgency` (Task 2); `PIPELINE_STATE_META` (`@/lib/ui/format`).
- Produces: ruta `/seguimiento`; link "Seguimiento" en el nav.

- [ ] **Step 1: Crear el componente de lista**

Crear `components/tracking/tracking-list.tsx` (Server Component presentacional):

```tsx
import Link from 'next/link'
import type { InFlightItem, Urgency } from '@/lib/agent/tracking/deadlines'
import { PIPELINE_STATE_META } from '@/lib/ui/format'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const URGENCY_META: Record<Urgency, { label: string; color: string }> = {
  vencida: { label: 'Vencida', color: '#b23a2e' },
  urgente: { label: 'Esta semana', color: '#c2611c' },
  proxima: { label: 'Próxima', color: '#9a6b12' },
  lejana: { label: 'Lejana', color: '#3c7d34' },
  sin_fecha: { label: 'Sin fecha', color: '#6b7280' },
}

const KIND_LABEL = { deadline: 'cierre convocatoria', hito: 'próximo hito', resultado: 'resultado esperado' } as const

function daysText(daysLeft: number | null): string {
  if (daysLeft == null) return '—'
  if (daysLeft < 0) return `hace ${Math.abs(daysLeft)} d`
  if (daysLeft === 0) return 'hoy'
  return `en ${daysLeft} d`
}

export function TrackingList({ items }: { items: InFlightItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay postulaciones en vuelo por ahora.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => {
        const u = URGENCY_META[it.next.urgency]
        const st = PIPELINE_STATE_META[it.state]
        return (
          <Card key={it.opportunityId} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link href={`/oportunidad/${it.opportunityId}`} className="font-medium hover:underline">{it.name}</Link>
              <p className="text-xs text-muted-foreground">
                <span style={{ color: st.color }}>{st.label}</span>
                {it.next.date && <> · {it.next.kind ? KIND_LABEL[it.next.kind] : ''} {it.next.date}</>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge style={{ backgroundColor: u.color }}>{u.label}</Badge>
              <span className="text-xs text-muted-foreground">{daysText(it.next.daysLeft)}</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Crear la página `/seguimiento`**

Crear `app/seguimiento/page.tsx`:

```tsx
import { listOpportunities } from '@/lib/db/queries'
import { listSubmissions } from '@/lib/db/submissions'
import { buildTrackingInputs, rankInFlight, type InFlightItem } from '@/lib/agent/tracking/deadlines'
import { TrackingList } from '@/components/tracking/tracking-list'

export const dynamic = 'force-dynamic'

export default async function SeguimientoPage() {
  let items: InFlightItem[] = []
  try {
    const [opps, subs] = await Promise.all([listOpportunities(), listSubmissions()])
    items = rankInFlight(buildTrackingInputs(opps, subs), new Date())
  } catch (e) {
    console.error('[seguimiento] no se pudo cargar el seguimiento:', e)
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Seguimiento</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Postulaciones en vuelo ordenadas por urgencia: qué vence, qué está en evaluación.
      </p>
      <TrackingList items={items} />
    </main>
  )
}
```

- [ ] **Step 3: Agregar el link en el nav**

En `components/nav-header.tsx`, agregá la entrada al array `LINKS` después de `'/radar'`:

```tsx
const LINKS = [
  { href: '/', label: 'Analizar' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/financiadores', label: 'Financiadores' },
  { href: '/aliados', label: 'Aliados' },
  { href: '/radar', label: 'Radar' },
  { href: '/seguimiento', label: 'Seguimiento' },
]
```

- [ ] **Step 4: Verificar typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS (`/seguimiento` aparece como ruta dinámica).

- [ ] **Step 5: Commit**

```bash
git add app/seguimiento components/tracking/tracking-list.tsx components/nav-header.tsx
git commit -m "feat(seguimiento): vista /seguimiento + link en nav"
```

---

### Task 7: Widgets de deadlines en el dashboard

**Files:**
- Modify: `components/dashboard/dashboard-view.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `buildTrackingInputs`, `rankInFlight`, `deadlineCounts` (Task 2); `listSubmissions` (Task 3); `listOpportunities` (existente).
- Produces: 3 widgets nuevos en `DashboardView` alimentados por un prop `tracking`.

- [ ] **Step 1: Agregar el prop `tracking` y los 3 widgets a `DashboardView`**

En `components/dashboard/dashboard-view.tsx`, cambiá la firma para aceptar `tracking` y agregá 3 `WidgetCard` al inicio del grid (después de `<div className="grid ...">`). La firma pasa a:

```tsx
export function DashboardView({ list, now, tracking }: {
  list: DemoOpportunity[]
  now: number
  tracking: { vencidas: number; estaSemana: number; enEvaluacion: number }
}) {
```

Y justo después de `<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">` insertá:

```tsx
      <WidgetCard title="Vencen esta semana">
        <p className="text-3xl font-extrabold" style={{ color: '#c2611c' }}>{tracking.estaSemana}</p>
        <p className="mt-1 text-xs text-muted-foreground">Postulaciones con deadline en ≤7 días</p>
      </WidgetCard>

      <WidgetCard title="Vencidas">
        <p className="text-3xl font-extrabold" style={{ color: '#b23a2e' }}>{tracking.vencidas}</p>
        <p className="mt-1 text-xs text-muted-foreground">Deadline ya pasado, aún en vuelo</p>
      </WidgetCard>

      <WidgetCard title="En evaluación">
        <p className="text-3xl font-extrabold" style={{ color: '#9a6b12' }}>{tracking.enEvaluacion}</p>
        <p className="mt-1 text-xs text-muted-foreground">Postulaciones esperando resultado</p>
      </WidgetCard>
```

- [ ] **Step 2: Calcular `tracking` en el page del dashboard y pasarlo**

Reescribir `app/dashboard/page.tsx`:

```tsx
// app/dashboard/page.tsx
import { listOpportunities } from '@/lib/db/queries'
import { listSubmissions } from '@/lib/db/submissions'
import { buildTrackingInputs, rankInFlight, deadlineCounts } from '@/lib/agent/tracking/deadlines'
import { DashboardView } from '@/components/dashboard/dashboard-view'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const list = await listOpportunities()
  let tracking = { vencidas: 0, estaSemana: 0, enEvaluacion: 0 }
  try {
    const subs = await listSubmissions()
    tracking = deadlineCounts(rankInFlight(buildTrackingInputs(list, subs), new Date()))
  } catch (e) {
    console.error('[dashboard] no se pudieron calcular deadlines:', e)
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Dashboard ejecutivo</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Qué apareció, qué vale la pena, qué requiere acción y qué riesgos hay.
      </p>
      <DashboardView list={list} now={Date.now()} tracking={tracking} />
    </main>
  )
}
```

- [ ] **Step 3: Verificar typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS (dashboard dinámico, sin errores de tipos).

- [ ] **Step 4: Correr la suite completa de seguimiento + el módulo puro**

Run (individuales, secuenciales):
```
pnpm test lib/agent/tracking/deadlines.test.ts
DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submissions.test.ts
DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submission-actions.test.ts
```
Expected: los tres PASS (deadlines puro; submissions 1/1; submission-actions 1/1).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/dashboard-view.tsx app/dashboard/page.tsx
git commit -m "feat(seguimiento): widgets de deadlines en el dashboard (vencen/vencidas/en evaluación)"
```

---

## Self-Review

**1. Spec coverage:**
- Tabla `submissions` 1:1 con FK → Task 1 ✓.
- Lógica pura `nextRelevantDate`/`rankInFlight`/`deadlineCounts`/`buildTrackingInputs` + IN_FLIGHT_STATES + urgencias → Task 2 ✓.
- Pre-presentación usa deadline; post-presentación elige la fecha más temprana (hito/resultado) con fallback a deadline → Task 2 (`nextRelevantDate`) ✓.
- `listSubmissions`/`getSubmission` → Task 3 ✓.
- `saveSubmissionAction` upsert + revalidate (/seguimiento, /dashboard, /oportunidad) → Task 4 ✓.
- Sección de registro en el detalle → Task 5 ✓.
- Vista `/seguimiento` + nav → Task 6 ✓.
- 3 widgets en el dashboard → Task 7 ✓.
- Errores product-grade (funciones totales; try/catch en las páginas que leen submissions) → Tasks 5/6/7 ✓.
- Testing (puro + 2 integración) y build → cubierto ✓.
- Sin env nuevas → respetado ✓.
- Fuera de alcance (resultado→lección, alertas activas, due_date de tareas en el ranking) → no incluidos ✓.

**2. Placeholder scan:** Sin TBD/TODO. Código completo y literal en cada step.

**3. Type consistency:**
- `SubmissionRow`/`NewSubmissionRow` (Task 1) usados consistentemente en queries (Task 3), action (Task 4), UI (Tasks 5).
- `TrackingInput`/`InFlightItem`/`Urgency`/`NextDate` definidos en Task 2 y consumidos igual en Tasks 6/7.
- `buildTrackingInputs(opps: DemoOpportunity[], submissions: SubmissionRow[])` — Task 2 lo define con `DemoOpportunity` (lo que devuelve `listOpportunities`), y Tasks 6/7 lo invocan con `listOpportunities()` + `listSubmissions()` ✓. (El spec mencionaba `OpportunityRow`; el plan usa el tipo real `DemoOpportunity` que devuelven las queries — `opportunityId = o.analysis.opportunity_id`.)
- `saveSubmissionAction(opportunityId, patch)` consistente entre Task 4 (def) y Task 5 (consumo).
- Columnas snake_case de la migración (Task 1 Step 3) coinciden con el mapeo Drizzle (Task 1 Step 1).
- `deadlineCounts` devuelve `{ vencidas, estaSemana, enEvaluacion }` — mismas claves en el prop `tracking` de Task 7.
