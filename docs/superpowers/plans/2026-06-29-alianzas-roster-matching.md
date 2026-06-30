# Motor de alianzas §12 (roster + matching) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el detalle de una oportunidad sugiera aliados concretos de una base curada (CRUD), rankeados por un Alliance Fit Score determinista, por cada brecha de `partners_needed`.

**Architecture:** Mismo patrón de roster que Financiadores §11 (tabla Drizzle + queries + server actions + CRUD UI + seed) más un matcher **puro** (`lib/agent/alliance/match.ts`) que combina tipo + complementariedad + geografía + reputación en un score 0-100. El matching se calcula server-side, on-load, en el detalle. No toca el análisis ni el pipeline. Mensajes de acercamiento quedan fuera de este slice.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions, `force-dynamic`), React 19, Drizzle ORM sobre Supabase Postgres (postgres-js, `prepare:false`), Vitest, tsx.

## Global Constraints

- **Mentalidad: PRODUCTO, no demo.** Código product-grade, no atajos de demo.
- **Sin variables de entorno nuevas.** Reusa `DATABASE_URL`.
- **Sin credenciales nuevas.**
- El matcher es **puro y total**: brechas vacías → `[]`; aliados vacíos → cada brecha con `candidates: []`. No LLM, no embeddings en el match.
- **`country` del contexto va `null` por ahora** (el análisis no tiene país confiable). El factor geografía queda cableado pero inerte. Señales activas: **tipo + complementariedad + reputación**.
- Reputación es uno de exactamente: `'alto' | 'medio' | 'bajo'`.
- Tests de integración: `describe.skipIf(!process.env.DATABASE_URL)`. Se corren **individualmente** con `DATABASE_URL` exportada inline; **nunca** `pnpm test -- <file>` (corre todo en paralelo y causa carrera sobre la tabla real). Usar `pnpm test <file>` sin `--`.
- **`pnpm db:push` cuelga con el pooler de Supabase.** Las migraciones se aplican con un script throwaway vía cliente `postgres` directo + verificación por `information_schema`, y el script se borra antes de commitear.
- Seguir el patrón existente de Financiadores: `lib/db/funders.ts`, `lib/db/funder-actions.ts`, `lib/db/funders-seed.ts`, `scripts/seed-funders.ts`, `app/financiadores/page.tsx`, `components/funders/*`.
- Mantener verde la suite (163 tests al inicio de este plan) y typecheck limpio; `pnpm build` con el detalle dinámico.

---

### Task 1: Tabla `allies` (schema Drizzle + migración aplicada)

