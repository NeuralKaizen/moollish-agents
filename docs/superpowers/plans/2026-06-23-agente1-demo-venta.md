# Agente 1 — Demo de venta (Pipeline + Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una demo desplegada que muestre el Agente 1 como plataforma (analizador + pipeline + dashboard) sobre 5 casos reales del §20 pre-analizados, para vender a Moollish.

**Architecture:** Capa de datos cliente en memoria (`lib/demo/`) sembrada con análisis reales y persistida en `localStorage`, aislada de la UI por una interfaz `DemoStore`. Tres pantallas nuevas (pipeline, dashboard, detalle) leen del store vía un hook de React. La persistencia real con Neon es trabajo posterior; se reescribe solo `lib/demo/`.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TypeScript, Zod v4, Vitest, Tailwind v4 + shadcn/ui, AI SDK v6 + OpenRouter (ya integrado).

## Global Constraints

- Runtime/herramientas: **pnpm**; tests con **vitest** (`pnpm vitest run`), typecheck con **`pnpm typecheck`**, build con **`pnpm build`**.
- Tests solo en `lib/**/*.test.ts` (config de vitest). La lógica testeable vive en `lib/demo/`.
- Alias de imports: **`@/`** = raíz del repo.
- Copys de UI en **español**; formato de moneda con `Intl.NumberFormat('es-CO')` (ya en `lib/ui/format.ts`).
- No agregar base de datos, auth, ni dependencias nuevas de runtime. Reusar `OpportunityAnalysis` y los componentes de `components/analysis/`.
- Estados del pipeline = los 10 del §14, en este orden exacto: `detectada, analizada, priorizada, en_alianzas, en_formulacion, presentada, en_evaluacion, aprobada, rechazada, descartada`.
- El store nunca debe romper la pantalla: ante `localStorage` ausente/corrupto, cae a la semilla.

---

### Task 0: Rama y baseline

**Files:** (ninguno nuevo)

- [ ] **Step 1: Crear rama de trabajo**

Run:
```bash
git checkout -b feat/demo-venta
```

- [ ] **Step 2: Commitear el trabajo ya hecho en la sesión (pulidos de fidelidad + spec + roadmap)**

Run:
```bash
git add -A
git commit -m "docs+feat: pulido de fidelidad del agente, spec y roadmap de demo

- prompt: polaridad de sub-scores, taxonomía §6, contexto temporal, salida Anexo A
- schema: .describe() en todos los campos (Anexo A/C)
- lib/load-env: cargar .env.local en runners CLI
- sample FAO consistente; hint de polaridad en ScoreBreakdown
- docs: roadmap a 100% y spec de la demo de venta"
```

- [ ] **Step 3: Verificar baseline verde**

Run: `pnpm vitest run && pnpm typecheck`
Expected: 82 tests PASS, typecheck sin errores.

---

### Task 1: Tipos del dominio demo + derivación de tareas

**Files:**
- Create: `lib/demo/types.ts`
- Test: `lib/demo/types.test.ts`

**Interfaces:**
- Produces: `PIPELINE_STATES` (readonly tuple), `type PipelineState`, `interface DemoTask`, `interface DemoOpportunity`, `function tasksFromAnalysis(a: OpportunityAnalysis): DemoTask[]`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/demo/types.test.ts
import { describe, it, expect } from 'vitest'
import { PIPELINE_STATES, tasksFromAnalysis } from './types'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'

describe('PIPELINE_STATES', () => {
  it('tiene los 10 estados del §14 en orden', () => {
    expect(PIPELINE_STATES).toEqual([
      'detectada', 'analizada', 'priorizada', 'en_alianzas', 'en_formulacion',
      'presentada', 'en_evaluacion', 'aprobada', 'rechazada', 'descartada',
    ])
  })
})

