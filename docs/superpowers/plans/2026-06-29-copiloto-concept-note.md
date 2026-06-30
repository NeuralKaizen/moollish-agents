# Copiloto de formulación §13 — Concept Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar on-demand un borrador de Concept Note (§13) para una oportunidad, con guardrail (borrador / no inventar / citar evidencia / datos faltantes), guardado en una tabla `drafts` y mostrado en el detalle de la oportunidad.

**Architecture:** Generador puro-testeable (`generateConceptNote` con `generate` inyectado; impl real con AI SDK `Output.object`) sobre el análisis ya guardado + el `funderBlock` del financiador (§11). Tabla `drafts` (un vigente por tipo, upsert). Server action wirea getOpportunity → match financiador → generador → recordDraft. UI on-demand en el detalle.

**Tech Stack:** Next.js 16 (Server Component + Server Action), Drizzle + Supabase Postgres, AI SDK + OpenRouter, Vitest.

## Global Constraints

- **Producto, no demo** (memoria `building-product-not-demo`).
- **On-demand** (botón en el detalle), nunca automático.
- **Un borrador vigente por (oportunidad, tipo)**: `id = '<opportunityId>:concept_note'`, `recordDraft` hace `onConflictDoUpdate` → **regenerar reemplaza** (sin historial).
- **Trabaja sobre el análisis ya guardado** (`o.analysis`), NO re-scrapea.
- **Guardrail §13 (obligatorio en el prompt)**: marcar BORRADOR, NO inventar requisitos/fechas/montos/condiciones no presentes en la fuente, usar/citar la evidencia del análisis, y listar lo ausente en `missing_data`.
- **Generador inyectable**: `generateConceptNote(analysis, funderBlock, deps)` con `deps.generate(prompt, model)` → testeable sin LLM (mismo patrón que `analyzeOpportunity`).
- Reusar: match de financiador (`listFunders`/`rowToProfile`/`matchFunder`/`formatFunderBlock`), `getOpportunity`, AI SDK/OpenRouter (`createOpenRouter`, `generateText`, `Output`), `DEFAULT_MODEL`.
- `pnpm db:push` se cuelga en el pooler → aplicar la migración vía cliente `postgres` directo + verificar (workaround usado en features previas).
- Tests de DB con `describe.skipIf(!process.env.DATABASE_URL)`; correr individual con `DATABASE_URL` exportada (`pnpm test <archivo>`, SIN `--`).
- Mantener verde la suite (156 tests) y `pnpm typecheck` limpio.

## Prerequisitos
Ninguna credencial nueva (usa `OPENROUTER_API_KEY` + `DATABASE_URL` existentes).

---

### Task 1: Tabla `drafts` + migración

**Files:**
- Modify: `lib/db/schema.ts`
- Create (generado): `drizzle/*.sql`

**Interfaces:**
- Produces: tabla `drafts`; tipos `DraftRow`, `NewDraftRow`.

- [ ] **Step 1: Agregar la tabla a `lib/db/schema.ts`** (al final)

