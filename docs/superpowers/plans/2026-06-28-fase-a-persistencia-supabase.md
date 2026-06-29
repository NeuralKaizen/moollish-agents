# Fase A — Persistencia real (Supabase + Drizzle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el store de demo en `localStorage` por persistencia real en Postgres (Supabase) vía Drizzle, sin cambiar el comportamiento visible de las pantallas.

**Architecture:** Las pantallas (`/pipeline`, `/dashboard`, `/oportunidad/[id]`) pasan a ser **Server Components** que leen de Postgres con `listOpportunities()`/`getOpportunity()`. Las mutaciones (agregar, cambiar estado, marcar tarea, reiniciar) pasan por **Server Actions** que escriben en la DB y revalidan las rutas. Los componentes interactivos llaman a la action y hacen `router.refresh()`. La lógica pura de dominio (tipos, agregaciones del dashboard, `makeOpportunity`/`tasksFromAnalysis`) se **reutiliza tal cual**.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), Drizzle ORM, `postgres` (postgres-js), Supabase Postgres, Vitest, tsx.

## Global Constraints

- **Modelo de datos Fase A = solo `opportunities`.** YAGNI: las otras tablas del §15 (Financiadores, Aliados, Contactos, Documentos, Propuestas, Scores, Lecciones) se agregan en fases posteriores cuando haya un consumidor. El `OpportunityAnalysis` completo (que ya contiene scores, partners, evidencia, etc.) se guarda como `jsonb`.
- **No mover ni renombrar** `lib/demo/types.ts`, `lib/demo/operations.ts`, `lib/demo/dashboard.ts`, `lib/demo/seed.ts` ni sus tests. Son lógica pura reutilizada. Solo se **elimina** el store stateful (`store.ts`, `use-store.ts`, `store.test.ts`).
- **Tipos canónicos del dominio:** `DemoOpportunity`, `DemoTask`, `PipelineState` desde `@/lib/demo/types` (no se redefinen).
- **Conexión Supabase:** usar la connection string *pooled* (puerto 6543, modo transaction) con `postgres(url, { prepare: false })` por compatibilidad con serverless/pgbouncer.
- **Scripts CLI** importan `'../lib/load-env'` como primera línea (carga `.env` + `.env.local`) y usan imports **relativos**, igual que `scripts/seed.ts` y `scripts/analyze.ts`.
- **Auth y Storage de Supabase quedan fuera de Fase A** (diferidos, ver spec). Esta fase solo necesita `DATABASE_URL`.
- Mantener `pnpm typecheck` limpio y todos los tests verdes al cerrar cada tarea.

---

### Task 1: Dependencias, configuración de Drizzle y cliente de DB

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `drizzle.config.ts`
- Create: `lib/db/client.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `db` (instancia Drizzle) desde `@/lib/db/client`, usada por queries/actions/seed.

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```
Expected: se agregan a `package.json` sin errores.

- [ ] **Step 2: Agregar scripts a `package.json`**

En el bloque `"scripts"`, agregar:
```json
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "seed:db": "tsx scripts/seed-db.ts"
```

- [ ] **Step 3: Crear `drizzle.config.ts`**

```ts
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config()
config({ path: '.env.local', override: true })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 4: Crear `lib/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida (revisá .env.local)')

// prepare:false → compatible con el pooler de Supabase (pgbouncer, transaction mode).
const client = postgres(url, { prepare: false })

export const db = drizzle(client, { schema })
```

- [ ] **Step 5: Documentar la variable en `.env.example`**

Agregar al final:
```bash
# Postgres de Supabase (connection string pooled, puerto 6543). Solo en .env.local, nunca commitear el valor real.
DATABASE_URL=
```

- [ ] **Step 6: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS (puede fallar el import de `./schema` si aún no existe — en ese caso continuar a Task 2 y volver a correr; el orden recomendado es hacer Task 2 antes del typecheck final). Para no bloquear, este step se da por OK si el único error es `Cannot find module './schema'`.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml drizzle.config.ts lib/db/client.ts .env.example
git commit -m "feat(db): dependencias y cliente Drizzle/postgres-js para Supabase"
```

---

### Task 2: Esquema `opportunities` y migración

**Files:**
- Create: `lib/db/schema.ts`
- Create (generado): `drizzle/*.sql`

