# Agente 1 — Demo de venta (Pipeline + Dashboard sobre datos semilla)

> Diseño validado en brainstorming. Fecha: 2026-06-23.
> Decisión de arquitectura asociada: `~/Sophia/decisions/seed-data-para-demo-moollish.md`.
> Roadmap completo: `docs/agente1-estado-y-roadmap.md`.

## Objetivo

Construir una **demo desplegada y a prueba de fallos** que muestre la visión del PDF (§26: "plataforma modular", no chatbot) funcionando end-to-end sobre los casos reales del §20, para **vender el Agente 1 a Moollish**.

La demo debe verse como la plataforma completa: **analizador + pipeline (Módulo 7) + dashboard ejecutivo (§19)**, poblada con análisis reales.

## Principio rector

Máximo impacto visual con mínimo riesgo en vivo. Lo que el cliente no ve en pantalla (base de datos real) **no se construye todavía**. Los datos se precargan; la persistencia real con Neon es trabajo posterior a la venta.

## Alcance

**Dentro:**
- Capa de datos en memoria sembrada con 5 casos §20 pre-analizados, persistida en `localStorage`.
- Pantalla **Pipeline**: oportunidades por estado del ciclo de vida §14.
- Pantalla **Dashboard**: widgets del §19.
- Pantalla **Detalle** de oportunidad (reusa `AnalysisView`).
- **Presets §20** en el analizador (cargar cada caso real a un clic).
- Al analizar en vivo, la oportunidad se agrega al store y aparece en pipeline/dashboard.
- Script de generación del seed (`pnpm seed`).
- Arreglo de deploy (key real en Vercel).

**Fuera (trabajo posterior, ver roadmap):**
- Base de datos real / Neon (Fase A "de verdad"), auth, radar/descubrimiento, conectores (correo/SECOP/redes), generación de concept notes, deduplicación, kanban con drag-drop, multiusuario.

## Arquitectura

### Capa de datos demo — `lib/demo/`

La **costura** que aísla las pantallas del origen de datos. El día que entre Neon, solo se reescribe esta capa.

**`lib/demo/types.ts`**
```ts
type PipelineState =
  | 'detectada' | 'analizada' | 'priorizada' | 'en_alianzas' | 'en_formulacion'
  | 'presentada' | 'en_evaluacion' | 'aprobada' | 'rechazada' | 'descartada'

interface DemoTask {       // derivada de analysis.next_actions + estado editable
  action: string
  responsible: string
  due_date: string | null
  dependency: string | null
  done: boolean
}

interface DemoOpportunity {
  analysis: OpportunityAnalysis   // el análisis real, intacto
  state: PipelineState
  created_at: string              // ISO; el seed usa fechas recientes (24/72h)
  responsible: string | null
  tasks: DemoTask[]
  decision_reason: string | null  // causa de descarte/priorización (§14 'registrar causa')
}
```

**`lib/demo/store.ts`** — interfaz del store + implementación `localStorage`:
```ts
interface OpportunityStore {
  list(): DemoOpportunity[]
  getById(id: string): DemoOpportunity | undefined
  add(analysis: OpportunityAnalysis): DemoOpportunity   // state='analizada', tasks desde next_actions
  updateState(id: string, state: PipelineState, reason?: string): void  // reason → decision_reason
  toggleTask(id: string, taskIndex: number): void
  reset(): void                                          // re-siembra desde seed (botón "reiniciar demo")
}
```
- Al primer arranque (o `reset`), se siembra desde `seed.ts` y se guarda en `localStorage` (clave `moollish.demo.v1`).
- Lecturas posteriores leen `localStorage`. Cliente-side (la demo es single-tenant, sin servidor de estado).
- `id` de cada oportunidad = `analysis.opportunity_id`.

**`lib/demo/seed.ts`** — los 5 casos §20 como `DemoOpportunity[]`:
- Importa los análisis crudos generados (`analyses.generated.json`) y les asigna estado curado + `created_at` reciente, para que el pipeline se vea poblado en varias etapas:
  | Caso | Estado sugerido |
  |---|---|
  | FAO AgrInnovation | `priorizada` |
  | FONTAGRO ganadería | `en_alianzas` |
  | Minciencias 966 | `analizada` |
  | DIV Fund rural | `en_formulacion` |
  | SECOP CAR ambiental | `descartada` (con lección/razón) |

