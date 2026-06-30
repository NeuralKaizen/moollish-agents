# Completar §13 — 6 entregables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalizar la maquinaria del Concept Note a un registro de tipos y completar el §13 con los 6 entregables (concept note, teoría de cambio, marco lógico, presupuesto, cronograma, matriz de riesgos), como borradores de texto con guardrail, generables on-demand desde el detalle.

**Architecture:** Un registro (`DRAFT_KINDS`) define cada entregable como label + secciones de texto; el schema Zod de cada tipo se deriva de sus secciones. Un generador genérico (inyectable) arma el prompt con el guardrail y devuelve content (Record sección→texto) + missingData. Una acción genérica y una UI genérica reemplazan lo específico del Concept Note.

**Tech Stack:** Next.js 16 (Server Component + Server Action), Drizzle + Supabase, AI SDK + OpenRouter, Vitest.

## Global Constraints

- **Producto, no demo.** On-demand, guardrail §13, trabaja sobre el análisis guardado.
- **Contenido = secciones de texto con nombre por tipo** (no estructuras tabulares); cada tipo = Zod de strings (derivado de sus `sections`) + `missing_data: string[]`.
- **`drafts.content` pasa a `.$type<Record<string, string>>()`** (genérico; `missing_data` va a su columna `missingData`). SIN migración (cambio TS).
- **Generalizar, no duplicar**: registro + generador genérico + acción genérica + UI genérica. El Concept Note se refactoriza a una entrada del registro.
- **Generador inyectable**: `generateDraft(kind, analysis, funderBlock, deps)` con `deps.generate(prompt, schema)` → testeable sin LLM.
- Reusar: `getOpportunity`, match financiador (`listFunders`/`rowToProfile`/`matchFunder`/`formatFunderBlock`), `recordDraft`/`getDraft`, AI SDK/OpenRouter (`createOpenRouter`/`generateText`/`Output`), `DEFAULT_MODEL`.
- Tests de DB con `describe.skipIf(!process.env.DATABASE_URL)`; correr individual con `DATABASE_URL` exportada (`pnpm test <archivo>`, SIN `--`).
- Mantener verde la suite (159 tests) y `pnpm typecheck` limpio; `pnpm build` con el detalle dinámico.

## Prerequisitos
Ninguna credencial ni migración nueva.

---

### Task 1: Registro de tipos de entregable

**Files:**
- Create: `lib/agent/drafts/registry.ts`
- Test: `lib/agent/drafts/registry.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces:
  - `interface DraftSection { key: string; label: string }`
  - `interface DraftKind { kind: string; label: string; sections: DraftSection[] }`
  - `DRAFT_KINDS: DraftKind[]` (6 tipos)
  - `getDraftKind(kind: string): DraftKind | undefined`
  - `buildKindSchema(kind: string): z.ZodObject<Record<string, z.ZodTypeAny>>` (deriva `{ [section.key]: z.string(), …, missing_data: z.array(z.string()) }`; lanza si el kind es desconocido)

- [ ] **Step 1: Escribir el test**

```ts
// lib/agent/drafts/registry.test.ts
import { describe, it, expect } from 'vitest'
import { DRAFT_KINDS, getDraftKind, buildKindSchema } from './registry'