**Interfaces:**
- Produces: tabla `opportunities`; tipos `OpportunityRow` (`$inferSelect`) y `NewOpportunityRow` (`$inferInsert`) desde `@/lib/db/schema`.

- [ ] **Step 1: Crear `lib/db/schema.ts`**

```ts
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoTask, PipelineState } from '@/lib/demo/types'

export const opportunities = pgTable('opportunities', {
  id: text('id').primaryKey(), // = analysis.opportunity_id
  state: text('state').$type<PipelineState>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  responsible: text('responsible'),
  decisionReason: text('decision_reason'),
  analysis: jsonb('analysis').$type<OpportunityAnalysis>().notNull(),
  tasks: jsonb('tasks').$type<DemoTask[]>().notNull(),
})

export type OpportunityRow = typeof opportunities.$inferSelect
export type NewOpportunityRow = typeof opportunities.$inferInsert
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Generar la migración SQL**

Run: `pnpm db:generate`
Expected: crea un archivo en `drizzle/` (p. ej. `0000_*.sql`) con `CREATE TABLE "opportunities" (...)`.

- [ ] **Step 4: Aplicar el esquema a la base** (requiere `DATABASE_URL` en `.env.local`)

Run: `pnpm db:push`
Expected: "Changes applied" / la tabla `opportunities` queda creada en Supabase.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): esquema opportunities (§15 Oportunidad) + migración"
```

---

### Task 3: Mappers fila ↔ dominio (lógica pura, TDD estricto)

**Files:**
- Create: `lib/db/mappers.ts`
- Test: `lib/db/mappers.test.ts`

**Interfaces:**
- Consumes: `OpportunityRow`, `NewOpportunityRow` de `@/lib/db/schema`; `DemoOpportunity` de `@/lib/demo/types`.
- Produces: `rowToOpportunity(row: OpportunityRow): DemoOpportunity`; `opportunityToRow(o: DemoOpportunity): NewOpportunityRow`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/db/mappers.test.ts
import { describe, it, expect } from 'vitest'
import { rowToOpportunity, opportunityToRow } from './mappers'
import type { OpportunityRow } from './schema'
import type { DemoOpportunity } from '@/lib/demo/types'

const analysis = {
  opportunity_id: 'fao-agrinno',
  source: { name: 'FAO AgrInnovation', url: null, kind: 'text', captured_at: '2026-06-28', confidence: 'alta' },
  deadline: { date: '2026-09-30', verified: true },
  funding_amount: { value: 250000, currency: 'USD', confirmed: true, estimated_usd: 250000 },
  eligibility: { who: 'ONG y empresas', restrictions: [], gaps: [] },
  fit: { moollish: 90, sat2farm: 88, foundation_nova: 55 },
  semaforo: 'verde_condicionado',
  overall_score: 82,
  recommendation: 'apply_with_partner',
  risk: 'medio',
  risks: [],
  partners_needed: [],
  next_actions: [],
  evidence: [],
  missing_data: [],
  scores: {},
  draft_outputs: {},
} as unknown as DemoOpportunity['analysis']

