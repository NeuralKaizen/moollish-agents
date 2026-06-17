# Agente 1 — Núcleo de análisis · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el módulo `lib/agent/` que recibe el texto de una convocatoria y devuelve un análisis estructurado, explicable y auditable que respeta el contrato de Moollish (Anexo A / Anexo C / §8), validado por CLI contra los casos reales del §20.

**Architecture:** El LLM (Claude vía OpenRouter + Vercel AI SDK `generateObject`) razona y asigna sub-scores con justificación contra un esquema Zod. El **código** calcula el score total ponderado, el semáforo y la decisión (con override a `request_info` si falta dato crítico). La función `analyzeOpportunity` recibe la función de generación por inyección de dependencias, así su lógica de orquestación se testea sin red ni LLM, y la llamada real a OpenRouter vive aislada en `llm.ts`.

**Tech Stack:** TypeScript (ESM) · pnpm · vitest · zod · `ai` (Vercel AI SDK) · `@openrouter/ai-sdk-provider` · tsx · dotenv.

**Spec:** `docs/superpowers/specs/2026-06-17-agente1-nucleo-analisis-design.md`

---

## File Structure

```
package.json            # ESM, scripts: test, analyze, typecheck
tsconfig.json           # ESM, alias @/*
vitest.config.ts        # tests *.test.ts
.env.example            # OPENROUTER_API_KEY, AGENT_MODEL
lib/agent/
  schema.ts             # Zod: LlmAnalysisSchema + OpportunityAnalysisSchema. Única fuente de verdad.
  config.ts             # DEFAULT_WEIGHTS (§9), WEIGHTS_VERSION, DEFAULT_MODEL.
  scoring.ts            # computeOverallScore, scoreToSemaforo, deriveRecommendation, hasCriticalGap.
  funders.ts            # FUNDER_KNOWLEDGE (§11) como texto estático.
  prompt.ts             # buildSystemPrompt(): prompt maestro (§18).
  analyze.ts            # analyzeOpportunity(text, deps, opts) — orquesta LLM + scoring.
  llm.ts                # generateWithOpenRouter(text, model) — wiring real AI SDK + OpenRouter.
  schema.test.ts
  scoring.test.ts
  prompt.test.ts
  analyze.test.ts
scripts/
  analyze.ts            # Runner CLI: pnpm analyze <archivo.txt>.
fixtures/
  *.txt                 # Casos §20.
  expected.md           # Respuestas esperadas §20.
```

> **Nota:** Next.js NO se instala en esta fase. La estructura (`lib/`, alias `@/*`) queda Next-ready; el runtime de Next se agrega en la fase de interfaz. El agente corre por CLI + vitest.

---

### Task 0: Scaffold del proyecto

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "moollish-agents",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "analyze": "tsx scripts/analyze.ts"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

Run:
```bash
pnpm add ai zod @openrouter/ai-sdk-provider dotenv
pnpm add -D typescript tsx vitest @types/node
```
Expected: instala sin errores; `node_modules/ai/docs/` existe.

- [ ] **Step 3: Verificar APIs actuales (no confiar en memoria)**

Run:
```bash
ls node_modules/ai/docs/ && grep -rl "generateObject" node_modules/ai/docs/ | head
cat node_modules/@openrouter/ai-sdk-provider/README.md | head -60
```
Confirmá: (a) firma de `generateObject({ model, schema, system, prompt }) -> { object }`; (b) cómo se crea el provider de OpenRouter (`createOpenRouter({ apiKey })` y `openrouter(modelId)` o equivalente). Si difiere, ajustá `llm.ts` en la Task 7 en consecuencia.

- [ ] **Step 4: Crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "noEmit": true
  },
  "include": ["lib", "scripts"]
}
```

- [ ] **Step 5: Crear `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 6: Crear `.env.example`**

```bash
OPENROUTER_API_KEY=sk-or-...
# Slug OpenRouter; verificar el más nuevo en https://openrouter.ai/api/v1/models
AGENT_MODEL=anthropic/claude-sonnet-4.5
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example pnpm-lock.yaml
git commit -m "chore: scaffold proyecto del núcleo del Agente 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Esquema Zod (contrato de salida)

**Files:**
- Create: `lib/agent/schema.ts`
- Test: `lib/agent/schema.test.ts`

- [ ] **Step 1: Escribir `lib/agent/schema.ts`**

```ts
import { z } from 'zod'

export const CRITERION_KEYS = [
  'alineacion_estrategica',
  'elegibilidad',
  'monto_retorno',
  'probabilidad_exito',
  'complejidad_documental',
  'tiempo_disponible',
  'impacto_estrategico',
  'riesgo_ejecucion',
] as const
export type CriterionKey = (typeof CRITERION_KEYS)[number]

