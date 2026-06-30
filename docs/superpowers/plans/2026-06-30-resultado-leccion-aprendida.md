# Resultado → lección aprendida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar el resultado (ganada/perdida/otro) y la lección de una postulación, sincronizar el estado del pipeline en un gesto, y anexar la lección al `lessonsLearned` del financiador matcheado (que ya alimenta el prompt de análisis).

**Architecture:** Extiende la tabla `submissions` con campos de resultado; un módulo PURO (`lib/agent/tracking/lessons.ts`) mapea resultado→estado y formatea/anexa la lección; dos server actions (`recordOutcomeAction`, `saveLessonToFunderAction`) sobre `submission-actions.ts`; una sección de UI en el detalle. Reusa `updateFunderAction`/`matchFunder`/`rowToProfile`/`listFunders`. No toca el análisis ni el pipeline.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions, `force-dynamic`), React 19, Drizzle ORM sobre Supabase Postgres (postgres-js, `prepare:false`), Vitest, tsx.

## Global Constraints

- **Mentalidad: PRODUCTO, no demo.**
- **Sin variables de entorno ni credenciales nuevas.**
- Lógica pura y total con `today: Date` inyectado (sin `Date.now()`/argless `new Date()` dentro de la lógica).
- `resultado`: uno de `'ganada' | 'perdida' | 'otro'`. Mapeo a estado: ganada→`aprobada`, perdida→`rechazada`, otro→sin cambio.
- Tests de integración: `describe.skipIf(!process.env.DATABASE_URL)`, individuales con `DATABASE_URL` inline; **nunca** `pnpm test -- <file>`.
- `submissions.id` es FK a `opportunities(id)`: los tests insertan una oportunidad padre (`opportunityToRow(makeOpportunity(...))`). Para el match de financiador, insertar un `funders` con alias que aparezca en el análisis.
- **`pnpm db:push` cuelga con el pooler.** Migración Task 1 con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` vía script throwaway (`postgres` directo) + verificación `information_schema`, borrar antes de commitear.
- Acciones de servidor en `'use server'`; queries por Drizzle (parametrizadas, sin interpolación de strings).
- Patrón de error product-grade en el cliente: cada llamada a action en `useTransition` envuelta en try/catch con feedback inline (mismo patrón que `submission-section.tsx`).
- Mantener verde la suite y typecheck limpio; `pnpm build` con el detalle dinámico.

---

### Task 1: Extender `submissions` (resultado + lección)

**Files:**
- Modify: `lib/db/schema.ts` (import + bloque `submissions`)
- Throwaway (crear, aplicar, **borrar antes de commit**): `scripts/apply-outcome-migration.ts`

**Interfaces:**
- Consumes: tabla `submissions` existente.
- Produces: columnas nuevas en `submissions` y tipos `SubmissionRow`/`NewSubmissionRow` extendidos con
  `resultado: 'ganada'|'perdida'|'otro'|null; montoOtorgado: string|null; leccion: string|null; leccionAnexada: boolean`.

- [ ] **Step 1: Agregar `boolean` al import de drizzle**

En `lib/db/schema.ts`, línea 1, agregá `boolean`:

```ts
import { pgTable, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
```

- [ ] **Step 2: Agregar las 4 columnas a la tabla `submissions`**

En el bloque `export const submissions = pgTable('submissions', { ... })`, insertá estas líneas
**después de** `notas: text('notas'),` y **antes de** `updatedAt: ...`:

```ts
  resultado: text('resultado').$type<'ganada' | 'perdida' | 'otro'>(),
  montoOtorgado: text('monto_otorgado'),
  leccion: text('leccion'),
  leccionAnexada: boolean('leccion_anexada').notNull().default(false),
```

(Los tipos `SubmissionRow`/`NewSubmissionRow` se infieren solos; no hay que tocarlos.)

- [ ] **Step 3: Verificar typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Crear el script throwaway de migración**

Crear `scripts/apply-outcome-migration.ts`:

```ts
import '../lib/load-env'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida')
  const sql = postgres(url, { prepare: false })
  await sql`
    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS resultado text,
      ADD COLUMN IF NOT EXISTS monto_otorgado text,
      ADD COLUMN IF NOT EXISTS leccion text,
      ADD COLUMN IF NOT EXISTS leccion_anexada boolean NOT NULL DEFAULT false;
  `
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'submissions' ORDER BY column_name;
  `
  console.error('[apply-outcome-migration] columnas:', cols.map((c) => c.column_name).join(', '))
  await sql.end()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 5: Aplicar y verificar la migración**

Run: `pnpm exec tsx scripts/apply-outcome-migration.ts`
Expected: imprime `[apply-outcome-migration] columnas: fecha_presentacion, fecha_resultado_esp, id, leccion, leccion_anexada, monto_otorgado, notas, proximo_hito, proximo_hito_fecha, radicado, resultado, updated_at`

- [ ] **Step 6: Borrar el script throwaway**

Run: `rm scripts/apply-outcome-migration.ts`
Expected: ya no existe (no se commitea).

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(leccion): extiende submissions con resultado/monto/leccion (schema + migración)"
```

---

### Task 2: Módulo puro `lib/agent/tracking/lessons.ts`

**Files:**
- Create: `lib/agent/tracking/lessons.ts`
- Test: `lib/agent/tracking/lessons.test.ts`

**Interfaces:**
- Consumes: `PipelineState` (tipo de `@/lib/demo/types`).
- Produces:
  - `type Resultado = 'ganada' | 'perdida' | 'otro'`
  - `function stateForResultado(r: Resultado): PipelineState | null`
  - `function appendLesson(existing: string | null, leccion: string, today: Date): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/agent/tracking/lessons.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { stateForResultado, appendLesson } from './lessons'

const today = new Date('2026-06-30T12:00:00Z')

describe('stateForResultado', () => {
  it('mapea ganada→aprobada, perdida→rechazada, otro→null', () => {
    expect(stateForResultado('ganada')).toBe('aprobada')
    expect(stateForResultado('perdida')).toBe('rechazada')
    expect(stateForResultado('otro')).toBeNull()
  })
})

describe('appendLesson', () => {
  it('crea la primera entrada cuando no hay texto previo', () => {
    expect(appendLesson(null, 'faltó socio local', today)).toBe('- [2026-06-30] faltó socio local')
    expect(appendLesson('   ', 'otra', today)).toBe('- [2026-06-30] otra')
  })

  it('anexa preservando el texto previo', () => {
    expect(appendLesson('- [2026-01-01] vieja', 'nueva', today)).toBe('- [2026-01-01] vieja\n- [2026-06-30] nueva')
  })

  it('lección vacía o en blanco → devuelve el texto previo sin cambios', () => {
    expect(appendLesson('algo', '   ', today)).toBe('algo')
    expect(appendLesson(null, '', today)).toBe('')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test lib/agent/tracking/lessons.test.ts`
Expected: FAIL con "Failed to resolve import './lessons'".

- [ ] **Step 3: Implementar el módulo**

Crear `lib/agent/tracking/lessons.ts`:

```ts
import type { PipelineState } from '@/lib/demo/types'

export type Resultado = 'ganada' | 'perdida' | 'otro'

export function stateForResultado(r: Resultado): PipelineState | null {
  if (r === 'ganada') return 'aprobada'
  if (r === 'perdida') return 'rechazada'
  return null
}

// Anexa "- [YYYY-MM-DD] <leccion>" al texto existente (o lo crea). today inyectado → testeable.
export function appendLesson(existing: string | null, leccion: string, today: Date): string {
  const trimmed = leccion.trim()
  const base = (existing ?? '').trim()
  if (!trimmed) return base
  const date = today.toISOString().slice(0, 10)
  const entry = `- [${date}] ${trimmed}`
  return base ? `${base}\n${entry}` : entry
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test lib/agent/tracking/lessons.test.ts`
Expected: PASS (3 describe, output pristine).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/tracking/lessons.ts lib/agent/tracking/lessons.test.ts
git commit -m "feat(leccion): módulo puro stateForResultado/appendLesson"
```

---

### Task 3: Actions `recordOutcomeAction` + `saveLessonToFunderAction`

**Files:**
- Modify: `lib/db/submission-actions.ts`
- Modify: `lib/db/submission-actions.test.ts`

**Interfaces:**
- Consumes: `submissions`, `opportunities` (schema); `Resultado`, `stateForResultado`, `appendLesson` (Task 2);
  `getOpportunity` (`@/lib/db/queries`); `getSubmission` (`./submissions`); `listFunders`, `rowToProfile` (`./funders`);
  `matchFunder` (`@/lib/agent/funder-match`); `updateFunderAction` (`./funder-actions`).
- Produces:
  - `recordOutcomeAction(opportunityId: string, outcome: { resultado: Resultado | null; montoOtorgado: string | null; leccion: string | null }): Promise<void>`
  - `saveLessonToFunderAction(opportunityId: string): Promise<{ status: 'anexada' | 'sin_financiador' | 'sin_leccion' }>`

- [ ] **Step 1: Escribir los tests que fallan**

En `lib/db/submission-actions.test.ts`, reemplazá el bloque de imports superior y agregá los nuevos
casos. El archivo completo queda así:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { submissions, opportunities, funders } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { getSubmission } from './submissions'
import { getOpportunity } from './queries'
import { getFunder } from './funders'
import { saveSubmissionAction, recordOutcomeAction, saveLessonToFunderAction } from './submission-actions'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-sa', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis
const analysisFao = { opportunity_id: 'op-out', source: { name: 'FAO AgrInnovation' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('submission actions (integración)', () => {
  beforeEach(async () => { await db.delete(submissions); await db.delete(opportunities); await db.delete(funders) })

  it('upsert: crea y luego actualiza por id', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))

    await saveSubmissionAction('op-sa', { radicado: 'R-1', fechaPresentacion: '2026-06-15' })
    expect((await getSubmission('op-sa'))?.radicado).toBe('R-1')

    await saveSubmissionAction('op-sa', { radicado: 'R-2', proximoHito: 'sustentación' })
    const got = await getSubmission('op-sa')
    expect(got?.radicado).toBe('R-2')
    expect(got?.proximoHito).toBe('sustentación')
  })

  it('recordOutcomeAction guarda el resultado y sincroniza el estado', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordOutcomeAction('op-sa', { resultado: 'ganada', montoOtorgado: 'USD 100k', leccion: 'buena alianza' })
    const sub = await getSubmission('op-sa')
    expect(sub?.resultado).toBe('ganada')
    expect(sub?.montoOtorgado).toBe('USD 100k')
    expect((await getOpportunity('op-sa'))?.state).toBe('aprobada')
  })

  it('saveLessonToFunderAction anexa la lección al financiador matcheado y marca el flag', async () => {
    await db.insert(funders).values({ id: 'fao', name: 'FAO', aliases: ['FAO'] })
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysisFao, new Date().toISOString())))
    await recordOutcomeAction('op-out', { resultado: 'perdida', montoOtorgado: null, leccion: 'faltó socio local' })

    const res = await saveLessonToFunderAction('op-out')
    expect(res.status).toBe('anexada')
    expect((await getFunder('fao'))?.lessonsLearned).toContain('faltó socio local')
    expect((await getSubmission('op-out'))?.leccionAnexada).toBe(true)
  })

  it('saveLessonToFunderAction sin lección → sin_leccion', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    expect((await saveLessonToFunderAction('op-sa')).status).toBe('sin_leccion')
  })

  it('saveLessonToFunderAction sin financiador matcheado → sin_financiador', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordOutcomeAction('op-sa', { resultado: 'otro', montoOtorgado: null, leccion: 'algo aprendí' })
    expect((await saveLessonToFunderAction('op-sa')).status).toBe('sin_financiador')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submission-actions.test.ts`
Expected: FAIL — `recordOutcomeAction`/`saveLessonToFunderAction` no exportadas (o import error).

- [ ] **Step 3: Implementar las actions**

Reescribir `lib/db/submission-actions.ts` (mantiene `saveSubmissionAction` y agrega las dos nuevas):

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { submissions, opportunities } from './schema'
import type { NewSubmissionRow } from './schema'
import { getOpportunity } from './queries'
import { getSubmission } from './submissions'
import { listFunders, rowToProfile } from './funders'
import { updateFunderAction } from './funder-actions'
import { matchFunder } from '@/lib/agent/funder-match'
import { stateForResultado, appendLesson, type Resultado } from '@/lib/agent/tracking/lessons'

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

export async function recordOutcomeAction(
  opportunityId: string,
  outcome: { resultado: Resultado | null; montoOtorgado: string | null; leccion: string | null },
): Promise<void> {
  const patch = { resultado: outcome.resultado, montoOtorgado: outcome.montoOtorgado, leccion: outcome.leccion }
  await db.insert(submissions).values({ id: opportunityId, ...patch })
    .onConflictDoUpdate({ target: submissions.id, set: { ...patch, updatedAt: new Date() } })
  if (outcome.resultado) {
    const state = stateForResultado(outcome.resultado)
    if (state) await db.update(opportunities).set({ state }).where(eq(opportunities.id, opportunityId))
  }
  revalidatePath('/seguimiento')
  revalidatePath('/dashboard')
  revalidatePath('/pipeline')
  revalidatePath(`/oportunidad/${opportunityId}`)
}

export async function saveLessonToFunderAction(
  opportunityId: string,
): Promise<{ status: 'anexada' | 'sin_financiador' | 'sin_leccion' }> {
  const o = await getOpportunity(opportunityId)
  const sub = await getSubmission(opportunityId)
  const leccion = sub?.leccion?.trim()
  if (!o || !leccion) return { status: 'sin_leccion' }

  const rows = await listFunders()
  const matched = matchFunder(JSON.stringify(o.analysis), rows.map(rowToProfile))
  if (!matched) return { status: 'sin_financiador' }
  const row = rows.find((r) => r.name === matched.name)
  if (!row) return { status: 'sin_financiador' }

  await updateFunderAction(row.id, { lessonsLearned: appendLesson(row.lessonsLearned, leccion, new Date()) })
  await db.update(submissions).set({ leccionAnexada: true }).where(eq(submissions.id, opportunityId))
  revalidatePath(`/oportunidad/${opportunityId}`)
  return { status: 'anexada' }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/submission-actions.test.ts`
Expected: PASS (5/5 ejecutados, no skipped).

- [ ] **Step 5: Commit**

```bash
git add lib/db/submission-actions.ts lib/db/submission-actions.test.ts
git commit -m "feat(leccion): recordOutcomeAction (sync estado) + saveLessonToFunderAction (anexa al financiador)"
```

---

### Task 4: Sección "Resultado y lección" en el detalle

**Files:**
- Create: `components/tracking/outcome-section.tsx`
- Modify: `app/oportunidad/[id]/page.tsx`

**Interfaces:**
- Consumes: `recordOutcomeAction`, `saveLessonToFunderAction` (Task 3); `Resultado` (Task 2); `SubmissionRow` (Task 1);
  `submission` ya cargado en el page (slice anterior).
- Produces: componente cliente `OutcomeSection` y su cableado en el detalle.

- [ ] **Step 1: Crear el componente**

Crear `components/tracking/outcome-section.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SubmissionRow } from '@/lib/db/schema'
import type { Resultado } from '@/lib/agent/tracking/lessons'
import { recordOutcomeAction, saveLessonToFunderAction } from '@/lib/db/submission-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const LESSON_STATUS_MSG = {
  anexada: 'Lección anexada al financiador ✓',
  sin_financiador: 'No se identificó un financiador con perfil cargado.',
  sin_leccion: 'Escribí y guardá la lección antes de anexarla.',
} as const