**Files:**
- Modify: `lib/db/schema.ts` (agregar al final, después del bloque `drafts`)
- Throwaway (crear, aplicar, **borrar antes de commit**): `scripts/apply-allies-migration.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: tabla Drizzle `allies` y tipos `AllyRow` / `NewAllyRow` con esta forma exacta:
  `{ id: string; name: string; type: string; country: string|null; capabilities: string|null; experience: string|null; contact: string|null; recommendedRole: string|null; reputation: 'alto'|'medio'|'bajo'; updatedAt: Date }`.

- [ ] **Step 1: Agregar la tabla `allies` al schema**

En `lib/db/schema.ts`, agregá al final del archivo:

```ts
export const allies = pgTable('allies', {
  id: text('id').primaryKey(), // slug, ej. 'univ-nacional'
  name: text('name').notNull(),
  type: text('type').notNull(), // matchea ally_type de las brechas
  country: text('country'),
  capabilities: text('capabilities'), // qué hacen (para el solapamiento)
  experience: text('experience'),
  contact: text('contact'),
  recommendedRole: text('recommended_role'), // rol típico
  reputation: text('reputation').$type<'alto' | 'medio' | 'bajo'>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AllyRow = typeof allies.$inferSelect
export type NewAllyRow = typeof allies.$inferInsert
```

(No hace falta tocar los imports: `pgTable`, `text`, `timestamp` ya están importados.)

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (sin errores).

- [ ] **Step 3: Crear el script throwaway de migración**

Crear `scripts/apply-allies-migration.ts`:

```ts
import '../lib/load-env'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida')
  const sql = postgres(url, { prepare: false })
  await sql`
    CREATE TABLE IF NOT EXISTS allies (
      id text PRIMARY KEY,
      name text NOT NULL,
      type text NOT NULL,
      country text,
      capabilities text,
      experience text,
      contact text,
      recommended_role text,
      reputation text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'allies' ORDER BY column_name;
  `
  console.error('[apply-allies-migration] columnas:', cols.map((c) => c.column_name).join(', '))
  await sql.end()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: Aplicar y verificar la migración**

Run: `pnpm exec tsx scripts/apply-allies-migration.ts`
Expected: imprime `[apply-allies-migration] columnas: capabilities, contact, country, experience, id, name, recommended_role, reputation, type, updated_at`

- [ ] **Step 5: Borrar el script throwaway**

Run: `rm scripts/apply-allies-migration.ts`
Expected: el archivo ya no existe (no se commitea).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(alianzas): tabla allies (schema + migración aplicada)"
```

---

### Task 2: Matcher puro `lib/agent/alliance/match.ts`

**Files:**
- Create: `lib/agent/alliance/match.ts`
- Test: `lib/agent/alliance/match.test.ts`

**Interfaces:**
- Consumes: nada (puro, sin DB).
- Produces:
  - `interface AllyProfile { name: string; type: string; country?: string | null; capabilities?: string | null; recommendedRole?: string | null; reputation: 'alto' | 'medio' | 'bajo' }`
  - `interface PartnerGap { ally_type: string; suggested_role: string; priority: 'bajo' | 'medio' | 'alto'; reason: string }`
  - `interface MatchContext { themes: string; country: string | null }`
  - `interface AllyCandidate { ally: AllyProfile; score: number }`
  - `interface GapSuggestion { gap: PartnerGap; candidates: AllyCandidate[] }`
  - `function scoreAlly(gap: PartnerGap, ally: AllyProfile, context: MatchContext): number` (0-100)
  - `function suggestAllies(partnersNeeded: PartnerGap[], allies: AllyProfile[], context: MatchContext, opts?: { top?: number }): GapSuggestion[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/agent/alliance/match.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scoreAlly, suggestAllies, type AllyProfile, type PartnerGap, type MatchContext } from './match'

const gap: PartnerGap = { ally_type: 'universidad', suggested_role: 'validación científica', priority: 'alto', reason: 'falta rigor' }
const ctx: MatchContext = { themes: 'agricultura seguridad alimentaria innovación', country: null }

const universidad: AllyProfile = {
  name: 'Universidad Nacional', type: 'universidad / centro de investigación', country: 'Colombia',
  capabilities: 'investigación aplicada validación medición impacto', recommendedRole: 'Socio científico', reputation: 'alto',
}
const ong: AllyProfile = {
  name: 'Fundación Raíces', type: 'ONG / fundación local', country: 'Colombia',
  capabilities: 'trabajo comunitario llegada territorial', recommendedRole: 'Implementador', reputation: 'medio',
}

describe('scoreAlly', () => {
  it('el match de tipo sube el score', () => {
    expect(scoreAlly(gap, universidad, ctx)).toBeGreaterThan(scoreAlly(gap, ong, ctx))
  })

  it('a igualdad de lo demás, mayor reputación da más score', () => {
    const alto: AllyProfile = { name: 'A', type: 'universidad', reputation: 'alto' }
    const bajo: AllyProfile = { name: 'B', type: 'universidad', reputation: 'bajo' }
    expect(scoreAlly(gap, alto, ctx)).toBeGreaterThan(scoreAlly(gap, bajo, ctx))
  })

  it('la complementariedad de capacidades vs temas sube el score', () => {
    const sinTemas: AllyProfile = { name: 'C', type: 'universidad', capabilities: 'cocina repostería', reputation: 'medio' }
    const conTemas: AllyProfile = { name: 'D', type: 'universidad', capabilities: 'agricultura innovación', reputation: 'medio' }
    expect(scoreAlly(gap, conTemas, ctx)).toBeGreaterThan(scoreAlly(gap, sinTemas, ctx))
  })

  it('la geografía aporta cuando ambos países coinciden', () => {
    const ctxCo: MatchContext = { themes: '', country: 'Colombia' }
    const ctxNull: MatchContext = { themes: '', country: null }
    const a: AllyProfile = { name: 'E', type: 'x', country: 'Colombia', reputation: 'bajo' }
    expect(scoreAlly(gap, a, ctxCo)).toBeGreaterThan(scoreAlly(gap, a, ctxNull))
  })

  it('score 0 cuando no hay ninguna señal', () => {
    const nada: AllyProfile = { name: 'Z', type: 'banco', capabilities: 'finanzas', reputation: 'bajo' }
    expect(scoreAlly(gap, nada, ctx)).toBe(0)
  })
})

describe('suggestAllies', () => {
  it('rankea desc y limita al top-N', () => {
    const res = suggestAllies([gap], [ong, universidad], ctx, { top: 1 })
    expect(res).toHaveLength(1)
    expect(res[0].candidates).toHaveLength(1)
    expect(res[0].candidates[0].ally.name).toBe('Universidad Nacional')
  })

  it('descarta candidatos con score 0', () => {
    const nada: AllyProfile = { name: 'Z', type: 'banco', capabilities: 'finanzas', reputation: 'bajo' }
    const res = suggestAllies([gap], [nada], ctx)
    expect(res[0].candidates).toHaveLength(0)
  })

  it('partnersNeeded vacío → []', () => {
    expect(suggestAllies([], [universidad], ctx)).toEqual([])
  })

  it('aliados vacíos → cada brecha con candidates []', () => {
    const res = suggestAllies([gap], [], ctx)
    expect(res).toEqual([{ gap, candidates: [] }])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test lib/agent/alliance/match.test.ts`
Expected: FAIL con "Failed to resolve import './match'" / "scoreAlly is not a function".

- [ ] **Step 3: Implementar el matcher**

Crear `lib/agent/alliance/match.ts`:

```ts
export interface AllyProfile {
  name: string
  type: string
  country?: string | null
  capabilities?: string | null
  recommendedRole?: string | null
  reputation: 'alto' | 'medio' | 'bajo'
}

export interface PartnerGap {
  ally_type: string
  suggested_role: string
  priority: 'bajo' | 'medio' | 'alto'
  reason: string
}

export interface MatchContext {
  themes: string
  country: string | null
}

export interface AllyCandidate {
  ally: AllyProfile
  score: number
}

export interface GapSuggestion {
  gap: PartnerGap
  candidates: AllyCandidate[]
}

const REPUTATION_SCORE: Record<AllyProfile['reputation'], number> = { alto: 10, medio: 5, bajo: 0 }

// Tokeniza a palabras significativas (>=3 caracteres) en minúsculas, sin acentos para
// que "alcaldía"/"alcaldia" matcheen. Captura siglas como ONG (3 letras).
function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set()
  const norm = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return new Set(norm.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3))
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

// 0-100: tipo (0|50) + complementariedad (0..30) + geografía (0|10) + reputación (0|5|10).
export function scoreAlly(gap: PartnerGap, ally: AllyProfile, context: MatchContext): number {
  const typeScore = overlapCount(tokenize(gap.ally_type), tokenize(ally.type)) > 0 ? 50 : 0
  const capScore = Math.min(30, overlapCount(tokenize(ally.capabilities), tokenize(context.themes)) * 10)
  const geoScore =
    ally.country && context.country &&
    ally.country.trim().toLowerCase() === context.country.trim().toLowerCase()
      ? 10
      : 0
  const repScore = REPUTATION_SCORE[ally.reputation]
  return typeScore + capScore + geoScore + repScore
}

export function suggestAllies(
  partnersNeeded: PartnerGap[],
  allies: AllyProfile[],
  context: MatchContext,
  opts?: { top?: number },
): GapSuggestion[] {
  const top = opts?.top ?? 3
  return partnersNeeded.map((gap) => {
    const candidates = allies
      .map((ally) => ({ ally, score: scoreAlly(gap, ally, context) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
    return { gap, candidates }
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test lib/agent/alliance/match.test.ts`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/alliance/match.ts lib/agent/alliance/match.test.ts
git commit -m "feat(alianzas): matcher puro scoreAlly/suggestAllies (Fit Score)"
```

---

### Task 3: Queries `lib/db/allies.ts` + `rowToProfile`

**Files:**
- Create: `lib/db/allies.ts`
- Test: `lib/db/allies.test.ts`

**Interfaces:**
- Consumes: `allies`, `AllyRow` (Task 1); `AllyProfile` (Task 2).
- Produces:
  - `listAllies(): Promise<AllyRow[]>` (orden por `name` asc)
  - `getAlly(id: string): Promise<AllyRow | undefined>`
  - `rowToProfile(row: AllyRow): AllyProfile`

- [ ] **Step 1: Escribir el test de integración que falla**

Crear `lib/db/allies.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { allies } from './schema'
import { listAllies, getAlly, rowToProfile } from './allies'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('allies queries (integración)', () => {
  beforeEach(async () => { await db.delete(allies) })

  it('listAllies devuelve ordenado por name', async () => {
    await db.insert(allies).values([
      { id: 'b', name: 'Beta', type: 'universidad', reputation: 'alto' },
      { id: 'a', name: 'Alfa', type: 'ONG', reputation: 'medio' },
    ])
    const rows = await listAllies()
    expect(rows.map((r) => r.name)).toEqual(['Alfa', 'Beta'])
  })

  it('getAlly devuelve uno o undefined', async () => {
    await db.insert(allies).values({ id: 'a', name: 'Alfa', type: 'ONG', reputation: 'medio' })
    expect((await getAlly('a'))?.name).toBe('Alfa')
    expect(await getAlly('nope')).toBeUndefined()
  })

  it('rowToProfile proyecta el subset esperado', async () => {
    await db.insert(allies).values({
      id: 'a', name: 'Alfa', type: 'ONG', country: 'Colombia',
      capabilities: 'territorio', recommendedRole: 'Implementador', reputation: 'medio',
    })
    const row = await getAlly('a')
    expect(rowToProfile(row!)).toEqual({
      name: 'Alfa', type: 'ONG', country: 'Colombia',
      capabilities: 'territorio', recommendedRole: 'Implementador', reputation: 'medio',
    })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/allies.test.ts`
Expected: FAIL con "Failed to resolve import './allies'".

- [ ] **Step 3: Implementar las queries**

Crear `lib/db/allies.ts`:

```ts
import { asc, eq } from 'drizzle-orm'
import { db } from './client'
import { allies, type AllyRow } from './schema'
import type { AllyProfile } from '@/lib/agent/alliance/match'

export async function listAllies(): Promise<AllyRow[]> {
  return db.select().from(allies).orderBy(asc(allies.name))
}

export async function getAlly(id: string): Promise<AllyRow | undefined> {
  const rows = await db.select().from(allies).where(eq(allies.id, id)).limit(1)
  return rows[0]
}

export function rowToProfile(row: AllyRow): AllyProfile {
  return {
    name: row.name,
    type: row.type,
    country: row.country,
    capabilities: row.capabilities,
    recommendedRole: row.recommendedRole,
    reputation: row.reputation,
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/allies.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add lib/db/allies.ts lib/db/allies.test.ts
git commit -m "feat(alianzas): queries listAllies/getAlly/rowToProfile"
```

---

### Task 4: Seed de aliados (`allies-seed.ts` + script + test)

**Files:**
- Create: `lib/db/allies-seed.ts`
- Create: `scripts/seed-allies.ts`
- Test: `lib/db/allies-seed.test.ts`
- Modify: `package.json` (línea de scripts, junto a `seed:funders`)

**Interfaces:**
- Consumes: `NewAllyRow` (Task 1); `allies` (Task 1).
- Produces: `ALLY_SEED: NewAllyRow[]` (~6 aliados); script `pnpm seed:allies`.

- [ ] **Step 1: Escribir el test puro que falla**

Crear `lib/db/allies-seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ALLY_SEED } from './allies-seed'

describe('ALLY_SEED', () => {
  it('tiene ~6 aliados con id único', () => {
    expect(ALLY_SEED.length).toBeGreaterThanOrEqual(6)
    expect(new Set(ALLY_SEED.map((a) => a.id)).size).toBe(ALLY_SEED.length)
  })

  it('name/type no vacíos y reputation válida', () => {
    for (const a of ALLY_SEED) {
      expect(a.name.trim().length).toBeGreaterThan(0)
      expect(a.type.trim().length).toBeGreaterThan(0)
      expect(['alto', 'medio', 'bajo']).toContain(a.reputation)
    }
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test lib/db/allies-seed.test.ts`
Expected: FAIL con "Failed to resolve import './allies-seed'".

- [ ] **Step 3: Implementar el seed**

Crear `lib/db/allies-seed.ts`:

```ts
import type { NewAllyRow } from './schema'

export const ALLY_SEED: NewAllyRow[] = [
  { id: 'univ-nacional', name: 'Universidad Nacional', type: 'universidad / centro de investigación', country: 'Colombia',
    capabilities: 'Investigación aplicada, validación científica, formulación de teoría de cambio, medición de impacto.',
    experience: 'Proyectos CTeI con Minciencias y cooperación internacional.',
    contact: 'vicerrectoria.investigacion@unal.edu.co', recommendedRole: 'Socio científico / validación', reputation: 'alto' },
  { id: 'fundacion-local', name: 'Fundación Raíces', type: 'ONG / fundación local', country: 'Colombia',
    capabilities: 'Trabajo comunitario, llegada territorial, enfoque social, cofinanciación.',
    experience: 'Implementación de proyectos rurales y sociales en regiones apartadas.',
    contact: 'alianzas@raices.org', recommendedRole: 'Implementador territorial', reputation: 'medio' },
  { id: 'foundation-nova', name: 'Foundation Nova', type: 'socio internacional / fundación', country: 'Estados Unidos',
    capabilities: 'Cofinanciación, redes internacionales, escalamiento, evidencia de impacto.',
    experience: 'Cofinancia pilotos de innovación con potencial de escala global.',
    contact: 'partnerships@nova.org', recommendedRole: 'Cofinanciador / partner internacional', reputation: 'alto' },
  { id: 'agrotech-partners', name: 'AgroTech Partners', type: 'socio internacional / empresa', country: 'España',
    capabilities: 'Consorcios europeos, transferencia tecnológica, rol coordinador, escalabilidad.',
    experience: 'Coordina consorcios Horizon Europe e Innovate UK.',
    contact: 'consortia@agrotechpartners.eu', recommendedRole: 'Coordinador de consorcio', reputation: 'medio' },
  { id: 'ecomonitor', name: 'EcoMonitor', type: 'especialista ambiental', country: 'Colombia',
    capabilities: 'Monitoreo ambiental, restauración, biodiversidad, datos satelitales, alertas tempranas.',
    experience: 'Proyectos de restauración y monitoreo con corporaciones ambientales (CAR).',
    contact: 'proyectos@ecomonitor.co', recommendedRole: 'Especialista ambiental', reputation: 'medio' },
  { id: 'gobernacion-aliada', name: 'Gobernación aliada', type: 'alcaldía / gobernación', country: 'Colombia',
    capabilities: 'Contrapartida pública, articulación territorial, sostenibilidad, política pública.',
    experience: 'Convenios de cofinanciación y articulación con proyectos regionales.',
    contact: 'despacho@gobernacion.gov.co', recommendedRole: 'Socio público / contrapartida', reputation: 'medio' },
]
```

- [ ] **Step 4: Crear el script de seed**

Crear `scripts/seed-allies.ts`:

```ts
import '../lib/load-env'
import { db } from '../lib/db/client'
import { allies } from '../lib/db/schema'
import { ALLY_SEED } from '../lib/db/allies-seed'

async function main() {
  await db.delete(allies)
  await db.insert(allies).values(ALLY_SEED)
  console.error(`[seed-allies] Insertados ${ALLY_SEED.length} aliados.`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 5: Agregar el script a package.json**

En `package.json`, en el bloque `"scripts"`, agregá la línea tras `"seed:funders"` (acordate de la coma al final de la línea anterior):

```json
    "seed:funders": "tsx scripts/seed-funders.ts",
    "seed:allies": "tsx scripts/seed-allies.ts"
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `pnpm test lib/db/allies-seed.test.ts`
Expected: PASS (2/2).

- [ ] **Step 7: Sembrar la base (verificación real)**

Run: `pnpm seed:allies`
Expected: `[seed-allies] Insertados 6 aliados.`

- [ ] **Step 8: Commit**

```bash
git add lib/db/allies-seed.ts scripts/seed-allies.ts lib/db/allies-seed.test.ts package.json
git commit -m "feat(alianzas): seed de ~6 aliados + pnpm seed:allies"
```

---

### Task 5: Server actions `lib/db/ally-actions.ts`

**Files:**
- Create: `lib/db/ally-actions.ts`
- Test: `lib/db/ally-actions.test.ts`

**Interfaces:**
- Consumes: `allies`, `NewAllyRow` (Task 1); `getAlly` (Task 3).
- Produces:
  - `createAllyAction(row: NewAllyRow): Promise<void>` (upsert por id, `revalidatePath('/aliados')`)
  - `updateAllyAction(id: string, patch: Partial<Omit<NewAllyRow, 'id'>>): Promise<void>`
  - `deleteAllyAction(id: string): Promise<void>`

- [ ] **Step 1: Escribir el test de integración que falla**

Crear `lib/db/ally-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { allies } from './schema'
import { getAlly } from './allies'
import { createAllyAction, updateAllyAction, deleteAllyAction } from './ally-actions'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('ally actions (integración)', () => {
  beforeEach(async () => { await db.delete(allies) })

  it('create/update/delete round-trip', async () => {
    await createAllyAction({ id: 'unal', name: 'UNAL', type: 'universidad', reputation: 'alto' })
    expect((await getAlly('unal'))?.name).toBe('UNAL')
    await updateAllyAction('unal', { capabilities: 'investigación' })
    expect((await getAlly('unal'))?.capabilities).toBe('investigación')
    await deleteAllyAction('unal')
    expect(await getAlly('unal')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/ally-actions.test.ts`
Expected: FAIL con "Failed to resolve import './ally-actions'".

- [ ] **Step 3: Implementar las actions**

Crear `lib/db/ally-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { allies } from './schema'
import type { NewAllyRow } from './schema'

export async function createAllyAction(row: NewAllyRow): Promise<void> {
  await db.insert(allies).values(row)
    .onConflictDoUpdate({ target: allies.id, set: { ...row, updatedAt: new Date() } })
  revalidatePath('/aliados')
}

export async function updateAllyAction(
  id: string, patch: Partial<Omit<NewAllyRow, 'id'>>,
): Promise<void> {
  await db.update(allies).set({ ...patch, updatedAt: new Date() }).where(eq(allies.id, id))
  revalidatePath('/aliados')
}

export async function deleteAllyAction(id: string): Promise<void> {
  await db.delete(allies).where(eq(allies.id, id))
  revalidatePath('/aliados')
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test lib/db/ally-actions.test.ts`
Expected: PASS (1/1).

- [ ] **Step 5: Commit**

```bash
git add lib/db/ally-actions.ts lib/db/ally-actions.test.ts
git commit -m "feat(alianzas): server actions create/update/delete de aliados"
```

---

### Task 6: CRUD UI `/aliados` + link en nav

**Files:**
- Create: `app/aliados/page.tsx`
- Create: `components/allies/ally-form.tsx`
- Create: `components/allies/ally-list.tsx`
- Modify: `components/nav-header.tsx` (array `LINKS`)

**Interfaces:**
- Consumes: `listAllies` (Task 3); `createAllyAction`, `updateAllyAction`, `deleteAllyAction` (Task 5); `AllyRow` (Task 1).
- Produces: ruta `/aliados` con CRUD; link "Aliados" en el nav.

- [ ] **Step 1: Crear el formulario de aliado**

Crear `components/allies/ally-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AllyRow } from '@/lib/db/schema'
import { createAllyAction, updateAllyAction } from '@/lib/db/ally-actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const FIELDS: { key: keyof AllyRow; label: string }[] = [
  { key: 'country', label: 'País' },
  { key: 'capabilities', label: 'Capacidades (qué hacen)' },
  { key: 'experience', label: 'Experiencia' },
  { key: 'contact', label: 'Contacto' },
  { key: 'recommendedRole', label: 'Rol recomendado' },
]

export function AllyForm({ ally, onDone }: { ally?: AllyRow; onDone?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const editing = !!ally

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const id = String(fd.get('id') ?? '').trim()
    const name = String(fd.get('name') ?? '').trim()
    const type = String(fd.get('type') ?? '').trim()
    const reputation = String(fd.get('reputation') ?? '').trim() as AllyRow['reputation']
    if (!name || !type || !['alto', 'medio', 'bajo'].includes(reputation)) {
      setError('Nombre, tipo y reputación son obligatorios.'); return
    }
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    const patch = Object.fromEntries(FIELDS.map((f) => [f.key, text(f.key as string)]))
    setError(null)
    start(async () => {
      if (editing) await updateAllyAction(ally!.id, { name, type, reputation, ...patch })
      else await createAllyAction({ id: id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type, reputation, ...patch })
      router.refresh()
      onDone?.()
    })
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{editing ? `Editar ${ally!.name}` : 'Nuevo aliado'}</p>
        {!editing && <input name="id" placeholder="id (slug, opcional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />}
        <input name="name" defaultValue={ally?.name ?? ''} placeholder="Nombre *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="type" defaultValue={ally?.type ?? ''} placeholder="Tipo (universidad, ONG, alcaldía, socio internacional…) *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select name="reputation" defaultValue={ally?.reputation ?? 'medio'} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="alto">Reputación: alto</option>
          <option value="medio">Reputación: medio</option>
          <option value="bajo">Reputación: bajo</option>
        </select>
        {FIELDS.map((f) => (
          <textarea key={f.key as string} name={f.key as string} defaultValue={(ally?.[f.key] as string | null) ?? ''} placeholder={f.label}
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

- [ ] **Step 2: Crear la lista de aliados**

Crear `components/allies/ally-list.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AllyRow } from '@/lib/db/schema'
import { deleteAllyAction } from '@/lib/db/ally-actions'
import { AllyForm } from './ally-form'
import { Card } from '@/components/ui/card'

export function AllyList({ allies }: { allies: AllyRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (allies.length === 0) return <p className="text-sm text-muted-foreground">No hay aliados cargados.</p>

  return (
    <div className="flex flex-col gap-3">
      {allies.map((a) => editing === a.id ? (
        <AllyForm key={a.id} ally={a} onDone={() => setEditing(null)} />
      ) : (
        <Card key={a.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium">{a.name}</p>
            <p className="truncate text-xs text-muted-foreground">{a.type} · reputación {a.reputation}{a.country ? ` · ${a.country}` : ''}</p>
            {a.capabilities && <p className="mt-1 text-sm text-muted-foreground">{a.capabilities}</p>}
          </div>
          <div className="flex shrink-0 gap-2 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setEditing(a.id)}>Editar</button>
            <button type="button" className="text-red-600 hover:underline" disabled={pending}
              onClick={() => { if (confirm(`¿Eliminar ${a.name}?`)) start(async () => { await deleteAllyAction(a.id); router.refresh() }) }}>
              Eliminar
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Crear la página `/aliados`**

Crear `app/aliados/page.tsx`:

```tsx
import { listAllies } from '@/lib/db/allies'
import { AllyList } from '@/components/allies/ally-list'
import { AllyForm } from '@/components/allies/ally-form'

export const dynamic = 'force-dynamic'

export default async function AlliesPage() {
  const allies = await listAllies()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Aliados</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Base curada de aliados que el agente usa para sugerir socios por cada brecha de una oportunidad.
      </p>
      <AllyForm />
      <AllyList allies={allies} />
    </main>
  )
}
```

- [ ] **Step 4: Agregar el link en el nav**

En `components/nav-header.tsx`, agregá la entrada al array `LINKS` después de `'/financiadores'`:

```tsx
const LINKS = [
  { href: '/', label: 'Analizar' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/financiadores', label: 'Financiadores' },
  { href: '/aliados', label: 'Aliados' },
  { href: '/radar', label: 'Radar' },
]
```

- [ ] **Step 5: Verificar typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS (build OK, `/aliados` aparece como ruta dinámica).

- [ ] **Step 6: Commit**

```bash
git add app/aliados components/allies components/nav-header.tsx
git commit -m "feat(alianzas): CRUD /aliados + link en nav"
```

---

### Task 7: Sección "Aliados sugeridos" en el detalle

**Files:**
- Create: `components/allies/allies-suggested.tsx`
- Modify: `app/oportunidad/[id]/page.tsx`

**Interfaces:**
- Consumes: `listAllies`, `rowToProfile` (Task 3); `suggestAllies`, `GapSuggestion` (Task 2); `getOpportunity` (existente).
- Produces: componente presentacional `AlliesSuggested` y su cableado en el detalle (con fallback ante DB caída).

- [ ] **Step 1: Crear el componente presentacional**

Crear `components/allies/allies-suggested.tsx` (Server Component, sin estado):

```tsx
import type { GapSuggestion } from '@/lib/agent/alliance/match'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function AlliesSuggested({ suggestions }: { suggestions: GapSuggestion[] }) {
  const hasGaps = suggestions.length > 0
  const hasAny = suggestions.some((s) => s.candidates.length > 0)

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Aliados sugeridos</h2>
      {!hasGaps && (
        <p className="text-sm text-muted-foreground">El análisis no identificó brechas de aliados para esta oportunidad.</p>
      )}
      {hasGaps && !hasAny && (
        <p className="text-sm text-muted-foreground">
          No hay aliados en la base que encajen con estas brechas. Cargá aliados en la sección Aliados.
        </p>
      )}
      {hasGaps && hasAny && (
        <div className="flex flex-col gap-4">
          {suggestions.map((s, i) => (
            <div key={i}>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-medium">{s.gap.ally_type}</p>
                <span className="text-xs text-muted-foreground">rol sugerido: {s.gap.suggested_role}</span>
                <Badge variant="outline">prioridad {s.gap.priority}</Badge>
              </div>
              <p className="mb-2 text-sm text-muted-foreground">{s.gap.reason}</p>
              {s.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin aliados que encajen en la base.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {s.candidates.map((c) => (
                    <li key={c.ally.name} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{c.ally.name}</p>
                        <Badge>Fit {c.score}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.ally.type}</p>
                      {c.ally.recommendedRole && (
                        <p className="mt-1 text-sm text-muted-foreground">Rol: {c.ally.recommendedRole}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Cablear el detalle (server-side + fallback)**

Reescribir `app/oportunidad/[id]/page.tsx` para calcular las sugerencias y renderizar la sección. Si la DB de aliados falla, la sección cae a vacío sin romper el resto:

```tsx
import { notFound } from 'next/navigation'
import { getOpportunity } from '@/lib/db/queries'
import { listDrafts } from '@/lib/db/drafts'
import { listAllies, rowToProfile } from '@/lib/db/allies'
import { suggestAllies, type GapSuggestion } from '@/lib/agent/alliance/match'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'
import { DraftsSection } from '@/components/drafts/drafts-section'
import { AlliesSuggested } from '@/components/allies/allies-suggested'

export const dynamic = 'force-dynamic'

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const o = await getOpportunity(id)
  if (!o) return notFound()
  const draftMap = new Map((await listDrafts(id)).map((d) => [d.kind, d]))

  let suggestions: GapSuggestion[] = []
  try {
    const allies = await listAllies()
    suggestions = suggestAllies(
      o.analysis.partners_needed,
      allies.map(rowToProfile),
      { themes: `${o.analysis.source.name} ${o.analysis.draft_outputs?.executive_summary ?? ''}`, country: null },
    )
  } catch (e) {
    console.error('[oportunidad] no se pudieron cargar aliados sugeridos:', e)
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <StateControl o={o} />
      <AnalysisView analysis={o.analysis} />
      <AlliesSuggested suggestions={suggestions} />
      <DraftsSection opportunityId={id} drafts={draftMap} />
      <TaskList o={o} />
    </main>
  )
}
```

> Nota para el implementador: confirmá los nombres exactos `o.analysis.partners_needed`, `o.analysis.source.name` y `o.analysis.draft_outputs?.executive_summary` contra `lib/agent/schema.ts` (`OpportunityAnalysis`). Si `draft_outputs` o `executive_summary` no fueran opcionales/así nombrados, ajustá el acceso para que el typecheck pase sin cambiar la intención (themes = nombre de la fuente + resumen ejecutivo si existe).

- [ ] **Step 3: Verificar typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS (el detalle sigue dinámico, sin errores de tipos).

- [ ] **Step 4: Correr la suite completa**

Run: `DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)" pnpm test`
Expected: PASS (toda la suite verde, incluyendo los nuevos tests de alianzas).

- [ ] **Step 5: Commit**

```bash
git add components/allies/allies-suggested.tsx app/oportunidad/[id]/page.tsx
git commit -m "feat(alianzas): sección Aliados sugeridos en el detalle de oportunidad"
```

---

## Self-Review

**1. Spec coverage:**
- Tabla `allies` §15 → Task 1 ✓ (todas las columnas de la tabla del spec).
- Matcher puro `scoreAlly`/`suggestAllies`, pesos tipo/complementariedad/geografía/reputación → Task 2 ✓.
- `AllyProfile` como subset (name, type, country, capabilities, recommendedRole, reputation) → Task 2 ✓.
- `listAllies`/`getAlly`/`rowToProfile` → Task 3 ✓.
- Server actions create/update/delete + revalidate `/aliados` → Task 5 ✓.
- Seed ~6 aliados + `pnpm seed:allies` → Task 4 ✓.
- CRUD UI `/aliados` + link en nav → Task 6 ✓.
- Sección "Aliados sugeridos" en el detalle, server-side, `country: null`, fallback ante DB caída, estados vacíos → Task 7 ✓.
- Testing (match puro, allies integración, ally-actions integración, seed puro, suite verde, build) → cubierto en cada tarea ✓.
- Sin variables de entorno nuevas → respetado ✓.
- Fuera de alcance (mensajes de acercamiento, factores que requieren más datos, LLM/embeddings, persistir aliado elegido) → no incluidos ✓.

**2. Placeholder scan:** Sin TBD/TODO. Todo el código está completo y literal. La única nota "confirmá nombres" (Task 7 Step 2) es una verificación de tipos contra un archivo existente, con instrucción explícita de qué hacer — no un placeholder de implementación.

**3. Type consistency:**
- `AllyProfile` definido en Task 2 con `{ name, type, country?, capabilities?, recommendedRole?, reputation }`; `rowToProfile` (Task 3) devuelve exactamente esas claves; el test de Task 3 las assert iguales ✓.
- `reputation: 'alto'|'medio'|'bajo'` consistente en schema (Task 1), match (Task 2), seed (Task 4), form/list (Task 6) ✓.
- `suggestAllies(partnersNeeded, allies, context, opts?)` y `GapSuggestion` usados igual en Task 2 (def), Task 7 (consumo) ✓.
- Nombres de columnas snake_case (`recommended_role`, `updated_at`) en la migración (Task 1 Step 3) coinciden con el mapeo Drizzle de Task 1 Step 1 ✓.
- `createAllyAction(row)` / `updateAllyAction(id, patch)` / `deleteAllyAction(id)` consistentes entre Task 5 (def), Task 6 (form/list consumo) ✓.
