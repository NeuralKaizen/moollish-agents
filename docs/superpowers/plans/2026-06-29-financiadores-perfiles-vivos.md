# Financiadores: perfiles vivos (§11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el bloque estático `FUNDER_KNOWLEDGE` por una tabla `funders` editable (CRUD) cuyo perfil se inyecta en el análisis vía match-then-inject por alias determinista.

**Architecture:** La detección del financiador es una función pura (`matchFunder`) sobre el texto ingestado; la ruta trae los perfiles de la DB, matchea, formatea un bloque y lo inyecta en `analyzeOpportunity` (que sigue testeable, sin acceso a DB). Los vehículos institucionales quedan fijos en el prompt. CRUD en `/financiadores`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle + Supabase Postgres, AI SDK + OpenRouter, Vitest.

## Global Constraints

- **Producto, no demo** (memoria `building-product-not-demo`): robustez, degradación elegante.
- **Sin embeddings / pgvector** en este slice: el match es **por alias, determinista**, aislado en `matchFunder` (seam para sumar match semántico después).
- **Match = palabra completa, case-insensitive** (límites de palabra, para evitar falsos positivos como "CAR" dentro de "descargar").
- **Match-then-inject**: se inyecta el perfil del financiador detectado (uno), no todos. Sin match → bloque genérico + el análisis procede.
- **`matchFunder` y `formatFunderBlock` son puros** (en `lib/agent/funder-match.ts`), no acoplados a Drizzle. Operan sobre `FunderProfile` (no sobre `FunderRow`).
- **`analyzeOpportunity` recibe el `funderBlock` inyectado** (vía `opts.funderBlock`); NO accede a la DB.
- **Vehículos institucionales** (Moollish/Sat2Farm/Foundation Nova) siempre presentes en el prompt; la lista estática de 7 financiadores se elimina del prompt.
- Tipos canónicos: `FunderProfile` desde `@/lib/agent/funder-match`; `FunderRow`/`NewFunderRow` desde `@/lib/db/schema`.
- Tests de DB con `describe.skipIf(!process.env.DATABASE_URL)`; correr individualmente con `DATABASE_URL` exportada (`pnpm test <archivo>`, SIN `--`).
- Mantener verde la suite (125 tests) y `pnpm typecheck` limpio en cada tarea.

---

### Task 1: Tabla `funders` + migración

**Files:**
- Modify: `lib/db/schema.ts`
- Create (generado): `drizzle/*.sql`

**Interfaces:**
- Produces: tabla `funders`; tipos `FunderRow` ($inferSelect), `NewFunderRow` ($inferInsert).

- [ ] **Step 1: Agregar la tabla a `lib/db/schema.ts`** (al final del archivo)