export function OutcomeSection({ opportunityId, submission }: { opportunityId: string; submission: SubmissionRow | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [lessonPending, startLesson] = useTransition()
  const [lessonMsg, setLessonMsg] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const r = String(fd.get('resultado') ?? '').trim()
    const resultado: Resultado | null = (r === 'ganada' || r === 'perdida' || r === 'otro') ? r : null
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    setSaved(false); setSaveError(false)
    start(async () => {
      try {
        await recordOutcomeAction(opportunityId, { resultado, montoOtorgado: text('montoOtorgado'), leccion: text('leccion') })
        router.refresh()
        setSaved(true)
      } catch (err) {
        console.error('[outcome-section] no se pudo guardar el resultado:', err)
        setSaveError(true)
      }
    })
  }

  function anexar() {
    setLessonMsg(null)
    startLesson(async () => {
      try {
        const res = await saveLessonToFunderAction(opportunityId)
        router.refresh()
        setLessonMsg(LESSON_STATUS_MSG[res.status])
      } catch (err) {
        console.error('[outcome-section] no se pudo anexar la lección:', err)
        setLessonMsg('Error al anexar la lección.')
      }
    })
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold">Resultado y lección aprendida</h2>
      <p className="mb-3 text-xs text-muted-foreground">Al marcar ganada/perdida se actualiza el estado. La lección se puede anexar al financiador.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Resultado
          <select name="resultado" defaultValue={submission?.resultado ?? ''}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="">—</option>
            <option value="ganada">Ganada</option>
            <option value="perdida">Perdida</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <input name="montoOtorgado" defaultValue={submission?.montoOtorgado ?? ''} placeholder="Monto otorgado (si ganada)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <textarea name="leccion" defaultValue={submission?.leccion ?? ''} placeholder="Lección aprendida"
          className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar resultado'}</Button>
          {saved && !pending && <span className="text-xs text-muted-foreground">Guardado ✓</span>}
          {saveError && !pending && <span className="text-xs text-red-600">Error al guardar. Reintentá.</span>}
        </div>
      </form>
      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={lessonPending} onClick={anexar}>
          {lessonPending ? 'Anexando…' : 'Guardar lección al financiador'}
        </Button>
        {submission?.leccionAnexada && !lessonMsg && <span className="text-xs text-muted-foreground">Ya anexada al financiador ✓</span>}
        {lessonMsg && <span className="text-xs text-muted-foreground">{lessonMsg}</span>}
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Cablear el detalle**

En `app/oportunidad/[id]/page.tsx`, agregá el import y renderizá `<OutcomeSection>` **después** de
`<SubmissionSection>` y **antes** de `<TaskList>`. Agregá junto a los demás imports:

```tsx
import { OutcomeSection } from '@/components/tracking/outcome-section'
```

Y en el JSX, justo después de la línea `<SubmissionSection opportunityId={id} submission={submission} />`:

```tsx
      <OutcomeSection opportunityId={id} submission={submission} />
```

(El `submission` ya está cargado en el page por el slice anterior; se reusa el mismo fetch.)

- [ ] **Step 3: Verificar typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS (el detalle sigue dinámico).

- [ ] **Step 4: Commit**

```bash
git add components/tracking/outcome-section.tsx app/oportunidad/[id]/page.tsx
git commit -m "feat(leccion): sección Resultado y lección en el detalle"
```

---

## Self-Review

**1. Spec coverage:**
- Extender `submissions` con resultado/montoOtorgado/leccion/leccionAnexada → Task 1 ✓.
- Lógica pura `stateForResultado` + `appendLesson` → Task 2 ✓.
- `recordOutcomeAction` (guarda + sincroniza estado, ganada→aprobada/perdida→rechazada/otro→sin cambio) → Task 3 ✓.
- `saveLessonToFunderAction` (matchFunder → append a lessonsLearned → flag; status anexada/sin_financiador/sin_leccion) → Task 3 ✓.
- UI `OutcomeSection` en el detalle con try/catch product-grade → Task 4 ✓.
- Testing (puro + integración extendida) y build → cubierto ✓.
- Sin env nuevas → respetado ✓.
- Fuera de alcance (tabla lessons §15, widget win-rate, editar lección anexada) → no incluidos ✓.

**2. Placeholder scan:** Sin TBD/TODO. Código completo y literal.

**3. Type consistency:**
- `Resultado` definido en Task 2, consumido en Task 3 (action) y Task 4 (UI) con el mismo literal-union.
- `recordOutcomeAction(opportunityId, { resultado, montoOtorgado, leccion })` y `saveLessonToFunderAction(opportunityId): Promise<{ status }>` — firmas idénticas entre Task 3 (def) y Task 4 (consumo).
- Columnas snake_case de la migración (Task 1 Step 4) coinciden con el mapeo Drizzle (Task 1 Step 2): `monto_otorgado`/`leccion`/`leccion_anexada`/`resultado`.
- `appendLesson(existing, leccion, today)` y `stateForResultado(r)` — firmas idénticas entre Task 2 (def) y Task 3 (consumo).
- El status `{ 'anexada'|'sin_financiador'|'sin_leccion' }` de Task 3 coincide con las claves de `LESSON_STATUS_MSG` en Task 4.