describe('mappers', () => {
  it('rowToOpportunity convierte fila a dominio (created_at a ISO)', () => {
    const row: OpportunityRow = {
      id: 'fao-agrinno',
      state: 'priorizada',
      createdAt: new Date('2026-06-27T10:00:00.000Z'),
      responsible: 'Alex',
      decisionReason: null,
      analysis,
      tasks: [{ action: 'Contactar universidad', responsible: 'Alex', due_date: '2026-06-29', dependency: null, done: false }],
    }
    const o = rowToOpportunity(row)
    expect(o.state).toBe('priorizada')
    expect(o.created_at).toBe('2026-06-27T10:00:00.000Z')
    expect(o.responsible).toBe('Alex')
    expect(o.decision_reason).toBeNull()
    expect(o.tasks).toHaveLength(1)
    expect(o.analysis.opportunity_id).toBe('fao-agrinno')
  })

  it('opportunityToRow es el inverso (id desde opportunity_id, created_at a Date)', () => {
    const o: DemoOpportunity = {
      analysis,
      state: 'analizada',
      created_at: '2026-06-27T10:00:00.000Z',
      responsible: null,
      decision_reason: 'sin fondos',
      tasks: [],
    }
    const row = opportunityToRow(o)
    expect(row.id).toBe('fao-agrinno')
    expect(row.state).toBe('analizada')
    expect(row.createdAt).toEqual(new Date('2026-06-27T10:00:00.000Z'))
    expect(row.decisionReason).toBe('sin fondos')
    expect(row.tasks).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- lib/db/mappers.test.ts`
Expected: FAIL ("rowToOpportunity is not a function" / módulo no encontrado).

- [ ] **Step 3: Implementar `lib/db/mappers.ts`**

```ts
import type { DemoOpportunity } from '@/lib/demo/types'
import type { OpportunityRow, NewOpportunityRow } from './schema'

export function rowToOpportunity(row: OpportunityRow): DemoOpportunity {
  return {
    analysis: row.analysis,
    state: row.state,
    created_at: row.createdAt.toISOString(),
    responsible: row.responsible,
    tasks: row.tasks,
    decision_reason: row.decisionReason,
  }
}

export function opportunityToRow(o: DemoOpportunity): NewOpportunityRow {
  return {
    id: o.analysis.opportunity_id,
    state: o.state,
    createdAt: new Date(o.created_at),
    responsible: o.responsible,
    decisionReason: o.decision_reason,
    analysis: o.analysis,
    tasks: o.tasks,
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test -- lib/db/mappers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/mappers.ts lib/db/mappers.test.ts
git commit -m "feat(db): mappers fila opportunities <-> DemoOpportunity"
```

---

### Task 4: Queries de lectura

**Files:**
- Create: `lib/db/queries.ts`
- Test: `lib/db/queries.test.ts`

**Interfaces:**
- Consumes: `db` de `@/lib/db/client`; `opportunities` de `@/lib/db/schema`; `rowToOpportunity` de `@/lib/db/mappers`; `opportunityToRow` (en el test) de `@/lib/db/mappers`.
- Produces: `listOpportunities(): Promise<DemoOpportunity[]>` (orden `created_at` desc); `getOpportunity(id: string): Promise<DemoOpportunity | undefined>`.

> **Nota de testing:** este test es de **integración** y necesita `DATABASE_URL` apuntando a una base de prueba (un proyecto/branch Supabase de test, o un Postgres local). Si `DATABASE_URL` no está definida, el bloque se salta con `describe.skipIf`. Cada test limpia la tabla antes de correr.

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/db/queries.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { listOpportunities, getOpportunity } from './queries'
import type { DemoOpportunity } from '@/lib/demo/types'

const hasDb = !!process.env.DATABASE_URL

function fixture(id: string, createdAt: string): DemoOpportunity {
  return {
    analysis: { opportunity_id: id, source: { name: id } } as unknown as DemoOpportunity['analysis'],
    state: 'analizada',
    created_at: createdAt,
    responsible: null,
    decision_reason: null,
    tasks: [],
  }
}

describe.skipIf(!hasDb)('queries (integración)', () => {
  beforeEach(async () => { await db.delete(opportunities) })

  it('listOpportunities devuelve filas ordenadas por created_at desc', async () => {
    await db.insert(opportunities).values([
      opportunityToRow(fixture('vieja', '2026-06-01T00:00:00.000Z')),
      opportunityToRow(fixture('nueva', '2026-06-20T00:00:00.000Z')),
    ])
    const list = await listOpportunities()
    expect(list.map((o) => o.analysis.opportunity_id)).toEqual(['nueva', 'vieja'])
  })

  it('getOpportunity devuelve la fila o undefined', async () => {
    await db.insert(opportunities).values(opportunityToRow(fixture('uno', '2026-06-10T00:00:00.000Z')))
    expect((await getOpportunity('uno'))?.analysis.opportunity_id).toBe('uno')
    expect(await getOpportunity('no-existe')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `DATABASE_URL=<tu-string-de-prueba> pnpm test -- lib/db/queries.test.ts`
Expected: FAIL ("listOpportunities is not a function"). Sin `DATABASE_URL`: los tests se saltan (0 fallos) — definí la variable para ejercitarlos.

- [ ] **Step 3: Implementar `lib/db/queries.ts`**

```ts
import { desc, eq } from 'drizzle-orm'
import { db } from './client'
import { opportunities } from './schema'
import { rowToOpportunity } from './mappers'
import type { DemoOpportunity } from '@/lib/demo/types'

export async function listOpportunities(): Promise<DemoOpportunity[]> {
  const rows = await db.select().from(opportunities).orderBy(desc(opportunities.createdAt))
  return rows.map(rowToOpportunity)
}

export async function getOpportunity(id: string): Promise<DemoOpportunity | undefined> {
  const rows = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1)
  return rows[0] ? rowToOpportunity(rows[0]) : undefined
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `DATABASE_URL=<tu-string-de-prueba> pnpm test -- lib/db/queries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts lib/db/queries.test.ts
git commit -m "feat(db): queries listOpportunities/getOpportunity"
```

---

### Task 5: Server Actions de escritura

**Files:**
- Create: `lib/db/actions.ts`
- Test: `lib/db/actions.test.ts`

**Interfaces:**
- Consumes: `db`, `opportunities`, `opportunityToRow`, `makeOpportunity` (de `@/lib/demo/operations`), `SEED_OPPORTUNITIES` (de `@/lib/demo/seed`), `getOpportunity` (en el test).
- Produces (todas `Promise<void>`):
  - `addOpportunityAction(analysis: OpportunityAnalysis)`
  - `setOpportunityStateAction(id: string, state: PipelineState, reason?: string)`
  - `toggleOpportunityTaskAction(id: string, index: number)`
  - `resetDemoAction()`

> **Nota:** los nombres llevan sufijo `Action` para no chocar con las funciones puras homónimas de `lib/demo/operations.ts` (`addOpportunity`, etc.).

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/db/actions.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { opportunities } from './schema'
import { getOpportunity, listOpportunities } from './queries'
import {
  addOpportunityAction, setOpportunityStateAction, toggleOpportunityTaskAction, resetDemoAction,
} from './actions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL

const analysis = {
  opportunity_id: 'caso-x',
  source: { name: 'Caso X' },
  next_actions: [
    { action: 'Pedir términos', responsible: 'Alex', due_date: '2026-07-01', dependency: null },
  ],
} as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('actions (integración)', () => {
  beforeEach(async () => { await db.delete(opportunities) })

  it('addOpportunityAction inserta con estado analizada y tareas desde next_actions', async () => {
    await addOpportunityAction(analysis)
    const o = await getOpportunity('caso-x')
    expect(o?.state).toBe('analizada')
    expect(o?.tasks).toHaveLength(1)
    expect(o?.tasks[0].done).toBe(false)
  })

  it('addOpportunityAction es idempotente (upsert por id)', async () => {
    await addOpportunityAction(analysis)
    await addOpportunityAction(analysis)
    expect(await listOpportunities()).toHaveLength(1)
  })

  it('setOpportunityStateAction cambia estado y guarda razón', async () => {
    await addOpportunityAction(analysis)
    await setOpportunityStateAction('caso-x', 'descartada', 'no alineada')
    const o = await getOpportunity('caso-x')
    expect(o?.state).toBe('descartada')
    expect(o?.decision_reason).toBe('no alineada')
  })

  it('toggleOpportunityTaskAction alterna el done de la tarea por índice', async () => {
    await addOpportunityAction(analysis)
    await toggleOpportunityTaskAction('caso-x', 0)
    expect((await getOpportunity('caso-x'))?.tasks[0].done).toBe(true)
    await toggleOpportunityTaskAction('caso-x', 0)
    expect((await getOpportunity('caso-x'))?.tasks[0].done).toBe(false)
  })

  it('resetDemoAction deja exactamente la semilla', async () => {
    await addOpportunityAction(analysis)
    await resetDemoAction()
    const list = await listOpportunities()
    expect(list.length).toBeGreaterThan(0)
    expect(list.some((o) => o.analysis.opportunity_id === 'caso-x')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `DATABASE_URL=<tu-string-de-prueba> pnpm test -- lib/db/actions.test.ts`
Expected: FAIL ("addOpportunityAction is not a function").

- [ ] **Step 3: Implementar `lib/db/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { SEED_OPPORTUNITIES } from '@/lib/demo/seed'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { PipelineState } from '@/lib/demo/types'

function revalidateAll(): void {
  revalidatePath('/')
  revalidatePath('/pipeline')
  revalidatePath('/dashboard')
}

export async function addOpportunityAction(analysis: OpportunityAnalysis): Promise<void> {
  const row = opportunityToRow(makeOpportunity(analysis, new Date().toISOString()))
  await db.insert(opportunities).values(row)
    .onConflictDoUpdate({ target: opportunities.id, set: row })
  revalidateAll()
}

export async function setOpportunityStateAction(
  id: string, state: PipelineState, reason?: string,
): Promise<void> {
  await db.update(opportunities)
    .set(reason !== undefined ? { state, decisionReason: reason } : { state })
    .where(eq(opportunities.id, id))
  revalidateAll()
}

export async function toggleOpportunityTaskAction(id: string, index: number): Promise<void> {
  const rows = await db.select({ tasks: opportunities.tasks })
    .from(opportunities).where(eq(opportunities.id, id)).limit(1)
  const tasks = rows[0]?.tasks
  if (!tasks || !tasks[index]) return
  const next = tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
  await db.update(opportunities).set({ tasks: next }).where(eq(opportunities.id, id))
  revalidateAll()
}

export async function resetDemoAction(): Promise<void> {
  await db.delete(opportunities)
  const rows = SEED_OPPORTUNITIES.map(opportunityToRow)
  if (rows.length > 0) await db.insert(opportunities).values(rows)
  revalidateAll()
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `DATABASE_URL=<tu-string-de-prueba> pnpm test -- lib/db/actions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/actions.ts lib/db/actions.test.ts
git commit -m "feat(db): server actions add/setState/toggleTask/reset"
```

---

### Task 6: Script de seed a la base

**Files:**
- Create: `scripts/seed-db.ts`

**Interfaces:**
- Consumes: `SEED_OPPORTUNITIES` (`../lib/demo/seed`), `opportunityToRow` (`../lib/db/mappers`), `db`/`opportunities` (`../lib/db/*`).

- [ ] **Step 1: Crear `scripts/seed-db.ts`**

```ts
import '../lib/load-env'
import { db } from '../lib/db/client'
import { opportunities } from '../lib/db/schema'
import { opportunityToRow } from '../lib/db/mappers'
import { SEED_OPPORTUNITIES } from '../lib/demo/seed'

async function main() {
  if (SEED_OPPORTUNITIES.length === 0) {
    console.error('[seed-db] No hay oportunidades semilla. ¿Corriste `pnpm seed` para generar analyses.generated.json?')
    process.exit(1)
  }
  await db.delete(opportunities)
  await db.insert(opportunities).values(SEED_OPPORTUNITIES.map(opportunityToRow))
  console.error(`[seed-db] Insertadas ${SEED_OPPORTUNITIES.length} oportunidades semilla.`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Correr el seed** (requiere `DATABASE_URL` en `.env.local` y la tabla creada en Task 2)

Run: `pnpm seed:db`
Expected: "Insertadas 5 oportunidades semilla."

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-db.ts
git commit -m "feat(db): script pnpm seed:db para poblar la base con los 5 casos §20"
```

---

### Task 7: Pasar Pipeline a Server Component + acciones

**Files:**
- Modify: `app/pipeline/page.tsx`
- Modify: `components/pipeline/pipeline-board.tsx`
- Modify: `components/pipeline/opportunity-row.tsx`

**Interfaces:**
- Consumes: `listOpportunities` (`@/lib/db/queries`), `setOpportunityStateAction` (`@/lib/db/actions`).
- Produces: `PipelineBoard` ahora recibe `{ list: DemoOpportunity[] }` por props (sin hook).

- [ ] **Step 1: `app/pipeline/page.tsx` → Server Component que carga la lista**

```tsx
// app/pipeline/page.tsx
import { listOpportunities } from '@/lib/db/queries'
import { PipelineBoard } from '@/components/pipeline/pipeline-board'

export default async function PipelinePage() {
  const list = await listOpportunities()
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Pipeline de oportunidades</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Ciclo de vida de cada oportunidad — de detectada a aprobada o descartada.
      </p>
      <PipelineBoard list={list} />
    </main>
  )
}
```

- [ ] **Step 2: `components/pipeline/pipeline-board.tsx` → presentational por props**

```tsx
// components/pipeline/pipeline-board.tsx
import type { DemoOpportunity } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { PIPELINE_STATE_META } from '@/lib/ui/format'
import { OpportunityRow } from './opportunity-row'

export function PipelineBoard({ list }: { list: DemoOpportunity[] }) {
  return (
    <div className="flex flex-col gap-6">
      {PIPELINE_STATES.map((state) => {
        const items = list.filter((o) => o.state === state)
        if (items.length === 0) return null
        return (
          <section key={state} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold" style={{ color: PIPELINE_STATE_META[state].color }}>
              {PIPELINE_STATE_META[state].label}
              <span className="ml-2 text-muted-foreground">({items.length})</span>
            </h2>
            {items.map((o) => <OpportunityRow key={o.analysis.opportunity_id} o={o} />)}
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: `components/pipeline/opportunity-row.tsx` → action + refresh**

Reemplazar el import del store y el `onChange`. Archivo completo:
```tsx
// components/pipeline/opportunity-row.tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { setOpportunityStateAction } from '@/lib/db/actions'
import { SEMAFORO_META, PIPELINE_STATE_META, formatCurrency, daysRemaining } from '@/lib/ui/format'

export function OpportunityRow({ o }: { o: DemoOpportunity }) {
  const a = o.analysis
  const sem = SEMAFORO_META[a.semaforo]
  const days = daysRemaining(a.deadline.date)
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/oportunidad/${a.opportunity_id}`} className="font-medium hover:underline">
          {a.source.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span style={{ color: sem.color }}>● {sem.label}</span>
          <span>· {a.overall_score}/100</span>
          {days != null && <span>· ⏳ {days} días</span>}
          {a.funding_amount.value != null && (
            <span>· 💰 {formatCurrency(a.funding_amount.value, a.funding_amount.currency)}</span>
          )}
        </div>
      </div>
      <select
        value={o.state}
        disabled={pending}
        onChange={(e) => {
          const s = e.target.value as PipelineState
          start(async () => { await setOpportunityStateAction(a.opportunity_id, s); router.refresh() })
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        style={{ color: PIPELINE_STATE_META[o.state].color }}
      >
        {PIPELINE_STATES.map((s) => (
          <option key={s} value={s}>{PIPELINE_STATE_META[s].label}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 4: Verificar typecheck y pipeline en el navegador**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm dev` y abrir `/pipeline`
Expected: se ven los 5 casos por estado; cambiar el estado en un `select` persiste tras refrescar la página (F5).

- [ ] **Step 5: Commit**

```bash
git add app/pipeline/page.tsx components/pipeline/pipeline-board.tsx components/pipeline/opportunity-row.tsx
git commit -m "feat(pipeline): leer de Postgres (server component) y mutar vía server action"
```

---

### Task 8: Pasar Dashboard a Server Component

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/dashboard/dashboard-view.tsx`

**Interfaces:**
- Consumes: `listOpportunities` (`@/lib/db/queries`).
- Produces: `DashboardView` ahora recibe `{ list: DemoOpportunity[]; now: number }` por props (sin hook ni `useEffect`).

- [ ] **Step 1: `app/dashboard/page.tsx` → Server Component**

```tsx
// app/dashboard/page.tsx
import { listOpportunities } from '@/lib/db/queries'
import { DashboardView } from '@/components/dashboard/dashboard-view'

export default async function DashboardPage() {
  const list = await listOpportunities()
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Dashboard ejecutivo</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Qué apareció, qué vale la pena, qué requiere acción y qué riesgos hay.
      </p>
      <DashboardView list={list} now={Date.now()} />
    </main>
  )
}
```

- [ ] **Step 2: `components/dashboard/dashboard-view.tsx` → presentational por props**

Cambiar las primeras líneas (quitar `'use client'`, el import del store, `useEffect`/`useState`) y la firma. El JSX del `return` queda **igual** (de la línea `return (` en adelante, sin cambios). Cabecera nueva:
```tsx
// components/dashboard/dashboard-view.tsx
import Link from 'next/link'
import type { DemoOpportunity } from '@/lib/demo/types'
import {
  newOpportunities, pipelineByState, topToApply, criticalRisks,
  requiredAllies, potentialResources, actionsToday,
} from '@/lib/demo/dashboard'
import { PIPELINE_STATE_META, formatCurrency } from '@/lib/ui/format'
import { WidgetCard } from './widget-card'

export function DashboardView({ list, now }: { list: DemoOpportunity[]; now: number }) {
  const nuevas = newOpportunities(list, now, 72)
  const buckets = pipelineByState(list)
  const top = topToApply(list, 5)
  const riesgos = criticalRisks(list)
  const aliados = requiredAllies(list)
  const recursos = potentialResources(list)
  const acciones = actionsToday(list, now)

  return (
    // ... (el mismo JSX que ya existe, sin cambios) ...
  )
}
```

> Importante: no tocar el bloque JSX existente (widgets). Solo se reemplazan las líneas 1–25 actuales por la cabecera de arriba.

- [ ] **Step 3: Verificar typecheck y dashboard en el navegador**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm dev` y abrir `/dashboard`
Expected: los 7 widgets muestran números coherentes con la semilla; "Top para aplicar" linkea a `/oportunidad/[id]`.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx components/dashboard/dashboard-view.tsx
git commit -m "feat(dashboard): calcular widgets desde Postgres (server component)"
```

---

### Task 9: Pasar Detalle de oportunidad a Server Component + acciones

**Files:**
- Modify: `app/oportunidad/[id]/page.tsx`
- Modify: `components/pipeline/state-control.tsx`
- Modify: `components/pipeline/task-list.tsx`

**Interfaces:**
- Consumes: `getOpportunity` (`@/lib/db/queries`), `setOpportunityStateAction` y `toggleOpportunityTaskAction` (`@/lib/db/actions`).

- [ ] **Step 1: `app/oportunidad/[id]/page.tsx` → Server Component async**

```tsx
// app/oportunidad/[id]/page.tsx
import { notFound } from 'next/navigation'
import { getOpportunity } from '@/lib/db/queries'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await getOpportunity(id)
  if (!o) return notFound()

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <TaskList o={o} />
    </main>
  )
}
```

- [ ] **Step 2: `components/pipeline/state-control.tsx` → action + refresh**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { setOpportunityStateAction } from '@/lib/db/actions'
import { PIPELINE_STATE_META } from '@/lib/ui/format'

export function StateControl({ o }: { o: DemoOpportunity }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Estado:</span>
      <select
        value={o.state}
        disabled={pending}
        onChange={(e) => {
          const s = e.target.value as PipelineState
          start(async () => { await setOpportunityStateAction(o.analysis.opportunity_id, s); router.refresh() })
        }}
        className="rounded-md border border-border bg-background px-2 py-1"
        style={{ color: PIPELINE_STATE_META[o.state].color }}
      >
        {PIPELINE_STATES.map((s) => (
          <option key={s} value={s}>{PIPELINE_STATE_META[s].label}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 3: `components/pipeline/task-list.tsx` → action + refresh**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { DemoOpportunity } from '@/lib/demo/types'
import { toggleOpportunityTaskAction } from '@/lib/db/actions'
import { Card } from '@/components/ui/card'

export function TaskList({ o }: { o: DemoOpportunity }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tareas</p>
      <ul className="flex flex-col gap-2">
        {o.tasks.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.done}
              disabled={pending}
              onChange={() => start(async () => { await toggleOpportunityTaskAction(o.analysis.opportunity_id, i); router.refresh() })}
              className="mt-1"
            />
            <span className={t.done ? 'text-muted-foreground line-through' : ''}>
              {t.action}
              <span className="text-muted-foreground"> · {t.responsible}{t.due_date ? ` · ${t.due_date.slice(0, 10)}` : ''}</span>
            </span>
          </li>
        ))}
        {o.tasks.length === 0 && <li className="text-sm text-muted-foreground">Sin tareas.</li>}
      </ul>
    </Card>
  )
}
```

- [ ] **Step 4: Verificar typecheck y detalle en el navegador**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm dev`, abrir una oportunidad desde `/pipeline`
Expected: cambiar estado y tildar tareas persiste tras refrescar.

- [ ] **Step 5: Commit**

```bash
git add app/oportunidad/[id]/page.tsx components/pipeline/state-control.tsx components/pipeline/task-list.tsx
git commit -m "feat(detalle): leer de Postgres y mutar estado/tareas vía server actions"
```

---

### Task 10: Conectar el analizador y el botón "Reiniciar demo"

**Files:**
- Modify: `app/page.tsx` (línea 48 y su import)
- Modify: `components/nav-header.tsx`

**Interfaces:**
- Consumes: `addOpportunityAction`, `resetDemoAction` (`@/lib/db/actions`).

- [ ] **Step 1: `app/page.tsx` — guardar el análisis vía action**

Reemplazar el import del store (cerca del tope del archivo):
```tsx
// ELIMINAR: import { demoStore } from '@/lib/demo/use-store'
import { addOpportunityAction } from '@/lib/db/actions'
```
Y en `run()` reemplazar la línea 48:
```tsx
// ANTES: demoStore.add(result.analysis)
await addOpportunityAction(result.analysis)
```

- [ ] **Step 2: `components/nav-header.tsx` — reset vía action + refresh**

Cabecera (reemplaza el import del store) y el `onClick` del botón:
```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { resetDemoAction } from '@/lib/db/actions'
```
Dentro de `NavHeader()`, agregar antes del `return`:
```tsx
  const router = useRouter()
  const [, startReset] = useTransition()
```
Y el botón:
```tsx
        <button
          type="button"
          onClick={() => {
            if (confirm('¿Reiniciar la demo al estado inicial?')) {
              startReset(async () => { await resetDemoAction(); router.refresh() })
            }
          }}
          className="ml-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Reiniciar demo
        </button>
```

- [ ] **Step 3: Verificar typecheck y flujo completo**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm dev`, analizar un fixture en `/`, luego ir a `/pipeline`
Expected: la nueva oportunidad aparece; "Reiniciar demo" vuelve a la semilla.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/nav-header.tsx
git commit -m "feat(app): analizador y reset usan server actions sobre Postgres"
```

---

### Task 11: Eliminar el store de localStorage y verificación final

**Files:**
- Delete: `lib/demo/store.ts`, `lib/demo/store.test.ts`, `lib/demo/use-store.ts`

**Interfaces:**
- Ningún consumidor debe quedar importando `@/lib/demo/use-store` ni `@/lib/demo/store` (verificado por grep).

- [ ] **Step 1: Confirmar que no quedan referencias al store**

Run: `grep -rn "use-store\|demo/store\|demoStore\|useOpportunit" app components lib | grep -v "lib/db/"`
Expected: **sin resultados** (si aparece algo, corregir ese archivo a usar queries/actions antes de borrar).

- [ ] **Step 2: Borrar los archivos del store**

Run:
```bash
git rm lib/demo/store.ts lib/demo/store.test.ts lib/demo/use-store.ts
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Suite completa** (con DB de prueba para ejercitar integración)

Run: `DATABASE_URL=<tu-string-de-prueba> pnpm test`
Expected: todos verdes. Sin `DATABASE_URL`, los tests de `queries`/`actions` se saltan y el resto pasa.

- [ ] **Step 5: Build de producción**

Run: `pnpm build`
Expected: compila sin errores (las páginas `/pipeline`, `/dashboard`, `/oportunidad/[id]` quedan dinámicas por leer de DB).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(demo): eliminar store localStorage; persistencia 100% en Postgres"
```

---

## Self-Review

**Spec coverage:**
- Postgres + Drizzle → Tasks 1–2. ✅
- pgvector / Auth / Storage → fuera de Fase A por diseño (Global Constraints + spec "fuera de alcance"). ✅ (no son requisito de esta fase)
- Reemplazo de `lib/demo/` (store) por `lib/db/` manteniendo pantallas → Tasks 4–11. ✅
- Modelo §15 (Oportunidad) con `analysis` JSONB → Task 2. ✅ (otras tablas: fases siguientes, por YAGNI)
- Seed real a la base → Task 6. ✅
- Flujo de una oportunidad (analizar → guardar → pipeline/dashboard → tareas) → Tasks 7–10. ✅
- Manejo de errores: si falla el análisis, no se llama la action (Task 10 conserva el `try/catch` existente); mutaciones son atómicas por sentencia. ✅
- Testing: mappers (puro) + queries/actions (integración) → Tasks 3–5. ✅

**Placeholder scan:** Sin TBD/TODO. El único "// ... mismo JSX ..." (Task 8 Step 2) refiere explícitamente a no tocar bloque existente del archivo abierto, con instrucción precisa de qué líneas reemplazar. ✅

**Type consistency:** `DemoOpportunity`/`DemoTask`/`PipelineState` siempre desde `@/lib/demo/types`. Acciones con sufijo `Action` (sin colisión con `lib/demo/operations.ts`). `rowToOpportunity`/`opportunityToRow`, `listOpportunities`/`getOpportunity`, `addOpportunityAction`/`setOpportunityStateAction`/`toggleOpportunityTaskAction`/`resetDemoAction` usadas con la misma firma en todas las tareas. ✅