```ts
export const funders = pgTable('funders', {
  id: text('id').primaryKey(), // slug, ej. 'fao'
  name: text('name').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull(),
  themes: text('themes'),
  geographies: text('geographies'),
  typicalAmounts: text('typical_amounts'),
  frequency: text('frequency'),
  eligibleEntity: text('eligible_entity'),
  requiredDocuments: text('required_documents'),
  winningExamples: text('winning_examples'),
  contacts: text('contacts'),
  language: text('language'),
  evaluationCriteria: text('evaluation_criteria'),
  lessonsLearned: text('lessons_learned'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FunderRow = typeof funders.$inferSelect
export type NewFunderRow = typeof funders.$inferInsert
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Generar la migración**

Run: `pnpm db:generate`
Expected: nuevo `drizzle/*.sql` con `CREATE TABLE "funders"`.

- [ ] **Step 4: Aplicar a Supabase**

Run: `pnpm db:push`
Expected: "Changes applied".

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): tabla funders (§11 perfiles vivos)"
```

---

### Task 2: Match-then-inject puro (`funder-match`)

**Files:**
- Create: `lib/agent/funder-match.ts`
- Test: `lib/agent/funder-match.test.ts`

**Interfaces:**
- Produces:
  - `interface FunderProfile { name: string; aliases: string[]; themes?: string | null; geographies?: string | null; typicalAmounts?: string | null; frequency?: string | null; eligibleEntity?: string | null; requiredDocuments?: string | null; winningExamples?: string | null; contacts?: string | null; language?: string | null; evaluationCriteria?: string | null; lessonsLearned?: string | null }`
  - `matchFunder(text: string, funders: FunderProfile[]): FunderProfile | null`
  - `formatFunderBlock(funder: FunderProfile | null): string`

- [ ] **Step 1: Escribir el test**

```ts
// lib/agent/funder-match.test.ts
import { describe, it, expect } from 'vitest'
import { matchFunder, formatFunderBlock, type FunderProfile } from './funder-match'

const fao: FunderProfile = { name: 'FAO', aliases: ['FAO', 'Food and Agriculture Organization'], themes: 'seguridad alimentaria' }
const car: FunderProfile = { name: 'CAR', aliases: ['CAR'], themes: 'restauración, biodiversidad' }
const funders = [fao, car]

describe('matchFunder', () => {
  it('matchea por alias como palabra completa, case-insensitive', () => {
    expect(matchFunder('Convocatoria de la fao para...', funders)?.name).toBe('FAO')
    expect(matchFunder('Food and Agriculture Organization abre...', funders)?.name).toBe('FAO')
  })
  it('NO matchea un alias embebido dentro de otra palabra', () => {
    expect(matchFunder('instrucciones para descargar el pliego', funders)).toBeNull() // "car" en "descargar"
  })
  it('devuelve null si ningún alias aparece', () => {
    expect(matchFunder('convocatoria del BID', funders)).toBeNull()
  })
})

describe('formatFunderBlock', () => {
  it('arma un bloque con los campos no vacíos del perfil', () => {
    const block = formatFunderBlock(fao)
    expect(block).toContain('FAO')
    expect(block).toContain('seguridad alimentaria')
  })
  it('devuelve un bloque genérico cuando no hay financiador', () => {
    const block = formatFunderBlock(null)
    expect(block.toLowerCase()).toContain('no se identificó')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/agent/funder-match.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar `lib/agent/funder-match.ts`**

```ts
export interface FunderProfile {
  name: string
  aliases: string[]
  themes?: string | null
  geographies?: string | null
  typicalAmounts?: string | null
  frequency?: string | null
  eligibleEntity?: string | null
  requiredDocuments?: string | null
  winningExamples?: string | null
  contacts?: string | null
  language?: string | null
  evaluationCriteria?: string | null
  lessonsLearned?: string | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Match de palabra completa, case-insensitive: el alias debe estar rodeado de
// caracteres no alfanuméricos (o bordes del texto), para no matchear "CAR" en "descargar".
function aliasAppears(alias: string, text: string): boolean {
  const a = alias.trim()
  if (a.length === 0) return false
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(a)}([^\\p{L}\\p{N}]|$)`, 'iu')
  return re.test(text)
}

export function matchFunder(text: string, funders: FunderProfile[]): FunderProfile | null {
  for (const f of funders) {
    if (f.aliases.some((alias) => aliasAppears(alias, text))) return f
  }
  return null
}

const FIELD_LABELS: [keyof FunderProfile, string][] = [
  ['themes', 'Temas/prioridades'],
  ['geographies', 'Geografías'],
  ['typicalAmounts', 'Montos típicos'],
  ['frequency', 'Frecuencia'],
  ['eligibleEntity', 'Tipo de entidad elegible'],
  ['requiredDocuments', 'Documentos exigidos'],
  ['winningExamples', 'Ejemplos de proyectos ganadores'],
  ['contacts', 'Contactos'],
  ['language', 'Idioma'],
  ['evaluationCriteria', 'Criterios de evaluación'],
  ['lessonsLearned', 'Lecciones aprendidas'],
]

export function formatFunderBlock(funder: FunderProfile | null): string {
  if (!funder) {
    return 'PERFIL DEL FINANCIADOR: No se identificó un financiador con perfil cargado. Analizá con criterio general, sin inventar prioridades específicas de un financiador.'
  }
  const lines = [`PERFIL DEL FINANCIADOR — ${funder.name} (usar para interpretar prioridades y narrativa, no para inventar requisitos):`]
  for (const [key, label] of FIELD_LABELS) {
    const value = funder[key]
    if (typeof value === 'string' && value.trim().length > 0) lines.push(`- ${label}: ${value.trim()}`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test lib/agent/funder-match.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/funder-match.ts lib/agent/funder-match.test.ts
git commit -m "feat(agent): matchFunder/formatFunderBlock (alias determinista, puro)"
```

---

### Task 3: Vehículos fijos + prompt con `funderBlock`

**Files:**
- Modify: `lib/agent/funders.ts`
- Modify: `lib/agent/prompt.ts`
- Modify: `lib/agent/prompt.test.ts`

**Interfaces:**
- Consumes: `formatFunderBlock` (de `@/lib/agent/funder-match`).
- Produces: `INSTITUTIONAL_VEHICLES` (const) en `lib/agent/funders.ts`; `buildSystemPrompt(today?: string, funderBlock?: string): string`.

- [ ] **Step 1: Reemplazar `lib/agent/funders.ts`**

Eliminar `FUNDER_KNOWLEDGE` y dejar solo los vehículos institucionales:
```ts
// Vehículos institucionales (§2/§3). Siempre presentes en el prompt — son independientes
// del financiador. El conocimiento por financiador ahora vive en la tabla `funders` y se
// inyecta vía funderBlock (ver lib/agent/funder-match.ts).
export const INSTITUTIONAL_VEHICLES = `
VEHÍCULOS INSTITUCIONALES:
- Moollish: vehículo principal para AgTech, ganadería inteligente, agricultura, trazabilidad, marketplace, IoT/RFID, proyectos productivos.
- Sat2Farm: capacidad satelital — agricultura de precisión, carbono, riesgo climático, biodiversidad, monitoreo ambiental.
- Foundation Nova: vehículo social — juventud rural, mujeres, seguridad alimentaria, educación, inclusión, desarrollo comunitario.
`.trim()
```

- [ ] **Step 2: Actualizar el test del prompt** (`lib/agent/prompt.test.ts`)

Reemplazar el test "incluye conocimiento de financiadores" (que asserta FAO/FONTAGRO estáticos) por:
```ts
  it('inyecta el bloque del financiador provisto', () => {
    const p = buildSystemPrompt('2026-06-24', 'PERFIL DEL FINANCIADOR — FAO: prioridades X')
    expect(p).toContain('PERFIL DEL FINANCIADOR — FAO')
  })
  it('siempre incluye los vehículos institucionales', () => {
    expect(prompt).toContain('Sat2Farm')
    expect(prompt).toContain('Foundation Nova')
  })
```
(El resto de los tests no cambia; `prompt = buildSystemPrompt()` sigue válido con el bloque genérico por defecto.)

- [ ] **Step 3: Run → fail**

Run: `pnpm test lib/agent/prompt.test.ts`
Expected: FAIL (el viejo test FAO/FONTAGRO ya no aplica / la firma nueva).

- [ ] **Step 4: Modificar `lib/agent/prompt.ts`**

Cambiar el import y la firma:
```ts
import { INSTITUTIONAL_VEHICLES } from './funders'
import { formatFunderBlock } from './funder-match'
import { DEFAULT_WEIGHTS } from './config'
import { CRITERION_KEYS } from './schema'
```
Firma:
```ts
export function buildSystemPrompt(
  today: string = new Date().toISOString().slice(0, 10),
  funderBlock: string = formatFunderBlock(null),
): string {
```
Y reemplazar la línea `${FUNDER_KNOWLEDGE}` del template por:
```ts
${INSTITUTIONAL_VEHICLES}

${funderBlock}
```

- [ ] **Step 5: Run → pass**

Run: `pnpm test lib/agent/prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/agent/funders.ts lib/agent/prompt.ts lib/agent/prompt.test.ts
git commit -m "feat(agent): vehículos fijos + prompt con funderBlock inyectado (quita lista estática)"
```

---

### Task 4: Inyectar `funderBlock` por la cadena generate/analyze

**Files:**
- Modify: `lib/agent/llm.ts`
- Modify: `lib/agent/analyze.ts`
- Modify: `lib/agent/analyze.test.ts`

**Interfaces:**
- Consumes: `formatFunderBlock` (de `@/lib/agent/funder-match`).
- Produces:
  - `generateWithOpenRouter(text: string, model: string, funderBlock?: string): Promise<LlmAnalysis>`
  - `AnalyzeDeps.generate: (text: string, model: string, funderBlock: string) => Promise<LlmAnalysis>`
  - `AnalyzeOpts.funderBlock?: string` (default `formatFunderBlock(null)`).

- [ ] **Step 1: Escribir/actualizar el test** (`lib/agent/analyze.test.ts`)

Agregar un test que verifique que `opts.funderBlock` llega a `generate`:
```ts
  it('pasa el funderBlock a generate', async () => {
    let received: string | undefined
    const generate = async (_t: string, _m: string, fb: string) => { received = fb; return SAMPLE_LLM }
    await analyzeOpportunity('texto', { generate }, { funderBlock: 'BLOQUE-X' })
    expect(received).toBe('BLOQUE-X')
  })
  it('usa el bloque genérico si no se provee funderBlock', async () => {
    let received: string | undefined
    const generate = async (_t: string, _m: string, fb: string) => { received = fb; return SAMPLE_LLM }
    await analyzeOpportunity('texto', { generate })
    expect(received?.toLowerCase()).toContain('no se identificó')
  })
```
> `SAMPLE_LLM` = el objeto `LlmAnalysis` válido que el resto de `analyze.test.ts` ya usa como retorno del `generate` mock. Reutilizá el que existe en el archivo (mismo fixture que los demás tests); no crees uno nuevo. Los mocks de `generate` existentes deben pasar a aceptar el 3er parámetro `funderBlock` aunque no lo usen.

- [ ] **Step 2: Run → fail**

Run: `pnpm test lib/agent/analyze.test.ts`
Expected: FAIL (la firma de `generate` y `opts.funderBlock` aún no existen).

- [ ] **Step 3: Modificar `lib/agent/analyze.ts`**

Import:
```ts
import { formatFunderBlock } from './funder-match'
```
Cambiar `AnalyzeDeps.generate` y `AnalyzeOpts`:
```ts
export interface AnalyzeDeps {
  generate: (text: string, model: string, funderBlock: string) => Promise<LlmAnalysis>
  now?: () => string
  uuid?: () => string
}

export interface AnalyzeOpts {
  model?: string
  weights?: Record<CriterionKey, number>
  funderBlock?: string
}
```
En el cuerpo, resolver el bloque y pasarlo a generate:
```ts
  const model = opts.model ?? DEFAULT_MODEL
  const weights = opts.weights ?? DEFAULT_WEIGHTS
  const funderBlock = opts.funderBlock ?? formatFunderBlock(null)

  const raw = await deps.generate(text, model, funderBlock)
```

- [ ] **Step 4: Modificar `lib/agent/llm.ts`**

```ts
export async function generateWithOpenRouter(
  text: string, model: string, funderBlock?: string,
): Promise<LlmAnalysis> {
  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: LlmAnalysisSchema }),
    system: buildSystemPrompt(undefined, funderBlock),
    prompt: `Analizá la siguiente convocatoria y devolvé el análisis estructurado:\n\n${text}`,
  })
  return output
}
```
(`buildSystemPrompt(undefined, funderBlock)` deja el default de `today` y usa el bloque; si `funderBlock` es undefined, buildSystemPrompt cae a su propio default genérico.)

- [ ] **Step 5: Run → pass + typecheck**

Run: `pnpm test lib/agent/analyze.test.ts` → PASS.
Run: `pnpm typecheck` → PASS (los scripts `analyze.ts`/`seed.ts` siguen llamando `analyzeOpportunity(text, { generate: generateWithOpenRouter })` sin `funderBlock` — válido, cae al genérico; `generateWithOpenRouter` acepta el 3er arg opcional).

- [ ] **Step 6: Commit**

```bash
git add lib/agent/llm.ts lib/agent/analyze.ts lib/agent/analyze.test.ts
git commit -m "feat(agent): inyectar funderBlock por generate/analyzeOpportunity"
```

---

### Task 5: Queries de financiadores + mapper

**Files:**
- Create: `lib/db/funders.ts`
- Test: `lib/db/funders.test.ts`

**Interfaces:**
- Consumes: `db`, `funders`, `FunderRow`, `NewFunderRow` (de `@/lib/db/*`); `FunderProfile` (de `@/lib/agent/funder-match`).
- Produces:
  - `listFunders(): Promise<FunderRow[]>` (orden por `name`)
  - `getFunder(id: string): Promise<FunderRow | undefined>`
  - `rowToProfile(row: FunderRow): FunderProfile`

> Integración: `describe.skipIf(!process.env.DATABASE_URL)`; limpia `funders` en `beforeEach`.

- [ ] **Step 1: Escribir el test**

```ts
// lib/db/funders.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { funders } from './schema'
import { listFunders, getFunder, rowToProfile } from './funders'

const hasDb = !!process.env.DATABASE_URL
const row = { id: 'fao', name: 'FAO', aliases: ['FAO', 'Food and Agriculture Organization'], themes: 'seguridad alimentaria' }

describe.skipIf(!hasDb)('funders queries (integración)', () => {
  beforeEach(async () => { await db.delete(funders) })

  it('listFunders ordena por name y getFunder trae por id', async () => {
    await db.insert(funders).values([row, { id: 'bid', name: 'BID', aliases: ['BID'] }])
    const list = await listFunders()
    expect(list.map((f) => f.name)).toEqual(['BID', 'FAO'])
    expect((await getFunder('fao'))?.name).toBe('FAO')
    expect(await getFunder('nope')).toBeUndefined()
  })

  it('rowToProfile mapea fila a FunderProfile', async () => {
    await db.insert(funders).values(row)
    const r = await getFunder('fao')
    const profile = rowToProfile(r!)
    expect(profile.name).toBe('FAO')
    expect(profile.aliases).toContain('FAO')
    expect(profile.themes).toBe('seguridad alimentaria')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/funders.test.ts`
Expected: FAIL ("listFunders is not a function").

- [ ] **Step 3: Implementar `lib/db/funders.ts`**

```ts
import { asc, eq } from 'drizzle-orm'
import { db } from './client'
import { funders, type FunderRow } from './schema'
import type { FunderProfile } from '@/lib/agent/funder-match'

export async function listFunders(): Promise<FunderRow[]> {
  return db.select().from(funders).orderBy(asc(funders.name))
}

export async function getFunder(id: string): Promise<FunderRow | undefined> {
  const rows = await db.select().from(funders).where(eq(funders.id, id)).limit(1)
  return rows[0]
}

export function rowToProfile(row: FunderRow): FunderProfile {
  return {
    name: row.name,
    aliases: row.aliases,
    themes: row.themes,
    geographies: row.geographies,
    typicalAmounts: row.typicalAmounts,
    frequency: row.frequency,
    eligibleEntity: row.eligibleEntity,
    requiredDocuments: row.requiredDocuments,
    winningExamples: row.winningExamples,
    contacts: row.contacts,
    language: row.language,
    evaluationCriteria: row.evaluationCriteria,
    lessonsLearned: row.lessonsLearned,
  }
}
```

- [ ] **Step 4: Run → pass**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/funders.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add lib/db/funders.ts lib/db/funders.test.ts
git commit -m "feat(db): queries listFunders/getFunder + rowToProfile"
```

---

### Task 6: Seed de los 7 financiadores

**Files:**
- Create: `lib/db/funders-seed.ts`
- Create: `scripts/seed-funders.ts`
- Modify: `package.json` (script)
- Test: `lib/db/funders-seed.test.ts`

**Interfaces:**
- Consumes: `NewFunderRow` (de `@/lib/db/schema`).
- Produces: `FUNDER_SEED: NewFunderRow[]` (7 perfiles); `pnpm seed:funders`.

- [ ] **Step 1: Crear `lib/db/funders-seed.ts`** (datos transcritos del `FUNDER_KNOWLEDGE` original + tabla §11)

```ts
import type { NewFunderRow } from './schema'

export const FUNDER_SEED: NewFunderRow[] = [
  { id: 'fao', name: 'FAO', aliases: ['FAO', 'Food and Agriculture Organization', 'Organización de las Naciones Unidas para la Alimentación'],
    themes: 'Seguridad alimentaria, agricultura, sistemas agroalimentarios, resiliencia, asociaciones rurales.',
    evaluationCriteria: 'Narrativas de productividad, hambre cero, sostenibilidad y escalabilidad rural.' },
  { id: 'fontagro', name: 'FONTAGRO', aliases: ['FONTAGRO'],
    themes: 'Innovación agropecuaria, investigación aplicada, alianzas regionales, escalamiento.',
    eligibleEntity: 'Suele exigir país socio y centro de investigación.' },
  { id: 'div-fund', name: 'DIV Fund', aliases: ['DIV Fund', 'Development Innovation Ventures', 'DIV'],
    themes: 'Evidencia, costo-efectividad, impacto medible, potencial de escala.',
    requiredDocuments: 'Pide teoría de cambio robusta y medición.' },
  { id: 'minciencias', name: 'Minciencias', aliases: ['Minciencias', 'Ministerio de Ciencia'],
    themes: 'CTeI, apropiación social, innovación, capacidades regionales.',
    evaluationCriteria: 'Alianzas universidad-empresa-estado y componentes tecnológicos demostrables.' },
  { id: 'adr-minagricultura', name: 'ADR / MinAgricultura', aliases: ['ADR', 'MinAgricultura', 'Ministerio de Agricultura', 'Agencia de Desarrollo Rural'],
    themes: 'Productividad, asociatividad, comercialización, extensión agropecuaria.',
    evaluationCriteria: 'Proyectos con asociaciones y asistencia técnica digital.' },
  { id: 'car', name: 'CAR / entidades ambientales', aliases: ['CAR', 'Corporación Autónoma Regional'],
    themes: 'Restauración, biodiversidad, monitoreo, alertas, ordenamiento ambiental.',
    evaluationCriteria: 'Encaja con la capa satelital de Sat2Farm.' },
  { id: 'ue-horizon', name: 'UE / Horizon / Innovate UK', aliases: ['UE', 'Unión Europea', 'Horizon', 'Innovate UK', 'Horizon Europe'],
    themes: 'Consorcios, innovación, impacto, escalabilidad, partners internacionales.',
    eligibleEntity: 'Suele requerir socio coordinador y rol de piloto.' },
]
```

- [ ] **Step 2: Escribir el test del seed** (`lib/db/funders-seed.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { FUNDER_SEED } from './funders-seed'

describe('FUNDER_SEED', () => {
  it('trae 7 financiadores con id único, name y aliases no vacíos', () => {
    expect(FUNDER_SEED).toHaveLength(7)
    const ids = FUNDER_SEED.map((f) => f.id)
    expect(new Set(ids).size).toBe(7)
    for (const f of FUNDER_SEED) {
      expect(f.name.length).toBeGreaterThan(0)
      expect(Array.isArray(f.aliases) && f.aliases.length).toBeTruthy()
    }
  })
})
```

- [ ] **Step 3: Run → fail, luego pass**

Run: `pnpm test lib/db/funders-seed.test.ts`
Expected: primero FAIL (módulo), tras crear el archivo PASS (1).

- [ ] **Step 4: Agregar script a `package.json`**

En `"scripts"`: `"seed:funders": "tsx scripts/seed-funders.ts",`

- [ ] **Step 5: Crear `scripts/seed-funders.ts`**

```ts
import '../lib/load-env'
import { db } from '../lib/db/client'
import { funders } from '../lib/db/schema'
import { FUNDER_SEED } from '../lib/db/funders-seed'

async function main() {
  await db.delete(funders)
  await db.insert(funders).values(FUNDER_SEED)
  console.error(`[seed-funders] Insertados ${FUNDER_SEED.length} financiadores.`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 6: Correr el seed**

Run: `pnpm seed:funders`
Expected: "Insertados 7 financiadores."

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/db/funders-seed.ts lib/db/funders-seed.test.ts scripts/seed-funders.ts package.json
git commit -m "feat(db): seed de los 7 financiadores + pnpm seed:funders"
```

---

### Task 7: Server actions de financiadores

**Files:**
- Create: `lib/db/funder-actions.ts`
- Test: `lib/db/funder-actions.test.ts`

**Interfaces:**
- Consumes: `db`, `funders` (de `@/lib/db/*`); `getFunder` (en el test).
- Produces (todas `Promise<void>`):
  - `createFunderAction(row: NewFunderRow)`
  - `updateFunderAction(id: string, patch: Partial<Omit<NewFunderRow, 'id'>>)`
  - `deleteFunderAction(id: string)`

> Integración con DB. Mock de `next/cache` igual que en `lib/db/actions.test.ts`.

- [ ] **Step 1: Escribir el test**

```ts
// lib/db/funder-actions.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { funders } from './schema'
import { getFunder } from './funders'
import { createFunderAction, updateFunderAction, deleteFunderAction } from './funder-actions'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('funder actions (integración)', () => {
  beforeEach(async () => { await db.delete(funders) })

  it('create/update/delete round-trip', async () => {
    await createFunderAction({ id: 'fao', name: 'FAO', aliases: ['FAO'] })
    expect((await getFunder('fao'))?.name).toBe('FAO')
    await updateFunderAction('fao', { themes: 'seguridad alimentaria' })
    expect((await getFunder('fao'))?.themes).toBe('seguridad alimentaria')
    await deleteFunderAction('fao')
    expect(await getFunder('fao')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/funder-actions.test.ts`
Expected: FAIL ("createFunderAction is not a function").

- [ ] **Step 3: Implementar `lib/db/funder-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { funders } from './schema'
import type { NewFunderRow } from './schema'

export async function createFunderAction(row: NewFunderRow): Promise<void> {
  await db.insert(funders).values(row)
    .onConflictDoUpdate({ target: funders.id, set: { ...row, updatedAt: new Date() } })
  revalidatePath('/financiadores')
}

export async function updateFunderAction(
  id: string, patch: Partial<Omit<NewFunderRow, 'id'>>,
): Promise<void> {
  await db.update(funders).set({ ...patch, updatedAt: new Date() }).where(eq(funders.id, id))
  revalidatePath('/financiadores')
}

export async function deleteFunderAction(id: string): Promise<void> {
  await db.delete(funders).where(eq(funders.id, id))
  revalidatePath('/financiadores')
}
```

- [ ] **Step 4: Run → pass**

Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/funder-actions.test.ts`
Expected: PASS (1).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → PASS.
```bash
git add lib/db/funder-actions.ts lib/db/funder-actions.test.ts
git commit -m "feat(db): server actions create/update/delete funder"
```

---

### Task 8: Ruta — match-then-inject

**Files:**
- Modify: `app/api/analyze/route.ts`

**Interfaces:**
- Consumes: `listFunders`, `rowToProfile` (de `@/lib/db/funders`); `matchFunder`, `formatFunderBlock` (de `@/lib/agent/funder-match`).

- [ ] **Step 1: Inyectar el funderBlock en `app/api/analyze/route.ts`**

Imports nuevos:
```ts
import { listFunders, rowToProfile } from '@/lib/db/funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
```
En `POST`, reemplazar la línea del análisis por un bloque que matchee primero (degradando si la DB falla):
```ts
        send({ type: 'progress', step: 'Analizando…' })
        let funderBlock = formatFunderBlock(null)
        try {
          const rows = await listFunders()
          funderBlock = formatFunderBlock(matchFunder(ingest.text, rows.map(rowToProfile)))
        } catch {
          // Si la tabla de financiadores no está disponible, seguimos con el bloque genérico.
        }
        const analysis = await analyzeOpportunity(ingest.text, { generate: generateWithOpenRouter }, { funderBlock })
```
(Reemplaza la línea actual `const analysis = await analyzeOpportunity(ingest.text, { generate: generateWithOpenRouter })`.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat(api): match-then-inject del perfil de financiador en el análisis"
```

---

### Task 9: CRUD UI `/financiadores`

**Files:**
- Create: `app/financiadores/page.tsx`
- Create: `components/funders/funder-list.tsx`
- Create: `components/funders/funder-form.tsx`
- Modify: `components/nav-header.tsx`

**Interfaces:**
- Consumes: `listFunders` (`@/lib/db/funders`); `createFunderAction`, `updateFunderAction`, `deleteFunderAction` (`@/lib/db/funder-actions`); `FunderRow` (`@/lib/db/schema`).

- [ ] **Step 1: `app/financiadores/page.tsx` (Server Component)**

```tsx
import { listFunders } from '@/lib/db/funders'
import { FunderList } from '@/components/funders/funder-list'
import { FunderForm } from '@/components/funders/funder-form'

export const dynamic = 'force-dynamic'

export default async function FundersPage() {
  const funders = await listFunders()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Financiadores</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Perfiles vivos que el análisis usa para interpretar prioridades de cada financiador.
      </p>
      <FunderForm />
      <FunderList funders={funders} />
    </main>
  )
}
```

- [ ] **Step 2: `components/funders/funder-form.tsx` (client; crear/editar)**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FunderRow } from '@/lib/db/schema'
import { createFunderAction, updateFunderAction } from '@/lib/db/funder-actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const FIELDS: { key: keyof FunderRow; label: string }[] = [
  { key: 'themes', label: 'Temas/prioridades' },
  { key: 'geographies', label: 'Geografías' },
  { key: 'typicalAmounts', label: 'Montos típicos' },
  { key: 'frequency', label: 'Frecuencia' },
  { key: 'eligibleEntity', label: 'Tipo de entidad elegible' },
  { key: 'requiredDocuments', label: 'Documentos exigidos' },
  { key: 'winningExamples', label: 'Ejemplos ganadores' },
  { key: 'contacts', label: 'Contactos' },
  { key: 'language', label: 'Idioma' },
  { key: 'evaluationCriteria', label: 'Criterios de evaluación' },
  { key: 'lessonsLearned', label: 'Lecciones aprendidas' },
]

export function FunderForm({ funder, onDone }: { funder?: FunderRow; onDone?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const editing = !!funder

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const id = String(fd.get('id') ?? '').trim()
    const name = String(fd.get('name') ?? '').trim()
    const aliases = String(fd.get('aliases') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!name || aliases.length === 0) { setError('Nombre y al menos un alias son obligatorios.'); return }
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    const patch = Object.fromEntries(FIELDS.map((f) => [f.key, text(f.key as string)]))
    setError(null)
    start(async () => {
      if (editing) await updateFunderAction(funder!.id, { name, aliases, ...patch })
      else await createFunderAction({ id: id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, aliases, ...patch })
      router.refresh()
      onDone?.()
    })
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{editing ? `Editar ${funder!.name}` : 'Nuevo financiador'}</p>
        {!editing && <input name="id" placeholder="id (slug, opcional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />}
        <input name="name" defaultValue={funder?.name ?? ''} placeholder="Nombre *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="aliases" defaultValue={funder?.aliases.join(', ') ?? ''} placeholder="Alias separados por coma *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        {FIELDS.map((f) => (
          <textarea key={f.key as string} name={f.key as string} defaultValue={(funder?.[f.key] as string | null) ?? ''} placeholder={f.label}
            className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}</Button>
          {editing && onDone && <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>}
        </div>
      </form>
    </Card>
  )
}
```

- [ ] **Step 3: `components/funders/funder-list.tsx` (client; editar inline + borrar)**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FunderRow } from '@/lib/db/schema'
import { deleteFunderAction } from '@/lib/db/funder-actions'
import { FunderForm } from './funder-form'
import { Card } from '@/components/ui/card'

export function FunderList({ funders }: { funders: FunderRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (funders.length === 0) return <p className="text-sm text-muted-foreground">No hay financiadores cargados.</p>

  return (
    <div className="flex flex-col gap-3">
      {funders.map((f) => editing === f.id ? (
        <FunderForm key={f.id} funder={f} onDone={() => setEditing(null)} />
      ) : (
        <Card key={f.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium">{f.name}</p>
            <p className="truncate text-xs text-muted-foreground">{f.aliases.join(', ')}</p>
            {f.themes && <p className="mt-1 text-sm text-muted-foreground">{f.themes}</p>}
          </div>
          <div className="flex shrink-0 gap-2 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setEditing(f.id)}>Editar</button>
            <button type="button" className="text-red-600 hover:underline" disabled={pending}
              onClick={() => { if (confirm(`¿Eliminar ${f.name}?`)) start(async () => { await deleteFunderAction(f.id); router.refresh() }) }}>
              Eliminar
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Link en `components/nav-header.tsx`**

Agregar a la lista `LINKS`:
```ts
  { href: '/financiadores', label: 'Financiadores' },
```

- [ ] **Step 5: Typecheck + build**

Run: `pnpm typecheck` → PASS.
Run: `pnpm build` → compila; `/financiadores` aparece como dinámica (ƒ).

- [ ] **Step 6: Suite completa**

Run: `pnpm test` (sin DATABASE_URL) → unit verdes, integración skip.
Run: `export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" && pnpm test lib/db/funders.test.ts && pnpm test lib/db/funder-actions.test.ts` → verdes.

- [ ] **Step 7: Commit**

```bash
git add app/financiadores components/funders components/nav-header.tsx
git commit -m "feat(financiadores): pantalla CRUD + link en el nav"
```

---

## Self-Review

**Spec coverage:**
- Tabla `funders` con campos §11 → Task 1. ✅
- Match-then-inject por alias whole-word determinista → Task 2. ✅
- Vehículos fijos + lista estática eliminada + funderBlock en prompt → Task 3. ✅
- Threading funderBlock por generate/analyze → Task 4. ✅
- Queries + mapper a FunderProfile → Task 5. ✅
- Seed de los 7 → Task 6. ✅
- CRUD actions → Task 7. ✅
- Ruta hace el match con degradación si la DB falla → Task 8. ✅
- Pantalla `/financiadores` + nav → Task 9. ✅
- Sin embeddings/pgvector; sin env nuevas → respetado (ninguna tarea los introduce). ✅
- Errores: sin match → genérico (Task 2/8); DB caída → genérico (Task 8); editar/borrar no afecta análisis guardados (el perfil se inyecta en el momento, nunca se persiste en la oportunidad — ninguna tarea lo persiste). ✅

**Placeholder scan:** sin TBD/TODO; cada step trae código real o comando con salida esperada. `SAMPLE_LLM` en Task 4 se referencia explícitamente al fixture existente del archivo (instrucción de reutilizarlo, no inventarlo).

**Type consistency:** `FunderProfile` (Task 2) usado por `formatFunderBlock`/`matchFunder` (2,8), `rowToProfile` (5). `buildSystemPrompt(today?, funderBlock?)` (3) usado por `generateWithOpenRouter` (4). `AnalyzeDeps.generate(text, model, funderBlock)` y `AnalyzeOpts.funderBlock` (4) usados por la ruta (8). `FunderRow`/`NewFunderRow` (1) usados por queries (5), seed (6), actions (7), UI (9). `listFunders(): FunderRow[]` + `rowToProfile` consistentes en 5 y 8.