```ts
export const drafts = pgTable('drafts', {
  id: text('id').primaryKey(), // '<opportunityId>:<kind>' — un vigente por tipo
  opportunityId: text('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'concept_note'
  content: jsonb('content').notNull(),
  missingData: jsonb('missing_data').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DraftRow = typeof drafts.$inferSelect
export type NewDraftRow = typeof drafts.$inferInsert
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Generar la migración**

Run: `pnpm db:generate`
Expected: nuevo `drizzle/*.sql` con `CREATE TABLE "drafts"` + FK a opportunities.

- [ ] **Step 4: Aplicar a Supabase**

Run: `pnpm db:push`. **Si se cuelga** en "Pulling schema" (pooler), aplicar el `CREATE TABLE`/`ALTER TABLE` del archivo generado directo vía un snippet `tsx` con el cliente `postgres` (leyendo DATABASE_URL con `import '../lib/load-env'`), y verificar con `information_schema.columns` que `drafts` tiene sus 6 columnas. Borrar el snippet antes de commitear. Documentar la vía usada.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): tabla drafts (copiloto de formulación §13)"
```

---

### Task 2: Queries de `drafts`

**Files:**
- Create: `lib/db/drafts.ts`
- Test: `lib/db/drafts.test.ts`

**Interfaces:**
- Consumes: `db`, `drafts`, `DraftRow`, `NewDraftRow` (de `@/lib/db/*`); `opportunities`, `opportunityToRow` + `makeOpportunity` (en el test, para la FK).
- Produces:
  - `recordDraft(row: NewDraftRow): Promise<void>` (insert `onConflictDoUpdate` target id → regenerar reemplaza content/missingData/createdAt)
  - `getDraft(opportunityId: string, kind: string): Promise<DraftRow | undefined>`

> Integración: `describe.skipIf(!process.env.DATABASE_URL)`; limpia `drafts` + `opportunities` en `beforeEach` (FK).

- [ ] **Step 1: Escribir el test**

```ts
// lib/db/drafts.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { drafts, opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { recordDraft, getDraft } from './drafts'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const hasDb = !!process.env.DATABASE_URL
const analysis = { opportunity_id: 'op-cn', source: { name: 'X' }, next_actions: [] } as unknown as OpportunityAnalysis

describe.skipIf(!hasDb)('drafts queries (integración)', () => {
  beforeEach(async () => { await db.delete(drafts); await db.delete(opportunities) })

  it('recordDraft inserta y getDraft lo recupera; regenerar reemplaza', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: { problema: 'A' }, missingData: ['x'] })
    let d = await getDraft('op-cn', 'concept_note')
    expect((d?.content as { problema?: string }).problema).toBe('A')

    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: { problema: 'B' }, missingData: [] })
    d = await getDraft('op-cn', 'concept_note')
    expect((d?.content as { problema?: string }).problema).toBe('B') // reemplazado
    expect(d?.missingData).toEqual([])
  })

  it('getDraft devuelve undefined si no existe', async () => {
    expect(await getDraft('nope', 'concept_note')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/drafts.test.ts`
Expected: FAIL ("recordDraft is not a function").

- [ ] **Step 3: Implementar `lib/db/drafts.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { db } from './client'
import { drafts, type DraftRow, type NewDraftRow } from './schema'

export async function recordDraft(row: NewDraftRow): Promise<void> {
  await db.insert(drafts).values(row)
    .onConflictDoUpdate({
      target: drafts.id,
      set: { content: row.content, missingData: row.missingData, createdAt: new Date() },
    })
}

export async function getDraft(opportunityId: string, kind: string): Promise<DraftRow | undefined> {
  const rows = await db.select().from(drafts)
    .where(and(eq(drafts.opportunityId, opportunityId), eq(drafts.kind, kind)))
    .limit(1)
  return rows[0]
}
```

- [ ] **Step 4: Run → pass**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/drafts.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add lib/db/drafts.ts lib/db/drafts.test.ts
git commit -m "feat(db): queries recordDraft/getDraft (upsert por tipo)"
```

---

### Task 3: Generador de Concept Note

**Files:**
- Create: `lib/agent/drafts/concept-note.ts`
- Test: `lib/agent/drafts/concept-note.test.ts`

**Interfaces:**
- Consumes: `OpportunityAnalysis` (`@/lib/agent/schema`), `DEFAULT_MODEL` (`@/lib/agent/config`).
- Produces:
  - `ConceptNoteSchema` (Zod) y `type ConceptNote = { problema: string; solucion: string; beneficiarios: string; innovacion: string; resultados: string; presupuesto_marco: string; missing_data: string[] }`
  - `type ConceptNoteGenerator = (prompt: string, model: string) => Promise<ConceptNote>`
  - `buildConceptNotePrompt(analysis: OpportunityAnalysis, funderBlock: string): string`
  - `generateConceptNote(analysis: OpportunityAnalysis, funderBlock: string, deps: { generate: ConceptNoteGenerator; model?: string }): Promise<ConceptNote>`
  - `generateConceptNoteWithOpenRouter(prompt: string, model: string): Promise<ConceptNote>`

- [ ] **Step 1: Escribir el test**

```ts
// lib/agent/drafts/concept-note.test.ts
import { describe, it, expect } from 'vitest'
import { buildConceptNotePrompt, generateConceptNote, ConceptNoteSchema } from './concept-note'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const analysis = {
  opportunity_id: 'op-1',
  source: { name: 'FAO AgrInnovation' },
  draft_outputs: { executive_summary: 'Fondo para agricultura resiliente.' },
} as unknown as OpportunityAnalysis

const stub = { problema: 'P', solucion: 'S', beneficiarios: 'B', innovacion: 'I', resultados: 'R', presupuesto_marco: 'PM', missing_data: ['monto exacto'] }

describe('concept-note generator', () => {
  it('buildConceptNotePrompt incluye el guardrail y el contexto del análisis', () => {
    const p = buildConceptNotePrompt(analysis, 'PERFIL: FAO')
    expect(p.toLowerCase()).toContain('borrador')
    expect(p.toLowerCase()).toContain('no inventar')
    expect(p).toContain('FAO AgrInnovation') // del análisis serializado
    expect(p).toContain('PERFIL: FAO')        // funderBlock inyectado
  })

  it('generateConceptNote llama a generate con el prompt y devuelve el ConceptNote', async () => {
    let receivedPrompt = ''
    const result = await generateConceptNote(analysis, 'PERFIL: FAO', {
      generate: async (prompt) => { receivedPrompt = prompt; return stub },
    })
    expect(result).toEqual(stub)
    expect(receivedPrompt.toLowerCase()).toContain('no inventar')
  })

  it('ConceptNoteSchema valida las 6 secciones + missing_data', () => {
    expect(ConceptNoteSchema.parse(stub).problema).toBe('P')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/agent/drafts/concept-note.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar `lib/agent/drafts/concept-note.ts`**

```ts
import '../../load-env'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { DEFAULT_MODEL } from '../config'
import type { OpportunityAnalysis } from '../schema'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export const ConceptNoteSchema = z.object({
  problema: z.string().describe('El problema/necesidad que aborda la oportunidad.'),
  solucion: z.string().describe('La solución propuesta por Moollish.'),
  beneficiarios: z.string().describe('Beneficiarios y alcance.'),
  innovacion: z.string().describe('El diferencial/innovación.'),
  resultados: z.string().describe('Resultados esperados.'),
  presupuesto_marco: z.string().describe('Presupuesto marco a alto nivel (sin inventar montos no presentes).'),
  missing_data: z.array(z.string()).describe('Datos ausentes en la fuente necesarios para completar el concept note.'),
})
export type ConceptNote = z.infer<typeof ConceptNoteSchema>
export type ConceptNoteGenerator = (prompt: string, model: string) => Promise<ConceptNote>

const GUARDRAIL = `Sos el copiloto de formulación de Moollish. Generás un BORRADOR de Concept Note.
REGLAS (obligatorias):
- Es un BORRADOR: no es una propuesta final.
- NO inventar requisitos, fechas, montos ni condiciones que no estén en la fuente del análisis.
- Usá y citá la evidencia del análisis; distinguí hechos de interpretación.
- Todo dato ausente que haga falta para el concept note va en missing_data (no lo rellenes con supuestos).`

export function buildConceptNotePrompt(analysis: OpportunityAnalysis, funderBlock: string): string {
  return `${GUARDRAIL}

${funderBlock}

Análisis de la oportunidad (fuente de verdad — no inventes fuera de esto):
${JSON.stringify(analysis, null, 2)}

Devolvé el Concept Note estructurado (problema, solución, beneficiarios, innovación, resultados, presupuesto_marco) y la lista missing_data.`
}

export async function generateConceptNote(
  analysis: OpportunityAnalysis,
  funderBlock: string,
  deps: { generate: ConceptNoteGenerator; model?: string },
): Promise<ConceptNote> {
  const prompt = buildConceptNotePrompt(analysis, funderBlock)
  return deps.generate(prompt, deps.model ?? DEFAULT_MODEL)
}

export async function generateConceptNoteWithOpenRouter(prompt: string, model: string): Promise<ConceptNote> {
  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: ConceptNoteSchema }),
    prompt,
  })
  return output
}
```

- [ ] **Step 4: Run → pass + typecheck**

Run: `pnpm test lib/agent/drafts/concept-note.test.ts` → PASS (3).
Run: `pnpm typecheck` → PASS.
(`generateConceptNoteWithOpenRouter` se verifica en runtime; no se le pega al LLM en tests.)

- [ ] **Step 5: Commit**

```bash
git add lib/agent/drafts/concept-note.ts lib/agent/drafts/concept-note.test.ts
git commit -m "feat(agent): generador de Concept Note con guardrail §13"
```

---

### Task 4: Server action `generateConceptNoteAction`

**Files:**
- Create: `lib/db/draft-actions.ts`

**Interfaces:**
- Consumes: `getOpportunity` (`@/lib/db/queries`), `recordDraft` (`@/lib/db/drafts`), `generateConceptNote`/`generateConceptNoteWithOpenRouter` (`@/lib/agent/drafts/concept-note`), `listFunders`/`rowToProfile` (`@/lib/db/funders`), `matchFunder`/`formatFunderBlock` (`@/lib/agent/funder-match`).
- Produces: `generateConceptNoteAction(opportunityId: string): Promise<void>`.

- [ ] **Step 1: Implementar `lib/db/draft-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getOpportunity } from './queries'
import { recordDraft } from './drafts'
import { listFunders, rowToProfile } from './funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { generateConceptNote, generateConceptNoteWithOpenRouter } from '@/lib/agent/drafts/concept-note'

export async function generateConceptNoteAction(opportunityId: string): Promise<void> {
  const o = await getOpportunity(opportunityId)
  if (!o) return

  let funderBlock = formatFunderBlock(null)
  try {
    const rows = await listFunders()
    funderBlock = formatFunderBlock(matchFunder(JSON.stringify(o.analysis), rows.map(rowToProfile)))
  } catch {
    // sin financiadores → bloque genérico
  }

  const note = await generateConceptNote(o.analysis, funderBlock, { generate: generateConceptNoteWithOpenRouter })
  await recordDraft({
    id: `${opportunityId}:concept_note`,
    opportunityId,
    kind: 'concept_note',
    content: note,
    missingData: note.missing_data,
  })
  revalidatePath(`/oportunidad/${opportunityId}`)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/db/draft-actions.ts
git commit -m "feat(db): generateConceptNoteAction (análisis + match financiador → draft)"
```

---

### Task 5: UI del Concept Note en el detalle

**Files:**
- Create: `components/drafts/concept-note-section.tsx`
- Modify: `app/oportunidad/[id]/page.tsx`

**Interfaces:**
- Consumes: `getDraft` (`@/lib/db/drafts`), `generateConceptNoteAction` (`@/lib/db/draft-actions`), `DraftRow` (`@/lib/db/schema`).

- [ ] **Step 1: Crear `components/drafts/concept-note-section.tsx` (client)**

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DraftRow } from '@/lib/db/schema'
import { generateConceptNoteAction } from '@/lib/db/draft-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ConceptNoteContent {
  problema: string; solucion: string; beneficiarios: string
  innovacion: string; resultados: string; presupuesto_marco: string
}
const SECTIONS: { key: keyof ConceptNoteContent; label: string }[] = [
  { key: 'problema', label: 'Problema' },
  { key: 'solucion', label: 'Solución' },
  { key: 'beneficiarios', label: 'Beneficiarios' },
  { key: 'innovacion', label: 'Innovación' },
  { key: 'resultados', label: 'Resultados' },
  { key: 'presupuesto_marco', label: 'Presupuesto marco' },
]

export function ConceptNoteSection({ opportunityId, draft }: { opportunityId: string; draft: DraftRow | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const content = draft?.content as ConceptNoteContent | undefined
  const missing = (draft?.missingData ?? []) as string[]

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concept Note</p>
        <Button size="sm" disabled={pending}
          onClick={() => start(async () => { await generateConceptNoteAction(opportunityId); router.refresh() })}>
          {pending ? 'Generando…' : draft ? 'Regenerar' : 'Generar concept note'}
        </Button>
      </div>

      {!draft && <p className="text-sm text-muted-foreground">Generá un borrador de concept note a partir del análisis.</p>}

      {content && (
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">BORRADOR</span>
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{content[s.key]}</p>
            </div>
          ))}
          {missing.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-800">Datos faltantes (verificar):</p>
              <ul className="mt-1 list-disc pl-5 text-amber-800">
                {missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Cargar el draft y renderizar en `app/oportunidad/[id]/page.tsx`**

Añadir imports:
```ts
import { getDraft } from '@/lib/db/drafts'
import { ConceptNoteSection } from '@/components/drafts/concept-note-section'
```
Después de `if (!o) return notFound()`, cargar el draft:
```ts
  const conceptNote = (await getDraft(id, 'concept_note')) ?? null
```
Y en el JSX, agregar la sección (debajo de `<AnalysisView analysis={o.analysis} />`, antes de `<TaskList o={o} />`):
```tsx
      <AnalysisView analysis={o.analysis} />
      <ConceptNoteSection opportunityId={id} draft={conceptNote} />
      <TaskList o={o} />
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck` → PASS.
Run: `pnpm build` → compila; `/oportunidad/[id]` sigue dinámica (ƒ).

- [ ] **Step 4: Suite completa**

Run: `pnpm test` (sin DATABASE_URL) → unit verdes, integración skip.

- [ ] **Step 5: Commit**

```bash
git add components/drafts/concept-note-section.tsx app/oportunidad/[id]/page.tsx
git commit -m "feat(detalle): sección Concept Note (generar/regenerar + datos faltantes)"
```

---

## Self-Review

**Spec coverage:**
- Tabla `drafts` (upsert por tipo) → Task 1. ✅
- Queries recordDraft/getDraft → Task 2. ✅
- Generador Concept Note con schema (6 secciones + missing_data) + guardrail §13 + inyectable → Task 3. ✅
- Acción on-demand (análisis + match financiador → draft, no re-scrape) → Task 4. ✅
- UI en el detalle: generar/regenerar, badge BORRADOR, datos faltantes → Task 5. ✅
- Trabaja sobre el análisis guardado → Tasks 3/4 (usan `o.analysis`). ✅
- Errores: LLM falla → action propaga, sin draft parcial (recordDraft solo tras generar OK); oportunidad inexistente → no-op → Task 4. ✅
- Sin credenciales nuevas → respetado. ✅
- Testing: generador puro (3), drafts queries integración (2) → cubiertos; action por typecheck (seam). ✅

**Placeholder scan:** sin TBD/TODO; cada step con código real o comando + salida esperada.

**Type consistency:** `ConceptNote`/`ConceptNoteSchema`/`ConceptNoteGenerator`/`buildConceptNotePrompt`/`generateConceptNote`/`generateConceptNoteWithOpenRouter` (Task 3) usados por la action (4). `recordDraft`/`getDraft` + `DraftRow`/`NewDraftRow` (Tasks 1,2) usados por la action (4) y la UI (5). `generateConceptNoteAction(opportunityId)` (4) usado por la UI (5). La UI castea `draft.content` a la forma de las 6 secciones (coincide con `ConceptNoteSchema`). `id = '<opportunityId>:concept_note'` consistente entre recordDraft (4) y el esquema (1).