describe('tasksFromAnalysis', () => {
  it('convierte next_actions en tareas no completadas', () => {
    const tasks = tasksFromAnalysis(SAMPLE_ANALYSIS)
    expect(tasks).toHaveLength(SAMPLE_ANALYSIS.next_actions.length)
    expect(tasks[0]).toEqual({
      action: SAMPLE_ANALYSIS.next_actions[0].action,
      responsible: SAMPLE_ANALYSIS.next_actions[0].responsible,
      due_date: SAMPLE_ANALYSIS.next_actions[0].due_date,
      dependency: SAMPLE_ANALYSIS.next_actions[0].dependency,
      done: false,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/demo/types.test.ts`
Expected: FAIL ("Failed to resolve import ./types").

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/demo/types.ts
import type { OpportunityAnalysis } from '@/lib/agent/schema'

export const PIPELINE_STATES = [
  'detectada', 'analizada', 'priorizada', 'en_alianzas', 'en_formulacion',
  'presentada', 'en_evaluacion', 'aprobada', 'rechazada', 'descartada',
] as const
export type PipelineState = (typeof PIPELINE_STATES)[number]

export interface DemoTask {
  action: string
  responsible: string
  due_date: string | null
  dependency: string | null
  done: boolean
}

export interface DemoOpportunity {
  analysis: OpportunityAnalysis
  state: PipelineState
  created_at: string            // ISO 8601
  responsible: string | null
  tasks: DemoTask[]
  decision_reason: string | null
}

export function tasksFromAnalysis(a: OpportunityAnalysis): DemoTask[] {
  return a.next_actions.map((n) => ({
    action: n.action,
    responsible: n.responsible,
    due_date: n.due_date,
    dependency: n.dependency,
    done: false,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/demo/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/demo/types.ts lib/demo/types.test.ts
git commit -m "feat(demo): tipos del pipeline y derivación de tareas"
```

---

### Task 2: Operaciones puras del store

**Files:**
- Create: `lib/demo/operations.ts`
- Test: `lib/demo/operations.test.ts`

**Interfaces:**
- Consumes: `DemoOpportunity`, `PipelineState`, `tasksFromAnalysis` (Task 1); `OpportunityAnalysis`.
- Produces:
  - `makeOpportunity(analysis: OpportunityAnalysis, createdAt: string): DemoOpportunity`
  - `addOpportunity(list: DemoOpportunity[], analysis: OpportunityAnalysis, createdAt: string): DemoOpportunity[]`
  - `setOpportunityState(list: DemoOpportunity[], id: string, state: PipelineState, reason?: string): DemoOpportunity[]`
  - `toggleOpportunityTask(list: DemoOpportunity[], id: string, index: number): DemoOpportunity[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/demo/operations.test.ts
import { describe, it, expect } from 'vitest'
import { addOpportunity, setOpportunityState, toggleOpportunityTask } from './operations'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'

const A = SAMPLE_ANALYSIS
const id = A.opportunity_id

describe('addOpportunity', () => {
  it('inserta al principio en estado analizada con tareas', () => {
    const list = addOpportunity([], A, '2026-06-23T00:00:00.000Z')
    expect(list).toHaveLength(1)
    expect(list[0].state).toBe('analizada')
    expect(list[0].created_at).toBe('2026-06-23T00:00:00.000Z')
    expect(list[0].tasks).toHaveLength(A.next_actions.length)
  })
  it('reemplaza (no duplica) si vuelve el mismo opportunity_id', () => {
    const list = addOpportunity(addOpportunity([], A, 't1'), A, 't2')
    expect(list).toHaveLength(1)
    expect(list[0].created_at).toBe('t2')
  })
})

describe('setOpportunityState', () => {
  it('cambia estado y guarda la razón', () => {
    const list = setOpportunityState(addOpportunity([], A, 't'), id, 'descartada', 'no alineada')
    expect(list[0].state).toBe('descartada')
    expect(list[0].decision_reason).toBe('no alineada')
  })
})

describe('toggleOpportunityTask', () => {
  it('alterna done de la tarea por índice', () => {
    const list = toggleOpportunityTask(addOpportunity([], A, 't'), id, 0)
    expect(list[0].tasks[0].done).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/demo/operations.test.ts`
Expected: FAIL ("Failed to resolve import ./operations").

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/demo/operations.ts
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, PipelineState } from './types'
import { tasksFromAnalysis } from './types'

export function makeOpportunity(analysis: OpportunityAnalysis, createdAt: string): DemoOpportunity {
  return {
    analysis,
    state: 'analizada',
    created_at: createdAt,
    responsible: null,
    tasks: tasksFromAnalysis(analysis),
    decision_reason: null,
  }
}

export function addOpportunity(
  list: DemoOpportunity[], analysis: OpportunityAnalysis, createdAt: string,
): DemoOpportunity[] {
  const withoutDup = list.filter((o) => o.analysis.opportunity_id !== analysis.opportunity_id)
  return [makeOpportunity(analysis, createdAt), ...withoutDup]
}

export function setOpportunityState(
  list: DemoOpportunity[], id: string, state: PipelineState, reason?: string,
): DemoOpportunity[] {
  return list.map((o) =>
    o.analysis.opportunity_id === id
      ? { ...o, state, decision_reason: reason ?? o.decision_reason }
      : o,
  )
}

export function toggleOpportunityTask(
  list: DemoOpportunity[], id: string, index: number,
): DemoOpportunity[] {
  return list.map((o) => {
    if (o.analysis.opportunity_id !== id) return o
    return { ...o, tasks: o.tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t)) }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/demo/operations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/demo/operations.ts lib/demo/operations.test.ts
git commit -m "feat(demo): operaciones puras del store (add/setState/toggleTask)"
```

---

### Task 3: Store con persistencia inyectable

**Files:**
- Create: `lib/demo/store.ts`
- Test: `lib/demo/store.test.ts`

**Interfaces:**
- Consumes: `DemoOpportunity`, `PipelineState` (Task 1); operaciones (Task 2); `OpportunityAnalysis`.
- Produces:
  - `interface KeyValueStorage { getItem(k): string|null; setItem(k,v): void; removeItem(k): void }`
  - `const DEMO_STORAGE_KEY = 'moollish.demo.v1'`
  - `interface DemoStore { getSnapshot(): DemoOpportunity[]; subscribe(l: () => void): () => void; add(a: OpportunityAnalysis): void; setState(id, state, reason?): void; toggleTask(id, index): void; reset(): void }`
  - `createStore(seed: DemoOpportunity[], storage: KeyValueStorage | null, now?: () => string): DemoStore`

- [ ] **Step 1: Write the failing test**

```ts
// lib/demo/store.test.ts
import { describe, it, expect } from 'vitest'
import { createStore, DEMO_STORAGE_KEY, type KeyValueStorage } from './store'
import { makeOpportunity } from './operations'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'

function memStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v },
    removeItem: (k) => { delete data[k] },
  }
}

const seed = [makeOpportunity(SAMPLE_ANALYSIS, '2026-06-20T00:00:00.000Z')]

describe('createStore', () => {
  it('siembra y persiste si el storage está vacío', () => {
    const storage = memStorage()
    const store = createStore(seed, storage)
    expect(store.getSnapshot()).toHaveLength(1)
    expect(storage.data[DEMO_STORAGE_KEY]).toContain(SAMPLE_ANALYSIS.opportunity_id)
  })

  it('rehidrata desde storage existente', () => {
    const storage = memStorage({ [DEMO_STORAGE_KEY]: JSON.stringify([]) })
    const store = createStore(seed, storage)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('cae a la semilla si el JSON está corrupto', () => {
    const storage = memStorage({ [DEMO_STORAGE_KEY]: '{no-json' })
    const store = createStore(seed, storage)
    expect(store.getSnapshot()).toHaveLength(1)
  })

  it('add notifica a los suscriptores y persiste', () => {
    const storage = memStorage()
    const store = createStore([], storage)
    let calls = 0
    store.subscribe(() => { calls += 1 })
    store.add(SAMPLE_ANALYSIS)
    expect(store.getSnapshot()).toHaveLength(1)
    expect(calls).toBe(1)
    expect(storage.data[DEMO_STORAGE_KEY]).toContain(SAMPLE_ANALYSIS.opportunity_id)
  })

  it('reset vuelve a la semilla', () => {
    const store = createStore(seed, memStorage())
    store.add({ ...SAMPLE_ANALYSIS, opportunity_id: 'otra' })
    expect(store.getSnapshot()).toHaveLength(2)
    store.reset()
    expect(store.getSnapshot()).toHaveLength(1)
  })

  it('funciona sin storage (null)', () => {
    const store = createStore(seed, null)
    expect(store.getSnapshot()).toHaveLength(1)
    store.add({ ...SAMPLE_ANALYSIS, opportunity_id: 'x' })
    expect(store.getSnapshot()).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/demo/store.test.ts`
Expected: FAIL ("Failed to resolve import ./store").

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/demo/store.ts
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, PipelineState } from './types'
import { addOpportunity, setOpportunityState, toggleOpportunityTask } from './operations'

export const DEMO_STORAGE_KEY = 'moollish.demo.v1'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DemoStore {
  getSnapshot(): DemoOpportunity[]
  subscribe(listener: () => void): () => void
  add(analysis: OpportunityAnalysis): void
  setState(id: string, state: PipelineState, reason?: string): void
  toggleTask(id: string, index: number): void
  reset(): void
}

export function createStore(
  seed: DemoOpportunity[],
  storage: KeyValueStorage | null,
  now: () => string = () => new Date().toISOString(),
): DemoStore {
  const listeners = new Set<() => void>()

  function persist(s: DemoOpportunity[]): void {
    storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(s))
  }
  function load(): DemoOpportunity[] {
    if (!storage) return seed
    const raw = storage.getItem(DEMO_STORAGE_KEY)
    if (raw === null) { persist(seed); return seed }
    try {
      return JSON.parse(raw) as DemoOpportunity[]
    } catch {
      persist(seed)
      return seed
    }
  }

  let state: DemoOpportunity[] = load()

  function commit(next: DemoOpportunity[]): void {
    state = next
    persist(state)
    listeners.forEach((l) => l())
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    add(analysis) { commit(addOpportunity(state, analysis, now())) },
    setState(id, s, reason) { commit(setOpportunityState(state, id, s, reason)) },
    toggleTask(id, index) { commit(toggleOpportunityTask(state, id, index)) },
    reset() { commit(seed) },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/demo/store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/demo/store.ts lib/demo/store.test.ts
git commit -m "feat(demo): store con persistencia inyectable y suscripción"
```

---

### Task 4: Generación del seed (5 casos §20 reales)

**Files:**
- Create: `scripts/seed.ts`
- Modify: `package.json` (script `seed`)
- Create: `lib/demo/analyses.generated.json` (salida del script, commiteada)
- Create: `lib/demo/seed.ts`
- Test: `lib/demo/seed.test.ts`

**Interfaces:**
- Consumes: `DemoOpportunity`, `PipelineState`, `tasksFromAnalysis` (Task 1); `OpportunityAnalysis`; `analyzeOpportunity`, `generateWithOpenRouter` (existentes).
- Produces: `const SEED_OPPORTUNITIES: DemoOpportunity[]` (5 elementos en estados variados).

- [ ] **Step 1: Agregar el script `seed` a package.json**

En `package.json`, dentro de `"scripts"`, agregar:
```json
    "seed": "tsx scripts/seed.ts",
```

- [ ] **Step 2: Escribir el generador `scripts/seed.ts`**

```ts
// scripts/seed.ts
import '../lib/load-env'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { analyzeOpportunity } from '../lib/agent/analyze'
import { generateWithOpenRouter } from '../lib/agent/llm'

const DIR = 'fixtures'
const files = readdirSync(DIR).filter((f) => f.endsWith('.txt'))
const out: Record<string, unknown> = {}

for (const f of files) {
  const key = f.replace(/\.txt$/, '')
  const text = readFileSync(`${DIR}/${f}`, 'utf8')
  console.error(`Analizando ${key}…`)
  out[key] = await analyzeOpportunity(text, { generate: generateWithOpenRouter })
}

writeFileSync('lib/demo/analyses.generated.json', JSON.stringify(out, null, 2) + '\n')
console.error(`✓ ${files.length} análisis → lib/demo/analyses.generated.json`)
```

- [ ] **Step 3: Generar los análisis reales (requiere `OPENROUTER_API_KEY` en `.env.local`)**

Run: `pnpm seed`
Expected: imprime "Analizando fao-agrinno…" etc. y crea `lib/demo/analyses.generated.json` con 5 claves (`div-fund-rural`, `fao-agrinno`, `fontagro-ganaderia`, `minciencias-966`, `secop-car-ambiental`).
Verificación rápida: `node -e "const o=require('./lib/demo/analyses.generated.json'); console.log(Object.keys(o))"` → 5 claves.

- [ ] **Step 4: Escribir el ensamblado `lib/demo/seed.ts`**

```ts
// lib/demo/seed.ts
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, PipelineState } from './types'
import { tasksFromAnalysis } from './types'
import generated from './analyses.generated.json'

interface SeedPlan { state: PipelineState; daysAgo: number; reason?: string }

// Estados curados para que el pipeline se vea variado en la demo (§14).
const PLAN: Record<string, SeedPlan> = {
  'fao-agrinno': { state: 'priorizada', daysAgo: 1 },
  'fontagro-ganaderia': { state: 'en_alianzas', daysAgo: 2 },
  'minciencias-966': { state: 'analizada', daysAgo: 0 },
  'div-fund-rural': { state: 'en_formulacion', daysAgo: 3 },
  'secop-car-ambiental': { state: 'descartada', daysAgo: 2, reason: 'Obra civil sin componente tecnológico suficiente para Sat2Farm.' },
}

const analyses = generated as Record<string, OpportunityAnalysis>
const NOW = Date.now()
const isoDaysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

export const SEED_OPPORTUNITIES: DemoOpportunity[] = Object.entries(PLAN)
  .filter(([key]) => analyses[key])
  .map(([key, plan]) => {
    const analysis = analyses[key]
    return {
      analysis,
      state: plan.state,
      created_at: isoDaysAgo(plan.daysAgo),
      responsible: null,
      tasks: tasksFromAnalysis(analysis),
      decision_reason: plan.reason ?? null,
    }
  })
```

- [ ] **Step 5: Write the seed test**

```ts
// lib/demo/seed.test.ts
import { describe, it, expect } from 'vitest'
import { SEED_OPPORTUNITIES } from './seed'
import { OpportunityAnalysisSchema } from '@/lib/agent/schema'

describe('SEED_OPPORTUNITIES', () => {
  it('siembra los 5 casos del §20', () => {
    expect(SEED_OPPORTUNITIES).toHaveLength(5)
  })
  it('cada análisis cumple el contrato OpportunityAnalysis', () => {
    for (const o of SEED_OPPORTUNITIES) {
      expect(() => OpportunityAnalysisSchema.parse(o.analysis)).not.toThrow()
    }
  })
  it('cubre estados variados del pipeline', () => {
    const states = new Set(SEED_OPPORTUNITIES.map((o) => o.state))
    expect(states.size).toBeGreaterThanOrEqual(4)
  })
  it('la oportunidad descartada registra su causa', () => {
    const descartada = SEED_OPPORTUNITIES.find((o) => o.state === 'descartada')
    expect(descartada?.decision_reason).toBeTruthy()
  })
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run lib/demo/seed.test.ts`
Expected: PASS (4 tests). Si falla por longitud != 5, revisar que `pnpm seed` haya generado las 5 claves.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed.ts package.json lib/demo/analyses.generated.json lib/demo/seed.ts lib/demo/seed.test.ts
git commit -m "feat(demo): seed de 5 casos §20 reales con estados curados"
```

---

### Task 5: Singleton del store + hooks de React

**Files:**
- Create: `lib/demo/use-store.ts`

**Interfaces:**
- Consumes: `createStore`, `KeyValueStorage` (Task 3); `SEED_OPPORTUNITIES` (Task 4).
- Produces: `const demoStore: DemoStore`; `useOpportunities(): DemoOpportunity[]`; `useOpportunity(id: string): DemoOpportunity | undefined`.

*(Sin test unitario: hook de React verificado por typecheck/build. La lógica subyacente ya está cubierta en Tasks 2-3.)*

- [ ] **Step 1: Implementar el singleton + hooks**

```ts
// lib/demo/use-store.ts
'use client'

import { useSyncExternalStore } from 'react'
import { createStore, type KeyValueStorage } from './store'
import { SEED_OPPORTUNITIES } from './seed'
import type { DemoOpportunity } from './types'

const browserStorage: KeyValueStorage | null =
  typeof window !== 'undefined' ? window.localStorage : null

export const demoStore = createStore(SEED_OPPORTUNITIES, browserStorage)

export function useOpportunities(): DemoOpportunity[] {
  return useSyncExternalStore(
    demoStore.subscribe,
    demoStore.getSnapshot,
    () => SEED_OPPORTUNITIES, // snapshot de servidor (SSR)
  )
}

export function useOpportunity(id: string): DemoOpportunity | undefined {
  return useOpportunities().find((o) => o.analysis.opportunity_id === id)
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/demo/use-store.ts
git commit -m "feat(demo): singleton del store + hooks useOpportunities/useOpportunity"
```

---

### Task 6: Agregaciones del dashboard (§19)

**Files:**
- Create: `lib/demo/dashboard.ts`
- Test: `lib/demo/dashboard.test.ts`

**Interfaces:**
- Consumes: `DemoOpportunity`, `DemoTask`, `PIPELINE_STATES`, `PipelineState` (Task 1); `OpportunityAnalysis`.
- Produces:
  - `montoUSD(f): number | null`
  - `newOpportunities(list, now: number, hours?): DemoOpportunity[]`
  - `pipelineByState(list): { state: PipelineState; count: number; totalUsd: number }[]`
  - `topToApply(list, n?): DemoOpportunity[]`
  - `criticalRisks(list): DemoOpportunity[]`
  - `requiredAllies(list): { ally_type: string; count: number }[]`
  - `potentialResources(list): number`
  - `actionsToday(list, now: number): { opportunity: DemoOpportunity; task: DemoTask }[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/demo/dashboard.test.ts
import { describe, it, expect } from 'vitest'
import {
  montoUSD, newOpportunities, pipelineByState, topToApply,
  criticalRisks, requiredAllies, potentialResources, actionsToday,
} from './dashboard'
import { makeOpportunity, setOpportunityState } from './operations'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'
import type { DemoOpportunity } from './types'

const NOW = Date.parse('2026-06-23T12:00:00.000Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

function opp(overrides: Partial<DemoOpportunity> = {}, analysisOverrides = {}): DemoOpportunity {
  const base = makeOpportunity({ ...SAMPLE_ANALYSIS, ...analysisOverrides }, iso(0))
  return { ...base, ...overrides }
}

describe('montoUSD', () => {
  it('usa estimated_usd si existe', () => {
    expect(montoUSD({ ...SAMPLE_ANALYSIS.funding_amount, estimated_usd: 1000 })).toBe(1000)
  })
  it('usa value si la moneda es USD y no hay estimado', () => {
    expect(montoUSD({ value: 500, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null, range_min: null, range_max: null })).toBe(500)
  })
  it('null si no se puede normalizar', () => {
    expect(montoUSD({ value: 500, currency: 'EUR', confirmed: true, estimated_cop: null, estimated_usd: null, range_min: null, range_max: null })).toBeNull()
  })
})

describe('newOpportunities', () => {
  it('filtra por ventana de 72h', () => {
    const list = [opp({ created_at: iso(0) }), opp({ created_at: iso(100 * 3_600_000) }, { opportunity_id: 'vieja' })]
    expect(newOpportunities(list, NOW, 72)).toHaveLength(1)
  })
})

describe('pipelineByState', () => {
  it('cuenta por estado en orden del §14', () => {
    const list = [opp(), setOpportunityState([opp({}, { opportunity_id: 'b' })], 'b', 'descartada')[0]]
    const buckets = pipelineByState(list)
    const analizada = buckets.find((b) => b.state === 'analizada')
    expect(analizada?.count).toBe(1)
  })
})

describe('topToApply', () => {
  it('ordena por score desc y respeta n', () => {
    const hi = opp({}, { opportunity_id: 'hi', overall_score: 90, recommendation: 'apply_now' })
    const lo = opp({}, { opportunity_id: 'lo', overall_score: 50, recommendation: 'apply_with_partner' })
    const out = topToApply([lo, hi], 10)
    expect(out[0].analysis.opportunity_id).toBe('hi')
  })
  it('excluye recomendaciones que no son aplicar', () => {
    const obs = opp({}, { opportunity_id: 'obs', recommendation: 'observe' })
    expect(topToApply([obs])).toHaveLength(0)
  })
})

describe('criticalRisks', () => {
  it('marca las que tienen gaps de elegibilidad', () => {
    const conGap = opp({}, { opportunity_id: 'g', eligibility: { ...SAMPLE_ANALYSIS.eligibility, gaps: ['falta socio'] } })
    expect(criticalRisks([conGap])).toHaveLength(1)
  })
})

describe('requiredAllies', () => {
  it('agrega partners_needed por tipo', () => {
    const out = requiredAllies([opp()])
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out[0]).toHaveProperty('count')
  })
})

describe('potentialResources', () => {
  it('suma monto USD ponderado por score', () => {
    const o = opp({}, { opportunity_id: 'r', overall_score: 50, funding_amount: { ...SAMPLE_ANALYSIS.funding_amount, estimated_usd: 1000 } })
    expect(potentialResources([o])).toBe(500)
  })
})

describe('actionsToday', () => {
  it('lista tareas no hechas con due_date <= hoy', () => {
    const o = opp()
    o.tasks = [{ action: 'x', responsible: 'y', due_date: '2026-06-23', dependency: null, done: false }]
    expect(actionsToday([o], NOW)).toHaveLength(1)
  })
  it('excluye tareas hechas', () => {
    const o = opp()
    o.tasks = [{ action: 'x', responsible: 'y', due_date: '2026-06-23', dependency: null, done: true }]
    expect(actionsToday([o], NOW)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/demo/dashboard.test.ts`
Expected: FAIL ("Failed to resolve import ./dashboard").

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/demo/dashboard.ts
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, DemoTask, PipelineState } from './types'
import { PIPELINE_STATES } from './types'

const APPLY = new Set<OpportunityAnalysis['recommendation']>(['apply_now', 'apply_with_partner'])

export function montoUSD(f: OpportunityAnalysis['funding_amount']): number | null {
  if (f.estimated_usd != null) return f.estimated_usd
  if (f.currency === 'USD' && f.value != null) return f.value
  return null
}

function deadlineMs(o: DemoOpportunity): number {
  const d = o.analysis.deadline.date
  return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY
}

export function newOpportunities(list: DemoOpportunity[], now: number, hours = 72): DemoOpportunity[] {
  const cutoff = now - hours * 3_600_000
  return list.filter((o) => new Date(o.created_at).getTime() >= cutoff)
}

export interface StateBucket { state: PipelineState; count: number; totalUsd: number }
export function pipelineByState(list: DemoOpportunity[]): StateBucket[] {
  return PIPELINE_STATES.map((state) => {
    const items = list.filter((o) => o.state === state)
    const totalUsd = items.reduce((s, o) => s + (montoUSD(o.analysis.funding_amount) ?? 0), 0)
    return { state, count: items.length, totalUsd }
  }).filter((b) => b.count > 0)
}

export function topToApply(list: DemoOpportunity[], n = 10): DemoOpportunity[] {
  return [...list]
    .filter((o) => APPLY.has(o.analysis.recommendation))
    .sort((a, b) => b.analysis.overall_score - a.analysis.overall_score || deadlineMs(a) - deadlineMs(b))
    .slice(0, n)
}

export function criticalRisks(list: DemoOpportunity[]): DemoOpportunity[] {
  return list.filter((o) => {
    const a = o.analysis
    return a.eligibility.gaps.length > 0
      || a.missing_data.length > 0
      || a.risks.some((r) => r.severity === 'alto')
  })
}

export interface AllyNeed { ally_type: string; count: number }
export function requiredAllies(list: DemoOpportunity[]): AllyNeed[] {
  const counts = new Map<string, number>()
  for (const o of list) {
    for (const p of o.analysis.partners_needed) {
      counts.set(p.ally_type, (counts.get(p.ally_type) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([ally_type, count]) => ({ ally_type, count }))
    .sort((a, b) => b.count - a.count)
}

export function potentialResources(list: DemoOpportunity[]): number {
  return list.reduce((sum, o) => {
    const usd = montoUSD(o.analysis.funding_amount)
    return usd == null ? sum : sum + usd * (o.analysis.overall_score / 100)
  }, 0)
}

export interface TodayAction { opportunity: DemoOpportunity; task: DemoTask }
export function actionsToday(list: DemoOpportunity[], now: number): TodayAction[] {
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  const limit = endOfToday.getTime()
  const out: TodayAction[] = []
  for (const opportunity of list) {
    for (const task of opportunity.tasks) {
      if (!task.done && task.due_date && new Date(task.due_date).getTime() <= limit) {
        out.push({ opportunity, task })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/demo/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/demo/dashboard.ts lib/demo/dashboard.test.ts
git commit -m "feat(demo): agregaciones del dashboard ejecutivo §19"
```

---

### Task 7: Etiquetas y colores de estados del pipeline

**Files:**
- Modify: `lib/ui/format.ts`
- Test: `lib/ui/format.test.ts` (agregar casos)

**Interfaces:**
- Consumes: `PipelineState` (Task 1).
- Produces: `PIPELINE_STATE_META: Record<PipelineState, { label: string; color: string }>`.

- [ ] **Step 1: Write the failing test (agregar al final de `lib/ui/format.test.ts`)**

```ts
import { PIPELINE_STATE_META } from './format'
import { PIPELINE_STATES } from '@/lib/demo/types'

describe('PIPELINE_STATE_META', () => {
  it('tiene etiqueta y color para los 10 estados', () => {
    for (const s of PIPELINE_STATES) {
      expect(PIPELINE_STATE_META[s].label).toBeTruthy()
      expect(PIPELINE_STATE_META[s].color).toMatch(/^#/)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/ui/format.test.ts`
Expected: FAIL ("PIPELINE_STATE_META is not exported").

- [ ] **Step 3: Add implementation**

Agregar el import **junto a los imports del tope** de `lib/ui/format.ts`:
```ts
import type { PipelineState } from '@/lib/demo/types'
```
Y agregar la constante **al final** del archivo:
```ts
export const PIPELINE_STATE_META: Record<PipelineState, { label: string; color: string }> = {
  detectada: { label: 'Detectada', color: '#6b7280' },
  analizada: { label: 'Analizada', color: '#2563eb' },
  priorizada: { label: 'Priorizada', color: '#3c7d34' },
  en_alianzas: { label: 'En alianzas', color: '#7c3aed' },
  en_formulacion: { label: 'En formulación', color: '#c2611c' },
  presentada: { label: 'Presentada', color: '#0891b2' },
  en_evaluacion: { label: 'En evaluación', color: '#9a6b12' },
  aprobada: { label: 'Aprobada', color: '#15803d' },
  rechazada: { label: 'Rechazada', color: '#b23a2e' },
  descartada: { label: 'Descartada', color: '#6b7280' },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/ui/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/format.ts lib/ui/format.test.ts
git commit -m "feat(demo): etiquetas y colores de estados del pipeline"
```

---

### Task 8: Header de navegación entre las 3 vistas

**Files:**
- Create: `components/nav-header.tsx`
- Modify: `app/layout.tsx` (montar el header)

**Interfaces:**
- Consumes: `demoStore` (Task 5).
- Produces: `<NavHeader />` (incluye navegación + botón "Reiniciar demo" → `demoStore.reset()`, criterio de aceptación del spec).

- [ ] **Step 1: Crear el header (con botón de reinicio)**

```tsx
// components/nav-header.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { demoStore } from '@/lib/demo/use-store'

const LINKS = [
  { href: '/', label: 'Analizar' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/dashboard', label: 'Dashboard' },
]

export function NavHeader() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
        <span className="font-bold text-primary">🐂 moollish</span>
        <div className="flex gap-1">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 ${active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => { if (confirm('¿Reiniciar la demo al estado inicial?')) demoStore.reset() }}
          className="ml-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Reiniciar demo
        </button>
      </nav>
    </header>
  )
}
```

- [ ] **Step 2: Montar el header en `app/layout.tsx`**

Importar y renderizar `<NavHeader />` justo dentro de `<body>`, antes de `{children}`:
```tsx
import { NavHeader } from '@/components/nav-header'
// ...
        <NavHeader />
        {children}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/nav-header.tsx app/layout.tsx
git commit -m "feat(demo): header de navegación entre analizar/pipeline/dashboard"
```

---

### Task 9: Pantalla Pipeline

**Files:**
- Create: `components/pipeline/opportunity-row.tsx`
- Create: `components/pipeline/pipeline-board.tsx`
- Create: `app/pipeline/page.tsx`

**Interfaces:**
- Consumes: `useOpportunities`, `demoStore` (Task 5); `PIPELINE_STATE_META` (Task 7); `SEMAFORO_META`, `formatCurrency`, `daysRemaining` (existentes); `PIPELINE_STATES`, `PipelineState` (Task 1).

- [ ] **Step 1: Fila de oportunidad con selector de estado**

```tsx
// components/pipeline/opportunity-row.tsx
'use client'

import Link from 'next/link'
import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { demoStore } from '@/lib/demo/use-store'
import { SEMAFORO_META, PIPELINE_STATE_META, formatCurrency, daysRemaining } from '@/lib/ui/format'

export function OpportunityRow({ o }: { o: DemoOpportunity }) {
  const a = o.analysis
  const sem = SEMAFORO_META[a.semaforo]
  const days = daysRemaining(a.deadline.date)
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
        onChange={(e) => demoStore.setState(a.opportunity_id, e.target.value as PipelineState)}
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

- [ ] **Step 2: Tablero agrupado por estado**

```tsx
// components/pipeline/pipeline-board.tsx
'use client'

import { useOpportunities } from '@/lib/demo/use-store'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { PIPELINE_STATE_META } from '@/lib/ui/format'
import { OpportunityRow } from './opportunity-row'

export function PipelineBoard() {
  const list = useOpportunities()
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

- [ ] **Step 3: Página `/pipeline`**

```tsx
// app/pipeline/page.tsx
import { PipelineBoard } from '@/components/pipeline/pipeline-board'

export default function PipelinePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Pipeline de oportunidades</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Ciclo de vida de cada oportunidad — de detectada a aprobada o descartada.
      </p>
      <PipelineBoard />
    </main>
  )
}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: compila sin errores; la ruta `/pipeline` aparece en el output del build.

- [ ] **Step 5: Commit**

```bash
git add components/pipeline app/pipeline
git commit -m "feat(demo): pantalla Pipeline con estados del ciclo de vida"
```

---

### Task 10: Pantalla Dashboard ejecutivo

**Files:**
- Create: `components/dashboard/widget-card.tsx`
- Create: `components/dashboard/dashboard-view.tsx`
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useOpportunities` (Task 5); agregaciones (Task 6); `formatCurrency`, `SEMAFORO_META` (existentes).

- [ ] **Step 1: Tarjeta de widget reutilizable**

```tsx
// components/dashboard/widget-card.tsx
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function WidgetCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </Card>
  )
}
```

- [ ] **Step 2: Vista del dashboard (7 widgets §19)**

```tsx
// components/dashboard/dashboard-view.tsx
'use client'

import Link from 'next/link'
import { useOpportunities } from '@/lib/demo/use-store'
import {
  newOpportunities, pipelineByState, topToApply, criticalRisks,
  requiredAllies, potentialResources, actionsToday,
} from '@/lib/demo/dashboard'
import { PIPELINE_STATE_META, formatCurrency } from '@/lib/ui/format'
import { WidgetCard } from './widget-card'

export function DashboardView() {
  const list = useOpportunities()
  const now = Date.now()

  const nuevas = newOpportunities(list, now, 72)
  const buckets = pipelineByState(list)
  const top = topToApply(list, 5)
  const riesgos = criticalRisks(list)
  const aliados = requiredAllies(list)
  const recursos = potentialResources(list)
  const acciones = actionsToday(list, now)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <WidgetCard title="Recursos potenciales (ponderado)">
        <p className="text-3xl font-extrabold">{formatCurrency(Math.round(recursos), 'USD')}</p>
        <p className="mt-1 text-xs text-muted-foreground">Σ monto × probabilidad (score)</p>
      </WidgetCard>

      <WidgetCard title={`Oportunidades nuevas (72h) · ${nuevas.length}`}>
        <ul className="flex flex-col gap-1 text-sm">
          {nuevas.map((o) => (
            <li key={o.analysis.opportunity_id} className="truncate">{o.analysis.source.name}</li>
          ))}
          {nuevas.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>

      <WidgetCard title={`Acciones de hoy · ${acciones.length}`}>
        <ul className="flex flex-col gap-1 text-sm">
          {acciones.map(({ opportunity, task }, i) => (
            <li key={i} className="truncate">☐ {task.action} <span className="text-muted-foreground">· {opportunity.analysis.source.name}</span></li>
          ))}
          {acciones.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>

      <WidgetCard title="Pipeline por estado">
        <ul className="flex flex-col gap-1 text-sm">
          {buckets.map((b) => (
            <li key={b.state} className="flex justify-between">
              <span style={{ color: PIPELINE_STATE_META[b.state].color }}>{PIPELINE_STATE_META[b.state].label}</span>
              <span className="font-semibold">{b.count}</span>
            </li>
          ))}
        </ul>
      </WidgetCard>

      <WidgetCard title="Top para aplicar">
        <ul className="flex flex-col gap-1 text-sm">
          {top.map((o) => (
            <li key={o.analysis.opportunity_id} className="flex justify-between gap-2">
              <Link href={`/oportunidad/${o.analysis.opportunity_id}`} className="truncate hover:underline">{o.analysis.source.name}</Link>
              <span className="font-semibold text-primary">{o.analysis.overall_score}</span>
            </li>
          ))}
        </ul>
      </WidgetCard>

      <WidgetCard title={`Riesgos críticos · ${riesgos.length}`}>
        <ul className="flex flex-col gap-1 text-sm">
          {riesgos.map((o) => (
            <li key={o.analysis.opportunity_id} className="truncate">⚠️ {o.analysis.source.name}</li>
          ))}
          {riesgos.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>

      <WidgetCard title="Aliados requeridos">
        <ul className="flex flex-col gap-1 text-sm">
          {aliados.map((al) => (
            <li key={al.ally_type} className="flex justify-between gap-2">
              <span className="truncate">{al.ally_type}</span>
              <span className="font-semibold">{al.count}</span>
            </li>
          ))}
          {aliados.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </WidgetCard>
    </div>
  )
}
```

- [ ] **Step 3: Página `/dashboard`**

```tsx
// app/dashboard/page.tsx
import { DashboardView } from '@/components/dashboard/dashboard-view'

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Dashboard ejecutivo</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Qué apareció, qué vale la pena, qué requiere acción y qué riesgos hay.
      </p>
      <DashboardView />
    </main>
  )
}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: compila; ruta `/dashboard` en el output.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard app/dashboard
git commit -m "feat(demo): dashboard ejecutivo con los 7 widgets del §19"
```

---

### Task 11: Pantalla de detalle de oportunidad

**Files:**
- Create: `components/pipeline/task-list.tsx`
- Create: `components/pipeline/state-control.tsx`
- Create: `app/oportunidad/[id]/page.tsx`
- Create: `app/oportunidad/[id]/not-found.tsx`

**Interfaces:**
- Consumes: `useOpportunity`, `demoStore` (Task 5); `AnalysisView` (existente); `PIPELINE_STATES`, `PipelineState` (Task 1); `PIPELINE_STATE_META` (Task 7).

- [ ] **Step 1: Lista de tareas con checkbox**

```tsx
// components/pipeline/task-list.tsx
'use client'

import type { DemoOpportunity } from '@/lib/demo/types'
import { demoStore } from '@/lib/demo/use-store'
import { Card } from '@/components/ui/card'

export function TaskList({ o }: { o: DemoOpportunity }) {
  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tareas</p>
      <ul className="flex flex-col gap-2">
        {o.tasks.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => demoStore.toggleTask(o.analysis.opportunity_id, i)}
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

- [ ] **Step 2: Control de estado**

```tsx
// components/pipeline/state-control.tsx
'use client'

import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import { PIPELINE_STATES } from '@/lib/demo/types'
import { demoStore } from '@/lib/demo/use-store'
import { PIPELINE_STATE_META } from '@/lib/ui/format'

export function StateControl({ o }: { o: DemoOpportunity }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Estado:</span>
      <select
        value={o.state}
        onChange={(e) => demoStore.setState(o.analysis.opportunity_id, e.target.value as PipelineState)}
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

- [ ] **Step 3: Página de detalle (client component leyendo el store)**

```tsx
// app/oportunidad/[id]/page.tsx
'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { useOpportunity } from '@/lib/demo/use-store'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { TaskList } from '@/components/pipeline/task-list'
import { StateControl } from '@/components/pipeline/state-control'

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const o = useOpportunity(id)
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

- [ ] **Step 4: `not-found` de la ruta**

```tsx
// app/oportunidad/[id]/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p className="text-lg font-medium">Oportunidad no encontrada</p>
      <p className="mt-1 text-sm text-muted-foreground">Puede que se haya reiniciado la demo.</p>
      <Link href="/pipeline" className="mt-4 inline-block text-primary hover:underline">← Volver al pipeline</Link>
    </main>
  )
}
```

- [ ] **Step 5: Verify typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: compila; ruta dinámica `/oportunidad/[id]` en el output.

- [ ] **Step 6: Commit**

```bash
git add components/pipeline/task-list.tsx components/pipeline/state-control.tsx app/oportunidad
git commit -m "feat(demo): detalle de oportunidad con estado y tareas editables"
```

---

### Task 12: Presets §20 + auto-guardado al analizar

**Files:**
- Create: `lib/demo/presets.ts`
- Modify: `components/opportunity-input.tsx` (fila de presets)
- Modify: `app/page.tsx` (pasar presets; `demoStore.add` al terminar el análisis; CTA a pipeline)

**Interfaces:**
- Consumes: `demoStore` (Task 5).
- Produces: `DEMO_PRESETS: { id: string; label: string; text: string }[]` (texto embebido de los 5 fixtures); callback `onPickPreset(text: string)` en `OpportunityInput`.

- [ ] **Step 1: Embeber los textos de los fixtures como presets**

Generar `lib/demo/presets.ts` con el contenido real de cada fixture embebido (para no leer del FS en el cliente). Comando para producir el archivo:

```bash
node -e '
const fs = require("fs");
const cases = [
  ["fao", "FAO AgrInnovation", "fixtures/fao-agrinno.txt"],
  ["fontagro", "FONTAGRO Ganadería", "fixtures/fontagro-ganaderia.txt"],
  ["minciencias", "Minciencias 966", "fixtures/minciencias-966.txt"],
  ["divfund", "DIV Fund rural", "fixtures/div-fund-rural.txt"],
  ["secop", "SECOP CAR ambiental", "fixtures/secop-car-ambiental.txt"],
];
const items = cases.map(([id,label,path]) => ({ id, label, text: fs.readFileSync(path,"utf8") }));
const body = "// Generado desde fixtures/ — presets §20 para la demo.\n" +
  "export interface DemoPreset { id: string; label: string; text: string }\n" +
  "export const DEMO_PRESETS: DemoPreset[] = " + JSON.stringify(items, null, 2) + "\n";
fs.writeFileSync("lib/demo/presets.ts", body);
console.log("✓ lib/demo/presets.ts", items.length);
'
```

Expected: crea `lib/demo/presets.ts` con 5 presets.

- [ ] **Step 2: Agregar la fila de presets a `OpportunityInput`**

En `components/opportunity-input.tsx`, agregar a la interfaz de props:
```tsx
  presets?: { id: string; label: string }[]
  onPickPreset?: (id: string) => void
```
Y renderizar, arriba del `<Textarea>` (solo cuando no está `collapsed` y hay presets):
```tsx
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
```

- [ ] **Step 3: Cablear en `app/page.tsx` — presets + auto-guardado**

Agregar imports:
```tsx
import { DEMO_PRESETS } from '@/lib/demo/presets'
import { demoStore } from '@/lib/demo/use-store'
import Link from 'next/link'
```
En el éxito de `run()`, después de `setAnalysis(result.analysis)`, agregar:
```tsx
      demoStore.add(result.analysis)
```
Pasar presets a ambos `<OpportunityInput .../>`:
```tsx
        presets={DEMO_PRESETS.map(({ id, label }) => ({ id, label }))}
        onPickPreset={(id) => {
          const p = DEMO_PRESETS.find((x) => x.id === id)
          if (p) { setFile(null); setText(p.text) }
        }}
```
Y en el bloque `status === 'done'`, sobre el `AnalysisView`, agregar un CTA:
```tsx
      {status === 'done' && analysis && (
        <Link href={`/oportunidad/${analysis.opportunity_id}`} className="text-sm text-primary hover:underline">
          Ver en el pipeline →
        </Link>
      )}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/demo/presets.ts components/opportunity-input.tsx app/page.tsx
git commit -m "feat(demo): presets §20 a un clic + auto-guardado del análisis al pipeline"
```

---

### Task 13: Verificación integral y deploy

**Files:** (ninguno; verificación + despliegue)

- [ ] **Step 1: Suite + typecheck + build completos**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected: todos los tests PASS (82 previos + nuevos de demo), typecheck limpio, build OK con rutas `/`, `/pipeline`, `/dashboard`, `/oportunidad/[id]`.

- [ ] **Step 2: Smoke test local**

Run: `pnpm dev` y verificar manualmente:
- `/pipeline` muestra 5 casos en estados variados.
- `/dashboard` muestra los 7 widgets con números coherentes.
- Cambiar estado en `/pipeline` persiste tras refrescar (localStorage).
- En `/` un preset §20 carga el texto; al analizar, aparece en pipeline y mueve el dashboard.

- [ ] **Step 3: Cargar la key real en Vercel (acción del usuario)**

`OPENROUTER_API_KEY` está vacía en Vercel. En el dashboard de Vercel → Settings → Environment Variables, pegar el valor real y marcarla para **Production** y **Preview**.

- [ ] **Step 4: Desplegar y verificar en vivo**

Run: `vercel deploy` (preview) y abrir la URL; analizar un preset §20 en vivo para confirmar que el LLM responde en producción.
Expected: análisis en vivo funciona; pipeline y dashboard se ven poblados.

- [ ] **Step 5: Merge de la rama**

Run:
```bash
pnpm vitest run && pnpm typecheck
git checkout master
git merge --no-ff feat/demo-venta
```

---

## Notas de implementación
- TDD estricto en `lib/demo/` (lógica pura y store). Las páginas/componentes React se verifican con `typecheck` + `build` + smoke manual (no se agrega infra de RTL para la demo).
- Cada commit deja el árbol verde. No avanzar de tarea con tests en rojo.
- El swap futuro a Neon (post-venta) reescribe solo `lib/demo/store.ts` + `use-store.ts`; las pantallas no cambian.