export const LevelEnum = z.enum(['bajo', 'medio', 'alto'])
export const SemaforoEnum = z.enum([
  'verde_alto', 'verde_condicionado', 'amarillo', 'naranja', 'rojo',
])
export const RecommendationEnum = z.enum([
  'apply_now', 'apply_with_partner', 'observe', 'request_info', 'discard',
])
export const VehicleEnum = z.enum([
  'moollish', 'moollish_sat2farm', 'foundation_nova', 'alianza',
])
export const CategoryEnum = z.enum([
  'financiacion_no_reembolsable', 'contratacion_publica',
  'cooperacion_alianzas', 'programas_territoriales', 'inversion_impacto',
])

const CriterionScore = z.object({
  score: z.number().min(0).max(100),
  justification: z.string(),
})

const CriteriaScores = z.object({
  alineacion_estrategica: CriterionScore,
  elegibilidad: CriterionScore,
  monto_retorno: CriterionScore,
  probabilidad_exito: CriterionScore,
  complejidad_documental: CriterionScore,
  tiempo_disponible: CriterionScore,
  impacto_estrategico: CriterionScore,
  riesgo_ejecucion: CriterionScore,
})

// Lo que pedimos al LLM (NO incluye overall_score, semaforo ni recommendation: los calcula el código).
export const LlmAnalysisSchema = z.object({
  source: z.object({
    name: z.string(),
    url: z.string().nullable(),
    channel: z.string(),
    confidence_level: z.enum(['alta', 'media', 'baja']),
  }),
  classification: z.object({
    category: CategoryEnum,
    subcategory: z.string().nullable(),
    instrument: z.string().nullable(),
    themes: z.array(z.string()),
    geography: z.array(z.string()),
  }),
  deadline: z.object({
    date: z.string().nullable(), // ISO 8601 o null
    verified: z.boolean(),
  }),
  funding_amount: z.object({
    value: z.number().nullable(),
    currency: z.string().nullable(),
    confirmed: z.boolean(),
    estimated_cop: z.number().nullable(),
    estimated_usd: z.number().nullable(),
  }),
  eligibility: z.object({
    eligible_entities: z.array(z.string()),
    countries: z.array(z.string()),
    restrictions: z.array(z.string()),
    required_documents: z.array(z.string()),
    gaps: z.array(z.string()),
  }),
  recommended_vehicle: VehicleEnum,
  vehicle_rationale: z.string(),
  criteria_scores: CriteriaScores,
  institutional_fit: z.object({
    moollish: z.number().min(0).max(100),
    sat2farm: z.number().min(0).max(100),
    foundation_nova: z.number().min(0).max(100),
    alliance: z.number().min(0).max(100),
  }),
  effort: LevelEnum,
  risk: LevelEnum,
  main_gap: z.string(),
  partners_needed: z.array(z.object({
    gap: z.string(),
    ally_type: z.string(),
    suggested_role: z.string(),
    priority: LevelEnum,
    reason: z.string(),
  })),
  risks: z.array(z.object({
    type: z.enum(['legal', 'reputacional', 'financiero', 'tecnico', 'tiempo', 'ejecucion']),
    description: z.string(),
    severity: LevelEnum,
  })),
  next_actions: z.array(z.object({
    action: z.string(),
    responsible: z.string(),
    due_date: z.string().nullable(),
    dependency: z.string().nullable(),
  })),
  evidence: z.array(z.object({
    claim: z.string(),
    quote: z.string(),
    field: z.string(),
  })),
  missing_data: z.array(z.string()),
  draft_outputs: z.object({
    executive_summary: z.string(),
    narrative_angle: z.string(),
  }),
})
export type LlmAnalysis = z.infer<typeof LlmAnalysisSchema>

// Salida final del agente: lo del LLM + campos calculados por código + metadata de auditoría.
export const OpportunityAnalysisSchema = LlmAnalysisSchema.extend({
  opportunity_id: z.string(),
  overall_score: z.number().min(0).max(100),
  semaforo: SemaforoEnum,
  recommendation: RecommendationEnum,
  analysis_meta: z.object({
    model: z.string(),
    weights_version: z.string(),
    analyzed_at: z.string(),
  }),
})
export type OpportunityAnalysis = z.infer<typeof OpportunityAnalysisSchema>
```

- [ ] **Step 2: Escribir el test que falla — `lib/agent/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { LlmAnalysisSchema, CRITERION_KEYS } from './schema'