### Generación del seed — `scripts/seed.ts` (`pnpm seed`)

- Corre los 5 fixtures (`fixtures/*.txt`) por `analyzeOpportunity` + `generateWithOpenRouter` (una vez).
- Vuelca el resultado a `lib/demo/analyses.generated.json` (commiteado).
- Doble función: pobla la demo con análisis **reales** y valida los criterios del §20 (`fixtures/expected.md`).
- Si una corrida falla validación, se reintenta; el JSON final se commitea para que la demo no dependa del LLM en vivo para esos 5.

### Pantallas (Next.js App Router)

- **`/`** — analizador actual + fila de **presets §20** (botones que cargan el texto del fixture). Al terminar un análisis: `store.add(analysis)` y CTA "Ver en pipeline".
- **`/pipeline`** — `DemoOpportunity[]` agrupadas por `state` (lista por columnas o secciones). Cada fila: título, semáforo, `overall_score`, deadline + días, monto, selector de estado. Filtros: estado, semáforo.
- **`/dashboard`** — widgets §19 (abajo).
- **`/oportunidad/[id]`** — `AnalysisView` (ya existe) + control de estado + lista de tareas con checkbox (`toggleTask`).

Como el store es client-side (`localStorage`), estas páginas son client components que leen del store. Navegación entre las 4 vías un header común.

### Widgets del Dashboard (§19) — `lib/demo/dashboard.ts`

Funciones **puras** sobre `DemoOpportunity[]` (testeables sin UI):

| Widget | Cálculo |
|---|---|
| Oportunidades nuevas | `created_at` dentro de 24/72h |
| Pipeline por estado | count + Σ monto por `state` |
| Top aplicar | orden por `overall_score` desc, luego deadline asc; filtra recomendación `apply_now`/`apply_with_partner`; top 10 |
| Riesgos críticos | oportunidades con `eligibility.gaps` no vacío, o `risks` con severidad `alto`, o `missing_data` no vacío |
| Aliados requeridos | agrega `partners_needed` de todas, agrupa por `ally_type` |
| Recursos potenciales | Σ (montoUSD × `overall_score`/100), donde montoUSD = `funding_amount.estimated_usd ?? (currency==='USD' ? value : null)`; se omiten las de monto desconocido — "monto × probabilidad ponderada" |
| Acciones de hoy | tareas con `due_date <= hoy` y `!done` |

## Manejo de errores

- Análisis en vivo: ya cubierto (stream de error en `/api/analyze`). Si falla, el store no se toca.
- `localStorage` ausente/corrupto: el store cae a la semilla en memoria y loguea; nunca rompe la pantalla.
- Botón **"Reiniciar demo"** (`store.reset()`) para volver al estado semilla entre demos.

## Testing

- `lib/demo/store.test.ts` — `add`/`updateState`/`toggleTask`/`reset` + round-trip `localStorage` (mock).
- `lib/demo/dashboard.test.ts` — cada agregación con un set fijo de `DemoOpportunity`.
- `lib/demo/seed.test.ts` — el seed cumple `OpportunityAnalysisSchema` y cubre los 5 casos en estados variados.
- Se mantienen los 82 tests actuales.

## Prerrequisito de deploy (no es código)

`OPENROUTER_API_KEY` en Vercel está **vacía** y solo en Production. Antes de la demo: cargar el valor real en Production **y** Preview. Luego `vercel deploy` y verificar el análisis en vivo en la URL.

## Criterios de aceptación

- [ ] `pnpm seed` genera 5 análisis reales que pasan el §20.
- [ ] `/pipeline` muestra los 5 casos en estados variados; cambiar estado funciona.
- [ ] `/dashboard` muestra los 7 widgets con números coherentes con la semilla.
- [ ] Analizar en vivo agrega la oportunidad al pipeline y mueve el dashboard.
- [ ] Presets §20 cargan cada caso a un clic.
- [ ] "Reiniciar demo" vuelve al estado semilla.
- [ ] Desplegado en una URL de Vercel con el análisis en vivo funcionando.
- [ ] Suite verde + typecheck limpio.