describe('draft registry', () => {
  it('define los 6 entregables del §13 con secciones no vacías', () => {
    const kinds = DRAFT_KINDS.map((k) => k.kind)
    expect(kinds).toEqual(['concept_note', 'teoria_cambio', 'marco_logico', 'presupuesto', 'cronograma', 'matriz_riesgos'])
    for (const k of DRAFT_KINDS) {
      expect(k.label.length).toBeGreaterThan(0)
      expect(k.sections.length).toBeGreaterThan(0)
      for (const s of k.sections) { expect(s.key.length).toBeGreaterThan(0); expect(s.label.length).toBeGreaterThan(0) }
    }
  })

  it('getDraftKind devuelve el tipo o undefined', () => {
    expect(getDraftKind('concept_note')?.label).toBeTruthy()
    expect(getDraftKind('nope')).toBeUndefined()
  })

  it('buildKindSchema deriva un schema con las secciones del tipo + missing_data', () => {
    const schema = buildKindSchema('concept_note')
    const full = { problema: 'p', solucion: 's', beneficiarios: 'b', innovacion: 'i', resultados: 'r', presupuesto_marco: 'pm', missing_data: ['x'] }
    expect(schema.parse(full).problema).toBe('p')
    expect(() => schema.parse({ problema: 'p' })).toThrow() // falta el resto de secciones
  })

  it('buildKindSchema lanza con un kind desconocido', () => {
    expect(() => buildKindSchema('nope')).toThrow()
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/agent/drafts/registry.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar `lib/agent/drafts/registry.ts`**

```ts
import { z } from 'zod'

export interface DraftSection { key: string; label: string }
export interface DraftKind { kind: string; label: string; sections: DraftSection[] }

export const DRAFT_KINDS: DraftKind[] = [
  {
    kind: 'concept_note', label: 'Concept Note',
    sections: [
      { key: 'problema', label: 'Problema' },
      { key: 'solucion', label: 'Solución' },
      { key: 'beneficiarios', label: 'Beneficiarios' },
      { key: 'innovacion', label: 'Innovación' },
      { key: 'resultados', label: 'Resultados' },
      { key: 'presupuesto_marco', label: 'Presupuesto marco' },
    ],
  },
  {
    kind: 'teoria_cambio', label: 'Teoría de Cambio',
    sections: [
      { key: 'problema', label: 'Problema' },
      { key: 'insumos', label: 'Insumos' },
      { key: 'actividades', label: 'Actividades' },
      { key: 'productos', label: 'Productos' },
      { key: 'resultados', label: 'Resultados' },
      { key: 'impacto', label: 'Impacto' },
      { key: 'supuestos', label: 'Supuestos' },
    ],
  },
  {
    kind: 'marco_logico', label: 'Marco Lógico',
    sections: [
      { key: 'fin', label: 'Fin' },
      { key: 'proposito', label: 'Propósito' },
      { key: 'componentes', label: 'Componentes' },
      { key: 'actividades', label: 'Actividades' },
      { key: 'indicadores', label: 'Indicadores' },
      { key: 'medios_verificacion', label: 'Medios de verificación' },
      { key: 'supuestos', label: 'Supuestos' },
    ],
  },
  {
    kind: 'presupuesto', label: 'Presupuesto preliminar',
    sections: [
      { key: 'categorias', label: 'Categorías' },
      { key: 'costos_unitarios', label: 'Costos unitarios' },
      { key: 'contrapartida', label: 'Contrapartida' },
      { key: 'fee', label: 'Fee' },
      { key: 'tecnologia', label: 'Tecnología' },
      { key: 'personal', label: 'Personal' },
      { key: 'operacion', label: 'Operación' },
    ],
  },
  {
    kind: 'cronograma', label: 'Cronograma',
    sections: [
      { key: 'fases', label: 'Fases' },
      { key: 'hitos', label: 'Hitos' },
      { key: 'responsables', label: 'Responsables' },
      { key: 'fecha_limite', label: 'Fecha límite' },
      { key: 'ruta_critica', label: 'Ruta crítica' },
    ],
  },
  {
    kind: 'matriz_riesgos', label: 'Matriz de Riesgos',
    sections: [
      { key: 'riesgos_tecnicos', label: 'Riesgos técnicos' },
      { key: 'riesgos_financieros', label: 'Riesgos financieros' },
      { key: 'riesgos_sociales', label: 'Riesgos sociales' },
      { key: 'riesgos_legales', label: 'Riesgos legales' },
      { key: 'riesgos_ambientales', label: 'Riesgos ambientales' },
      { key: 'mitigaciones', label: 'Mitigaciones' },
    ],
  },
]

export function getDraftKind(kind: string): DraftKind | undefined {
  return DRAFT_KINDS.find((k) => k.kind === kind)
}

export function buildKindSchema(kind: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const dk = getDraftKind(kind)
  if (!dk) throw new Error(`Tipo de borrador desconocido: ${kind}`)
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const s of dk.sections) shape[s.key] = z.string().describe(s.label)
  shape.missing_data = z.array(z.string()).describe('Datos ausentes en la fuente necesarios para completar el entregable.')
  return z.object(shape)
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test lib/agent/drafts/registry.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/drafts/registry.ts lib/agent/drafts/registry.test.ts
git commit -m "feat(agent): registro de tipos de entregable §13 + buildKindSchema"
```

---

### Task 2: Generador genérico de borradores

**Files:**
- Create: `lib/agent/drafts/generate.ts`
- Test: `lib/agent/drafts/generate.test.ts`

**Interfaces:**
- Consumes: `OpportunityAnalysis` (`@/lib/agent/schema`), `DEFAULT_MODEL` (`@/lib/agent/config`), `DRAFT_KINDS`/`getDraftKind`/`buildKindSchema` (`./registry`).
- Produces:
  - `GUARDRAIL: string`
  - `buildDraftPrompt(kind: string, analysis: OpportunityAnalysis, funderBlock: string): string`
  - `type DraftGenerator = (prompt: string, schema: z.ZodTypeAny) => Promise<Record<string, unknown>>`
  - `generateDraft(kind, analysis, funderBlock, deps: { generate: DraftGenerator }): Promise<{ content: Record<string, string>; missingData: string[] }>`
  - `generateDraftWithOpenRouter(prompt: string, schema: z.ZodTypeAny): Promise<Record<string, unknown>>`

- [ ] **Step 1: Escribir el test**

```ts
// lib/agent/drafts/generate.test.ts
import { describe, it, expect } from 'vitest'
import { buildDraftPrompt, generateDraft, GUARDRAIL } from './generate'
import type { OpportunityAnalysis } from '@/lib/agent/schema'

const analysis = { opportunity_id: 'op-1', source: { name: 'FAO AgrInnovation' } } as unknown as OpportunityAnalysis

describe('generic draft generator', () => {
  it('GUARDRAIL declara borrador y no-inventar', () => {
    expect(GUARDRAIL.toLowerCase()).toContain('borrador')
    expect(GUARDRAIL.toLowerCase()).toContain('no inventar')
  })

  it('buildDraftPrompt incluye guardrail, secciones del tipo y contexto', () => {
    const p = buildDraftPrompt('matriz_riesgos', analysis, 'PERFIL: FAO')
    expect(p.toLowerCase()).toContain('no inventar')
    expect(p).toContain('Mitigaciones')         // sección del tipo matriz_riesgos
    expect(p).toContain('FAO AgrInnovation')    // del análisis serializado
    expect(p).toContain('PERFIL: FAO')          // funderBlock
  })

  it('generateDraft separa content (secciones) de missingData', async () => {
    const fake = async () => ({ fin: 'F', proposito: 'P', componentes: 'C', actividades: 'A', indicadores: 'I', medios_verificacion: 'M', supuestos: 'S', missing_data: ['indicador base'] })
    const { content, missingData } = await generateDraft('marco_logico', analysis, 'PERFIL', { generate: fake })
    expect(content.fin).toBe('F')
    expect(content.missing_data).toBeUndefined() // no se filtra a content
    expect(missingData).toEqual(['indicador base'])
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/agent/drafts/generate.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar `lib/agent/drafts/generate.ts`**

```ts
import '../../load-env'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { DEFAULT_MODEL } from '../config'
import type { OpportunityAnalysis } from '../schema'
import { getDraftKind, buildKindSchema } from './registry'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export const GUARDRAIL = `Sos el copiloto de formulación de Moollish. Generás un BORRADOR de un entregable de formulación.
REGLAS (obligatorias):
- Es un BORRADOR: no es una versión final.
- NO inventar requisitos, fechas, montos ni condiciones que no estén en la fuente del análisis.
- Usá y citá la evidencia del análisis; distinguí hechos de interpretación.
- Todo dato ausente que haga falta para el entregable va en missing_data (no lo rellenes con supuestos).`

export type DraftGenerator = (prompt: string, schema: z.ZodTypeAny) => Promise<Record<string, unknown>>

export function buildDraftPrompt(kind: string, analysis: OpportunityAnalysis, funderBlock: string): string {
  const dk = getDraftKind(kind)
  if (!dk) throw new Error(`Tipo de borrador desconocido: ${kind}`)
  const sectionList = dk.sections.map((s) => `- ${s.label} (${s.key})`).join('\n')
  return `${GUARDRAIL}

Entregable a generar: ${dk.label}.
Secciones requeridas (devolvé cada una como texto):
${sectionList}

${funderBlock}

Análisis de la oportunidad (fuente de verdad — no inventes fuera de esto):
${JSON.stringify(analysis, null, 2)}

Devolvé cada sección como texto y la lista missing_data.`
}

export async function generateDraft(
  kind: string,
  analysis: OpportunityAnalysis,
  funderBlock: string,
  deps: { generate: DraftGenerator },
): Promise<{ content: Record<string, string>; missingData: string[] }> {
  const prompt = buildDraftPrompt(kind, analysis, funderBlock)
  const schema = buildKindSchema(kind)
  const out = await deps.generate(prompt, schema)
  const { missing_data, ...sections } = out
  const content: Record<string, string> = {}
  for (const [k, v] of Object.entries(sections)) content[k] = typeof v === 'string' ? v : String(v)
  return { content, missingData: Array.isArray(missing_data) ? missing_data.map(String) : [] }
}

export async function generateDraftWithOpenRouter(prompt: string, schema: z.ZodTypeAny): Promise<Record<string, unknown>> {
  const { output } = await generateText({
    model: openrouter(DEFAULT_MODEL),
    output: Output.object({ schema }),
    prompt,
  })
  return output as Record<string, unknown>
}
```

- [ ] **Step 4: Run → pass + typecheck**

Run: `pnpm test lib/agent/drafts/generate.test.ts` → PASS (3).
Run: `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agent/drafts/generate.ts lib/agent/drafts/generate.test.ts
git commit -m "feat(agent): generador genérico de borradores (guardrail + schema por tipo)"
```

---

### Task 3: Cutover — modelo/acción/UI genéricos + refactor del Concept Note

**Files:**
- Modify: `lib/db/schema.ts` (content type), `lib/db/drafts.ts` (+listDrafts), `lib/db/drafts.test.ts` (fixtures + listDrafts), `lib/db/draft-actions.ts` (acción genérica), `app/oportunidad/[id]/page.tsx` (listDrafts + DraftsSection)
- Create: `components/drafts/drafts-section.tsx`
- Delete: `lib/agent/drafts/concept-note.ts`, `lib/agent/drafts/concept-note.test.ts`, `components/drafts/concept-note-section.tsx`

**Interfaces:**
- Consumes: `DRAFT_KINDS` (`@/lib/agent/drafts/registry`), `generateDraft`/`generateDraftWithOpenRouter` (`@/lib/agent/drafts/generate`), `getOpportunity`, `listFunders`/`rowToProfile`, `matchFunder`/`formatFunderBlock`, `recordDraft`/`getDraft`/`listDrafts`.
- Produces: `generateDraftAction(opportunityId: string, kind: string): Promise<void>`; `listDrafts(opportunityId): Promise<DraftRow[]>`; `DraftsSection`.

> Cutover atómico: al terminar, typecheck + build + suite quedan verdes. Antes de editar, leé los archivos actuales que vas a modificar/borrar.

- [ ] **Step 1: `lib/db/schema.ts` — content genérico**

Quitar el `import type { ConceptNote } from '@/lib/agent/drafts/concept-note'` del tope, y cambiar la columna content de la tabla `drafts`:
```ts
  content: jsonb('content').$type<Record<string, string>>().notNull(),
```

- [ ] **Step 2: `lib/db/drafts.ts` — agregar `listDrafts`**

Añadir (junto a recordDraft/getDraft; `eq` ya está importado):
```ts
export async function listDrafts(opportunityId: string): Promise<DraftRow[]> {
  return db.select().from(drafts).where(eq(drafts.opportunityId, opportunityId))
}
```

- [ ] **Step 3: `lib/db/draft-actions.ts` — acción genérica (reemplaza generateConceptNoteAction)**

Reemplazar TODO el contenido por:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getOpportunity } from './queries'
import { recordDraft } from './drafts'
import { listFunders, rowToProfile } from './funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { generateDraft, generateDraftWithOpenRouter } from '@/lib/agent/drafts/generate'

export async function generateDraftAction(opportunityId: string, kind: string): Promise<void> {
  const o = await getOpportunity(opportunityId)
  if (!o) return

  let funderBlock = formatFunderBlock(null)
  try {
    const rows = await listFunders()
    funderBlock = formatFunderBlock(matchFunder(JSON.stringify(o.analysis), rows.map(rowToProfile)))
  } catch {
    // sin financiadores → bloque genérico
  }

  const { content, missingData } = await generateDraft(kind, o.analysis, funderBlock, { generate: generateDraftWithOpenRouter })
  await recordDraft({ id: `${opportunityId}:${kind}`, opportunityId, kind, content, missingData })
  revalidatePath(`/oportunidad/${opportunityId}`)
}
```

- [ ] **Step 4: Crear `components/drafts/drafts-section.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DraftRow } from '@/lib/db/schema'
import { DRAFT_KINDS, type DraftSection } from '@/lib/agent/drafts/registry'
import { generateDraftAction } from '@/lib/db/draft-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function KindCard({ opportunityId, kind, label, sections, draft }: {
  opportunityId: string; kind: string; label: string; sections: DraftSection[]; draft: DraftRow | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const content = draft?.content ?? null
  const missing = draft?.missingData ?? []

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <Button size="sm" disabled={pending}
          onClick={() => start(async () => { await generateDraftAction(opportunityId, kind); router.refresh() })}>
          {pending ? 'Generando…' : draft ? 'Regenerar' : 'Generar'}
        </Button>
      </div>

      {!draft && <p className="text-sm text-muted-foreground">Generá un borrador a partir del análisis.</p>}

      {content && (
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">BORRADOR</span>
          {sections.map((s) => (
            <div key={s.key}>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{content[s.key] ?? ''}</p>
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

export function DraftsSection({ opportunityId, drafts }: { opportunityId: string; drafts: Map<string, DraftRow> }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Borradores de formulación</p>
      {DRAFT_KINDS.map((dk) => (
        <KindCard key={dk.kind} opportunityId={opportunityId} kind={dk.kind} label={dk.label}
          sections={dk.sections} draft={drafts.get(dk.kind) ?? null} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: `app/oportunidad/[id]/page.tsx` — usar listDrafts + DraftsSection**

Reemplazar el archivo por:
```tsx
import { notFound } from 'next/navigation'
import { getOpportunity } from '@/lib/db/queries'
import { listDrafts } from '@/lib/db/drafts'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'
import { DraftsSection } from '@/components/drafts/drafts-section'

export const dynamic = 'force-dynamic'

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await getOpportunity(id)
  if (!o) return notFound()
  const draftMap = new Map((await listDrafts(id)).map((d) => [d.kind, d]))

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <DraftsSection opportunityId={id} drafts={draftMap} />
      <TaskList o={o} />
    </main>
  )
}
```

- [ ] **Step 6: Borrar lo específico del Concept Note**

```bash
git rm lib/agent/drafts/concept-note.ts lib/agent/drafts/concept-note.test.ts components/drafts/concept-note-section.tsx
```
(Su cobertura quedó en registry.test.ts + generate.test.ts.)

- [ ] **Step 7: Actualizar `lib/db/drafts.test.ts`**

El fixture `content` actual mete `missing_data` adentro (ya no válido con `Record<string,string>`). Reemplazá el cuerpo del primer test para que `content` sea solo secciones, y agregá un caso de `listDrafts`. Cambios:
- Import: `import { recordDraft, getDraft, listDrafts } from './drafts'`.
- En el primer test, el stub: `const stub = { problema: 'A', solucion: '', beneficiarios: '', innovacion: '', resultados: '', presupuesto_marco: '' }` (SIN `missing_data`). El resto del test queda igual (usa `{ ...stub, problema: 'B' }`).
- Agregá un tercer test:
```ts
  it('listDrafts devuelve los borradores de la oportunidad', async () => {
    await db.insert(opportunities).values(opportunityToRow(makeOpportunity(analysis, new Date().toISOString())))
    await recordDraft({ id: 'op-cn:concept_note', opportunityId: 'op-cn', kind: 'concept_note', content: { problema: 'A' }, missingData: [] })
    await recordDraft({ id: 'op-cn:cronograma', opportunityId: 'op-cn', kind: 'cronograma', content: { fases: 'F' }, missingData: [] })
    const list = await listDrafts('op-cn')
    expect(list).toHaveLength(2)
    expect(new Set(list.map((d) => d.kind))).toEqual(new Set(['concept_note', 'cronograma']))
  })
```

- [ ] **Step 8: Typecheck + grep**

Run: `pnpm typecheck` → PASS.
Run: `grep -rn "concept-note\|ConceptNoteSection\|generateConceptNoteAction\|generateConceptNote\b" app components lib | grep -v "drafts/registry\|drafts/generate"`
Expected: **sin resultados** (no quedan referencias a lo borrado). Si algo aparece, corregilo.

- [ ] **Step 9: Tests con DB + suite + build**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/drafts.test.ts`
Expected: PASS (3, RAN no skip).
Run: `pnpm test` (sin DATABASE_URL) → unit verdes, integración skip.
Run: `pnpm build` → compila; `/oportunidad/[id]` dinámico (ƒ).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(§13): acción + UI genéricas de borradores (6 entregables); refactor Concept Note"
```

---

## Self-Review

**Spec coverage:**
- Registro de 6 tipos + buildKindSchema → Task 1. ✅
- Generador genérico (guardrail + prompt por tipo + separa content/missingData) → Task 2. ✅
- content `.$type<Record<string,string>>` → Task 3 Step 1. ✅
- listDrafts → Task 3 Step 2. ✅
- Acción genérica `generateDraftAction(opportunityId, kind)` → Task 3 Step 3. ✅
- UI genérica de los 6 entregables → Task 3 Steps 4-5. ✅
- Refactor del Concept Note (borrado de lo específico, sin referencias colgando) → Task 3 Steps 6,8. ✅
- Tests adaptados (drafts.test fixtures + listDrafts; cobertura concept-note en registry/generate) → Task 3 Step 7, Tasks 1-2. ✅
- Sin migración / sin credenciales → respetado. ✅
- Errores: kind desconocido lanza en buildKindSchema/buildDraftPrompt; LLM falla → no se guarda (recordDraft tras generar); oportunidad inexistente → no-op → Tasks 2/3. ✅

**Placeholder scan:** sin TBD/TODO; cada step con código real o comando + salida esperada.

**Type consistency:** `DraftKind`/`DraftSection`/`DRAFT_KINDS`/`getDraftKind`/`buildKindSchema` (Task 1) usados por generate (2) y la UI (3). `generateDraft`/`generateDraftWithOpenRouter`/`GUARDRAIL`/`DraftGenerator` (Task 2) usados por la acción (3). `content: Record<string,string>` (3 Step 1) consistente con lo que devuelve `generateDraft` y con `recordDraft`/`getDraft`/`listDrafts` y la UI (`content[s.key]`). `generateDraftAction(opportunityId, kind)` (3 Step 3) usado por la UI (3 Step 4). `id = '<opp>:<kind>'` consistente.