const validLlm = {
  source: { name: 'FAO', url: null, channel: 'manual', confidence_level: 'media' },
  classification: { category: 'financiacion_no_reembolsable', subcategory: null, instrument: null, themes: ['agtech'], geography: ['CO'] },
  deadline: { date: '2026-09-30', verified: true },
  funding_amount: { value: 100000, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null },
  eligibility: { eligible_entities: ['ONG'], countries: ['CO'], restrictions: [], required_documents: [], gaps: [] },
  recommended_vehicle: 'moollish_sat2farm',
  vehicle_rationale: 'componente satelital',
  criteria_scores: Object.fromEntries(CRITERION_KEYS.map((k) => [k, { score: 80, justification: 'x' }])),
  institutional_fit: { moollish: 90, sat2farm: 85, foundation_nova: 40, alliance: 70 },
  effort: 'medio',
  risk: 'bajo',
  main_gap: 'aliado académico',
  partners_needed: [{ gap: 'investigación', ally_type: 'universidad', suggested_role: 'metodología', priority: 'alto', reason: 'exige I+D' }],
  risks: [{ type: 'tiempo', description: 'deadline ajustado', severity: 'medio' }],
  next_actions: [{ action: 'contactar universidad', responsible: 'Alex', due_date: '2026-06-19', dependency: null }],
  evidence: [{ claim: 'fecha límite', quote: 'cierre 30 sep', field: 'deadline' }],
  missing_data: [],
  draft_outputs: { executive_summary: 'resumen', narrative_angle: 'agricultura resiliente' },
}

describe('LlmAnalysisSchema', () => {
  it('acepta un objeto válido', () => {
    expect(LlmAnalysisSchema.parse(validLlm)).toBeTruthy()
  })

  it('rechaza un sub-score fuera de rango', () => {
    const bad = { ...validLlm, criteria_scores: { ...validLlm.criteria_scores, elegibilidad: { score: 150, justification: 'x' } } }
    expect(() => LlmAnalysisSchema.parse(bad)).toThrow()
  })

  it('rechaza si falta un criterio', () => {
    const { riesgo_ejecucion, ...partial } = validLlm.criteria_scores as Record<string, unknown>
    const bad = { ...validLlm, criteria_scores: partial }
    expect(() => LlmAnalysisSchema.parse(bad)).toThrow()
  })
})
```

- [ ] **Step 3: Correr el test**

Run: `pnpm test -- schema`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add lib/agent/schema.ts lib/agent/schema.test.ts
git commit -m "feat: esquema Zod del contrato de salida del Agente 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Configuración (pesos + modelo)

**Files:**
- Create: `lib/agent/config.ts`
- Test: añadir caso a `lib/agent/scoring.test.ts` en Task 3 (los pesos suman 1 se valida ahí).

- [ ] **Step 1: Escribir `lib/agent/config.ts`**

```ts
import type { CriterionKey } from './schema'

export const WEIGHTS_VERSION = 'v1'

// Pesos del §9 de la spec. Suman 1.0. Configurables sin tocar el prompt.
export const DEFAULT_WEIGHTS: Record<CriterionKey, number> = {
  alineacion_estrategica: 0.20,
  elegibilidad: 0.15,
  monto_retorno: 0.15,
  probabilidad_exito: 0.15,
  complejidad_documental: 0.10,
  tiempo_disponible: 0.10,
  impacto_estrategico: 0.10,
  riesgo_ejecucion: 0.05,
}

// Slug de OpenRouter. Verificar el más nuevo en https://openrouter.ai/api/v1/models.
export const DEFAULT_MODEL = process.env.AGENT_MODEL ?? 'anthropic/claude-sonnet-4.5'
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent/config.ts
git commit -m "feat: config de pesos y modelo del Agente 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Scoring determinístico

**Files:**
- Create: `lib/agent/scoring.ts`
- Test: `lib/agent/scoring.test.ts`

- [ ] **Step 1: Escribir el test que falla — `lib/agent/scoring.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  computeOverallScore, scoreToSemaforo, semaforoToRecommendation,
  deriveRecommendation, hasCriticalGap,
} from './scoring'
import { DEFAULT_WEIGHTS } from './config'
import { CRITERION_KEYS, type CriterionKey } from './schema'

const scoresAll = (n: number) =>
  Object.fromEntries(CRITERION_KEYS.map((k) => [k, { score: n, justification: 'x' }])) as Record<
    CriterionKey, { score: number; justification: string }
  >

describe('pesos', () => {
  it('los pesos por defecto suman 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })
})

describe('computeOverallScore', () => {
  it('todo en 80 da 80', () => {
    expect(computeOverallScore(scoresAll(80))).toBe(80)
  })
  it('promedia ponderado y redondea', () => {
    const s = scoresAll(0)
    s.alineacion_estrategica.score = 100 // peso 0.20 -> 20
    expect(computeOverallScore(s)).toBe(20)
  })
})

describe('scoreToSemaforo', () => {
  it.each([
    [90, 'verde_alto'], [85, 'verde_alto'],
    [84, 'verde_condicionado'], [70, 'verde_condicionado'],
    [69, 'amarillo'], [55, 'amarillo'],
    [54, 'naranja'], [40, 'naranja'],
    [39, 'rojo'], [0, 'rojo'],
  ])('%i -> %s', (score, expected) => {
    expect(scoreToSemaforo(score as number)).toBe(expected)
  })
})

describe('semaforoToRecommendation', () => {
  it.each([
    ['verde_alto', 'apply_now'],
    ['verde_condicionado', 'apply_with_partner'],
    ['amarillo', 'observe'],
    ['naranja', 'observe'],
    ['rojo', 'discard'],
  ])('%s -> %s', (s, expected) => {
    expect(semaforoToRecommendation(s as never)).toBe(expected)
  })
})

describe('hasCriticalGap', () => {
  const ok = {
    deadline: { date: '2026-09-30', verified: true },
    funding_amount: { value: 100000, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null },
    eligibility: { eligible_entities: ['ONG'], countries: [], restrictions: [], required_documents: [], gaps: [] },
  }
  it('false cuando hay deadline, monto y elegibilidad', () => {
    expect(hasCriticalGap(ok)).toBe(false)
  })
  it('true si falta deadline', () => {
    expect(hasCriticalGap({ ...ok, deadline: { date: null, verified: false } })).toBe(true)
  })
  it('true si no hay entidades elegibles', () => {
    expect(hasCriticalGap({ ...ok, eligibility: { ...ok.eligibility, eligible_entities: [] } })).toBe(true)
  })
})

describe('deriveRecommendation', () => {
  it('verde_alto sin gap -> apply_now', () => {
    expect(deriveRecommendation('verde_alto', false)).toBe('apply_now')
  })
  it('verde_alto con gap crítico -> request_info', () => {
    expect(deriveRecommendation('verde_alto', true)).toBe('request_info')
  })
  it('rojo con gap -> sigue discard (descartar gana)', () => {
    expect(deriveRecommendation('rojo', true)).toBe('discard')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- scoring`
Expected: FAIL ("Cannot find module './scoring'" o funciones no definidas).

- [ ] **Step 3: Escribir `lib/agent/scoring.ts`**

```ts
import { DEFAULT_WEIGHTS } from './config'
import { CRITERION_KEYS, type CriterionKey } from './schema'

export type CriteriaScores = Record<CriterionKey, { score: number; justification: string }>
export type Semaforo = 'verde_alto' | 'verde_condicionado' | 'amarillo' | 'naranja' | 'rojo'
export type Recommendation = 'apply_now' | 'apply_with_partner' | 'observe' | 'request_info' | 'discard'

export function computeOverallScore(
  scores: CriteriaScores,
  weights: Record<CriterionKey, number> = DEFAULT_WEIGHTS,
): number {
  const total = CRITERION_KEYS.reduce((sum, k) => sum + scores[k].score * weights[k], 0)
  return Math.round(total)
}

export function scoreToSemaforo(score: number): Semaforo {
  if (score >= 85) return 'verde_alto'
  if (score >= 70) return 'verde_condicionado'
  if (score >= 55) return 'amarillo'
  if (score >= 40) return 'naranja'
  return 'rojo'
}

export function semaforoToRecommendation(s: Semaforo): Recommendation {
  switch (s) {
    case 'verde_alto': return 'apply_now'
    case 'verde_condicionado': return 'apply_with_partner'
    case 'amarillo': return 'observe'
    case 'naranja': return 'observe'
    case 'rojo': return 'discard'
  }
}

// Dato crítico ausente (§9/§10): sin deadline, sin monto no confirmado, o sin entidad elegible.
export function hasCriticalGap(a: {
  deadline: { date: string | null }
  funding_amount: { value: number | null; confirmed: boolean }
  eligibility: { eligible_entities: string[] }
}): boolean {
  const noDeadline = a.deadline.date === null
  const noAmount = a.funding_amount.value === null && !a.funding_amount.confirmed
  const noEligibility = a.eligibility.eligible_entities.length === 0
  return noDeadline || noAmount || noEligibility
}

// La decisión sale del semáforo; si hay gap crítico se fuerza request_info, salvo que sea discard.
export function deriveRecommendation(semaforo: Semaforo, criticalGap: boolean): Recommendation {
  const base = semaforoToRecommendation(semaforo)
  if (base === 'discard') return 'discard'
  return criticalGap ? 'request_info' : base
}
```

- [ ] **Step 4: Correr el test**

Run: `pnpm test -- scoring`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/scoring.ts lib/agent/scoring.test.ts
git commit -m "feat: scoring determinístico (pesos, semáforo, decisión) del Agente 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Conocimiento de financiadores

**Files:**
- Create: `lib/agent/funders.ts`

- [ ] **Step 1: Escribir `lib/agent/funders.ts`**

```ts
// Conocimiento estático de financiadores (§11). RAG completo = fase posterior.
export const FUNDER_KNOWLEDGE = `
CONOCIMIENTO DE FINANCIADORES (usar para interpretar prioridades y narrativa, no para inventar requisitos):
- FAO: seguridad alimentaria, agricultura, sistemas agroalimentarios, resiliencia, asociaciones rurales. Narrativas de productividad, hambre cero, sostenibilidad y escalabilidad rural.
- FONTAGRO: innovación agropecuaria, investigación aplicada, alianzas regionales, escalamiento. Suele exigir país socio y centro de investigación.
- DIV Fund: evidencia, costo-efectividad, impacto medible, potencial de escala. Pide teoría de cambio robusta y medición.
- Minciencias: CTeI, apropiación social, innovación, capacidades regionales. Alianzas universidad-empresa-estado y componentes tecnológicos demostrables.
- ADR / MinAgricultura: productividad, asociatividad, comercialización, extensión agropecuaria. Proyectos con asociaciones y asistencia técnica digital.
- CAR / entidades ambientales: restauración, biodiversidad, monitoreo, alertas, ordenamiento ambiental. Encaja con capa satelital de Sat2Farm.
- UE / Horizon / Innovate UK: consorcios, innovación, impacto, escalabilidad, partners internacionales. Suele requerir socio coordinador y rol de piloto.

VEHÍCULOS INSTITUCIONALES:
- Moollish: vehículo principal para AgTech, ganadería inteligente, agricultura, trazabilidad, marketplace, IoT/RFID, proyectos productivos.
- Sat2Farm: capacidad satelital — agricultura de precisión, carbono, riesgo climático, biodiversidad, monitoreo ambiental.
- Foundation Nova: vehículo social — juventud rural, mujeres, seguridad alimentaria, educación, inclusión, desarrollo comunitario.
`.trim()
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent/funders.ts
git commit -m "feat: conocimiento estático de financiadores del Agente 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Prompt maestro

**Files:**
- Create: `lib/agent/prompt.ts`
- Test: `lib/agent/prompt.test.ts`

- [ ] **Step 1: Escribir el test que falla — `lib/agent/prompt.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './prompt'
import { CRITERION_KEYS } from './schema'

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt()

  it('declara la regla de no inventar', () => {
    expect(prompt.toLowerCase()).toContain('no inventar')
  })
  it('exige citar la fuente', () => {
    expect(prompt.toLowerCase()).toContain('evidence')
  })
  it('menciona los 8 criterios ponderados', () => {
    for (const k of CRITERION_KEYS) expect(prompt).toContain(k)
  })
  it('incluye conocimiento de financiadores', () => {
    expect(prompt).toContain('FAO')
    expect(prompt).toContain('FONTAGRO')
  })
  it('aclara que NO debe calcular overall_score ni semáforo', () => {
    expect(prompt).toContain('overall_score')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- prompt`
Expected: FAIL ("Cannot find module './prompt'").

- [ ] **Step 3: Escribir `lib/agent/prompt.ts`**

```ts
import { FUNDER_KNOWLEDGE } from './funders'
import { DEFAULT_WEIGHTS } from './config'
import { CRITERION_KEYS } from './schema'

const WEIGHT_LABELS: Record<(typeof CRITERION_KEYS)[number], string> = {
  alineacion_estrategica: 'Alineación estratégica (¿se relaciona con agricultura, ganadería, AgTech, clima, ambiente, inclusión rural o tecnología satelital?)',
  elegibilidad: 'Elegibilidad jurídica/institucional (¿puede aplicar Moollish/Foundation Nova o requiere aliado? restricciones de país, tipo de entidad, experiencia)',
  monto_retorno: 'Monto y retorno esperado (¿el monto justifica el esfuerzo? ingresos, posicionamiento, escalamiento)',
  probabilidad_exito: 'Probabilidad de éxito (experiencia demostrable, aliados, diferencial frente a competidores)',
  complejidad_documental: 'Complejidad documental (¿exige estados financieros, auditorías, certificaciones, consorcio, traducciones, cofinanciación?)',
  tiempo_disponible: 'Tiempo disponible (¿la fecha límite permite formular bien?)',
  impacto_estrategico: 'Impacto estratégico (¿abre mercado, territorio, aliado o línea de negocio?)',
  riesgo_ejecucion: 'Riesgo de ejecución (riesgos técnicos, reputacionales, financieros o legales)',
}

export function buildSystemPrompt(): string {
  const criteria = CRITERION_KEYS
    .map((k) => `- ${k} (peso ${Math.round(DEFAULT_WEIGHTS[k] * 100)}%): ${WEIGHT_LABELS[k]}`)
    .join('\n')

  return `
Sos el Chief Funding, Partnerships & Strategic Opportunities Officer AI de Moollish + Sat2Farm + Foundation Nova.
No sos un buscador de convocatorias: sos un director virtual que decide si conviene aplicar a una oportunidad de financiación, con qué vehículo institucional, bajo qué narrativa, y qué acción ejecutar en las próximas 24-72 horas.

Recibís el texto crudo de una convocatoria y devolvés un análisis estructurado según el esquema provisto.

CRITERIOS DE EVALUACIÓN — asigná a cada uno un sub-score 0-100 en criteria_scores, con su justification:
${criteria}

FIT INSTITUCIONAL — en institutional_fit asigná 0-100 a moollish, sat2farm, foundation_nova y alliance (qué tan conveniente es aplicar en alianza). Recomendá el vehículo líder en recommended_vehicle con su vehicle_rationale.

${FUNDER_KNOWLEDGE}

REGLAS OBLIGATORIAS:
1. NO INVENTAR. Si falta un dato crítico (fecha límite, monto, elegibilidad, requisitos), dejalo en null / lista vacía y agregalo a missing_data, además de una tarea de verificación en next_actions. Nunca rellenes con supuestos.
2. CITAR FUENTE. Toda fecha límite, monto, elegibilidad o requisito afirmado debe tener su fragmento textual en evidence (claim + quote + field).
3. SEPARAR HECHOS DE INFERENCIAS. Lo textual de la convocatoria va con su cita; tu interpretación estratégica va en los campos de análisis (vehicle_rationale, main_gap, draft_outputs).
4. PRIORIZAR ACCIÓN. Siempre completá next_actions con tareas concretas (acción, responsable, fecha) en 24-72h.
5. NORMALIZAR. deadline.date en ISO 8601 (o null). funding_amount con moneda original; estimaciones COP/USD van en estimated_cop/estimated_usd y nunca como confirmed=true.

NO calcules overall_score, semaforo ni recommendation: esos los computa el sistema a partir de tus criteria_scores. Limitate a los campos del esquema.
`.trim()
}
```

- [ ] **Step 4: Correr el test**

Run: `pnpm test -- prompt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agent/prompt.ts lib/agent/prompt.test.ts
git commit -m "feat: prompt maestro del Agente 1 con reglas y criterios

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Orquestación `analyzeOpportunity` (testeable sin LLM)

**Files:**
- Create: `lib/agent/analyze.ts`
- Test: `lib/agent/analyze.test.ts`

- [ ] **Step 1: Escribir el test que falla — `lib/agent/analyze.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { analyzeOpportunity } from './analyze'
import { CRITERION_KEYS, type LlmAnalysis } from './schema'

function stubLlm(overrides: Partial<LlmAnalysis> = {}): LlmAnalysis {
  return {
    source: { name: 'FAO', url: null, channel: 'manual', confidence_level: 'media' },
    classification: { category: 'financiacion_no_reembolsable', subcategory: null, instrument: null, themes: ['agtech'], geography: ['CO'] },
    deadline: { date: '2026-09-30', verified: true },
    funding_amount: { value: 100000, currency: 'USD', confirmed: true, estimated_cop: null, estimated_usd: null },
    eligibility: { eligible_entities: ['ONG'], countries: ['CO'], restrictions: [], required_documents: [], gaps: [] },
    recommended_vehicle: 'moollish_sat2farm',
    vehicle_rationale: 'satelital',
    criteria_scores: Object.fromEntries(CRITERION_KEYS.map((k) => [k, { score: 90, justification: 'x' }])) as LlmAnalysis['criteria_scores'],
    institutional_fit: { moollish: 90, sat2farm: 85, foundation_nova: 40, alliance: 70 },
    effort: 'medio', risk: 'bajo', main_gap: 'aliado',
    partners_needed: [], risks: [], next_actions: [], evidence: [], missing_data: [],
    draft_outputs: { executive_summary: 'r', narrative_angle: 'n' },
    ...overrides,
  }
}

const fixedDeps = (llm: LlmAnalysis) => ({
  generate: async () => llm,
  now: () => '2026-06-17T00:00:00.000Z',
  uuid: () => 'fixed-id',
})

describe('analyzeOpportunity', () => {
  it('calcula overall_score, semáforo y decisión a partir de los criterios', async () => {
    const r = await analyzeOpportunity('texto', fixedDeps(stubLlm()))
    expect(r.overall_score).toBe(90)
    expect(r.semaforo).toBe('verde_alto')
    expect(r.recommendation).toBe('apply_now')
    expect(r.opportunity_id).toBe('fixed-id')
    expect(r.analysis_meta.analyzed_at).toBe('2026-06-17T00:00:00.000Z')
  })

  it('fuerza request_info si falta la fecha límite', async () => {
    const llm = stubLlm({ deadline: { date: null, verified: false } })
    const r = await analyzeOpportunity('texto', fixedDeps(llm))
    expect(r.recommendation).toBe('request_info')
  })

  it('aplica pesos personalizados', async () => {
    const llm = stubLlm({
      criteria_scores: Object.fromEntries(
        CRITERION_KEYS.map((k) => [k, { score: k === 'alineacion_estrategica' ? 100 : 0, justification: 'x' }]),
      ) as LlmAnalysis['criteria_scores'],
    })
    const weights = { ...await import('./config').then((m) => m.DEFAULT_WEIGHTS) }
    const r = await analyzeOpportunity('texto', fixedDeps(llm), { weights })
    expect(r.overall_score).toBe(20)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- analyze`
Expected: FAIL ("Cannot find module './analyze'").

- [ ] **Step 3: Escribir `lib/agent/analyze.ts`**

```ts
import { randomUUID } from 'node:crypto'
import {
  LlmAnalysisSchema,
  type LlmAnalysis,
  type OpportunityAnalysis,
  type CriterionKey,
} from './schema'
import { DEFAULT_WEIGHTS, DEFAULT_MODEL, WEIGHTS_VERSION } from './config'
import {
  computeOverallScore, scoreToSemaforo, deriveRecommendation, hasCriticalGap,
} from './scoring'

export interface AnalyzeDeps {
  generate: (text: string, model: string) => Promise<LlmAnalysis>
  now?: () => string
  uuid?: () => string
}

export interface AnalyzeOpts {
  model?: string
  weights?: Record<CriterionKey, number>
}

export async function analyzeOpportunity(
  text: string,
  deps: AnalyzeDeps,
  opts: AnalyzeOpts = {},
): Promise<OpportunityAnalysis> {
  const model = opts.model ?? DEFAULT_MODEL
  const weights = opts.weights ?? DEFAULT_WEIGHTS

  const raw = await deps.generate(text, model)
  const parsed = LlmAnalysisSchema.parse(raw)

  const overall_score = computeOverallScore(parsed.criteria_scores, weights)
  const semaforo = scoreToSemaforo(overall_score)
  const recommendation = deriveRecommendation(semaforo, hasCriticalGap(parsed))

  return {
    ...parsed,
    opportunity_id: (deps.uuid ?? randomUUID)(),
    overall_score,
    semaforo,
    recommendation,
    analysis_meta: {
      model,
      weights_version: WEIGHTS_VERSION,
      analyzed_at: (deps.now ?? (() => new Date().toISOString()))(),
    },
  }
}
```

- [ ] **Step 4: Correr el test**

Run: `pnpm test -- analyze`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

```bash
pnpm typecheck
git add lib/agent/analyze.ts lib/agent/analyze.test.ts
git commit -m "feat: orquestación analyzeOpportunity con scoring por código

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wiring real (OpenRouter) + runner CLI

**Files:**
- Create: `lib/agent/llm.ts`, `scripts/analyze.ts`

- [ ] **Step 1: Escribir `lib/agent/llm.ts`**

> **API verificada en Task 0 (`ai` v6):** `generateObject` está deprecado/removido en v6. Se usa `generateText` + `Output.object({ schema })`, que devuelve `{ output }` (no `{ object }`). El provider de OpenRouter es `createOpenRouter({ apiKey })` y el modelo se obtiene con `openrouter(modelId)`.

```ts
import 'dotenv/config'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { LlmAnalysisSchema, type LlmAnalysis } from './schema'
import { buildSystemPrompt } from './prompt'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export async function generateWithOpenRouter(text: string, model: string): Promise<LlmAnalysis> {
  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: LlmAnalysisSchema }),
    system: buildSystemPrompt(),
    prompt: `Analizá la siguiente convocatoria y devolvé el análisis estructurado:\n\n${text}`,
  })
  return output
}
```

> **Nota zod v4:** se instaló `zod@4`. `LlmAnalysisSchema.parse()` e `Output.object({ schema })` funcionan con v4; si aparece un error de tipos, verificá contra `node_modules/ai/docs/` y la doc de zod v4.

- [ ] **Step 2: Escribir `scripts/analyze.ts`**

```ts
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { analyzeOpportunity } from '../lib/agent/analyze'
import { generateWithOpenRouter } from '../lib/agent/llm'

const file = process.argv[2]
if (!file) {
  console.error('Uso: pnpm analyze <archivo.txt>')
  process.exit(1)
}

const text = readFileSync(file, 'utf8')
const result = await analyzeOpportunity(text, { generate: generateWithOpenRouter })
console.log(JSON.stringify(result, null, 2))
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (sin errores de tipos).

- [ ] **Step 4: Smoke test manual (requiere `OPENROUTER_API_KEY` en `.env`)**

Run:
```bash
printf 'Convocatoria de prueba: programa de agricultura de precisión en Colombia. Cierre 30 de septiembre de 2026. Monto hasta USD 100.000. Pueden aplicar ONG y empresas.' > /tmp/smoke.txt
pnpm analyze /tmp/smoke.txt
```
Expected: imprime un JSON válido con `overall_score`, `semaforo`, `recommendation`, `criteria_scores`, `evidence`. Si el modelo no soporta structured output, elegí otro slug que sí (verificar en OpenRouter) y actualizá `AGENT_MODEL`.

- [ ] **Step 5: Commit**

```bash
git add lib/agent/llm.ts scripts/analyze.ts
git commit -m "feat: wiring OpenRouter + runner CLI del Agente 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Fixtures de los casos reales (§20) + aceptación

**Files:**
- Create: `fixtures/fao-agrinno.txt`, `fixtures/fontagro-ganaderia.txt`, `fixtures/div-fund-rural.txt`, `fixtures/minciencias-966.txt`, `fixtures/secop-car-ambiental.txt`, `fixtures/expected.md`

- [ ] **Step 1: Crear los 5 fixtures de convocatoria**

Para cada uno, escribí un texto de convocatoria realista (2-4 párrafos) basado en el caso del §20 de la spec. Ejemplo `fixtures/fao-agrinno.txt`:

```
FAO — Convocatoria AgrInnovation 2026
La Organización de las Naciones Unidas para la Alimentación y la Agricultura (FAO) abre su reto internacional AgrInnovation para soluciones de agricultura inteligente y resiliencia climática en América Latina.
Pueden aplicar organizaciones sin fines de lucro, centros de investigación y consorcios público-privados. Se valoran soluciones con componente tecnológico, monitoreo satelital y enfoque en seguridad alimentaria.
Monto: hasta USD 250.000 por proyecto. Fecha de cierre: 30 de septiembre de 2026. Se requiere socio implementador local y carta de intención.
```

(Repetir con FONTAGRO ganadería regenerativa, DIV Fund piloto rural / costo-efectividad, Minciencias 966 universidad-empresa, SECOP CAR monitoreo ambiental. Basarse en las "respuestas esperadas" del §20 para que cada texto contenga los datos que el agente debe extraer.)

- [ ] **Step 2: Crear `fixtures/expected.md`** con la respuesta esperada de cada caso (del §20)

```markdown
# Respuestas esperadas (criterio de aceptación, §20)

## fao-agrinno
- recommended_vehicle: moollish_sat2farm (componente productivo + satelital)
- partners_needed: aliado internacional / implementador local
- draft_outputs: concept note preliminar coherente
- evidence cubre deadline (2026-09-30) y monto (USD 250.000)

## fontagro-ganaderia
- detecta necesidad de país socio + centro de investigación
- main_gap menciona aliado de investigación
- narrative_angle sobre ganadería regenerativa / teoría de cambio

## div-fund-rural
- enfatiza costo-efectividad, beneficiarios, medición y escalabilidad
- criterio probabilidad_exito y impacto_estrategico justificados

## minciencias-966
- recommended_vehicle: alianza (universidad-empresa)
- partners_needed: universidad / centro de investigación, rol metodológico
- menciona indicadores CTeI

## secop-car-ambiental
- classification.category: contratacion_publica
- recommended_vehicle: moollish_sat2farm (capa satelital)
- analiza requisitos habilitantes y competencia
```

- [ ] **Step 3: Correr el agente sobre cada fixture (requiere API key)**

Run:
```bash
for f in fixtures/*.txt; do echo "=== $f ==="; pnpm analyze "$f"; done
```
Expected: cada uno produce un JSON válido. Verificá manualmente contra `fixtures/expected.md`:
1. Extrae datos clave **con citas en `evidence`**.
2. Marca faltantes en `missing_data` en vez de inventar.
3. `criteria_scores` con justificación + `overall_score` coherente.
4. `recommended_vehicle` y `recommendation` coherentes con la respuesta esperada.
5. `next_actions` con acción concreta.

Si algún caso se desvía, ajustá el prompt (`prompt.ts`) — NO el scoring — y re-corré.

- [ ] **Step 4: Commit**

```bash
git add fixtures/
git commit -m "test: fixtures de casos reales (§20) y criterios de aceptación del Agente 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §8 Salida obligatoria → schema (Task 1) cubre resumen, semáforo, fits, vehículo, monto, esfuerzo, riesgo, aliados, acción, deadline. ✅
- §6 Taxonomía → `classification` (Task 1). ✅
- §7 Normalización → reglas en prompt (Task 5) + campos ISO/estimated (Task 1). ✅
- §9 Criterios + pesos → `config.ts` (Task 2) + scoring (Task 3) + prompt (Task 5). ✅
- §10 Semáforo + score paralelo (effort/risk) → scoring (Task 3) + schema (Task 1). ✅
- §11 Conocimiento financiadores → `funders.ts` (Task 4). ✅
- §12 Motor de alianzas (gap→aliado→rol) → `partners_needed` (Task 1). ✅
- §13 draft_outputs liviano → schema + prompt. ✅
- §18 Guardrails (no inventar, citar, separar, priorizar acción) → prompt (Task 5) + override request_info (Task 3). ✅
- §20 Casos reales → fixtures (Task 8). ✅
- §21 Score explicable/ajustable + auditoría → scoring por código + `analysis_meta` (Task 6). ✅

**Placeholder scan:** Sin TBD/TODO; todo el código está completo. Los fixtures (Task 8 Step 1) describen contenido a redactar con ejemplo concreto y fuente (§20) — es contenido de datos, no lógica.

**Type consistency:** `CriterionKey`, `LlmAnalysis`, `OpportunityAnalysis`, `Semaforo`, `Recommendation`, `AnalyzeDeps` consistentes entre schema.ts, scoring.ts y analyze.ts. `computeOverallScore`/`scoreToSemaforo`/`deriveRecommendation`/`hasCriticalGap` con las mismas firmas en definición (Task 3) y uso (Task 6).
