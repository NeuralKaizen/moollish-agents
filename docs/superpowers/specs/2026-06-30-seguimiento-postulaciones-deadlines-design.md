# Seguimiento de postulaciones + deadlines — primer slice — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-30.
> Construye sobre Fase A (persistencia), el pipeline (estados del ciclo ya existen), el análisis
> (que ya captura `deadline.date`) y el patrón de roster/tabla 1:1 de Financiadores §11 / Aliados §12.
> Roadmap: cierra el bucle post-decisión (el "qué pasa después" del PDF).
> Mentalidad: PRODUCTO, no demo.

## Objetivo

Que el agente no solo decida y formule, sino que **siga la postulación hasta su resultado**. Primer
slice: una **tabla de seguimiento** (metadata de la postulación, 1:1 con la oportunidad) editable en
el detalle, más una **vista transversal de deadlines** (`/seguimiento`) y **widgets en el dashboard**
que hacen visible —de forma agregada— qué vence y qué está en evaluación. Hoy la fecha límite vive
enterrada en cada oportunidad; este slice la saca a la superficie y rankea por urgencia.

El **resultado (ganada/perdida) → lección aprendida** queda para un slice posterior.

## Decisiones de alcance (brainstorming)

- **Registro de postulación + vista de deadlines** en este slice; resultado→lección diferido.
- **Tabla nueva `submissions` (1:1)** (mismo patrón que funders/allies/drafts), no jsonb en
  opportunities — para poder consultar transversalmente "qué vence" / "en evaluación".
- **Lógica de deadlines pura y total**, con `today` inyectado (testeable; el page pasa `new Date()`).
- Ranking v1 usa **deadline de convocatoria + hitos de la postulación**; **no** mezcla los `due_date`
  de las tareas operativas (esas viven en la sección de tareas del detalle).
- **Alertas visuales** (vista + widgets + semáforo), no activas (email/WhatsApp necesitan canal → fuera).

## Hallazgos del estado actual (anclan el diseño)

- `lib/demo/types.ts` ya define `PIPELINE_STATES`: `detectada, analizada, priorizada, en_alianzas,
  en_formulacion, presentada, en_evaluacion, aprobada, rechazada, descartada`. El ciclo existe.
- `lib/agent/schema.ts` ya captura `deadline: { date: string|null, verified: boolean }` por oportunidad.
- Las fechas en el app son strings ISO (`deadline.date`, `DemoTask.due_date`). Se mantiene esa convención.

## Arquitectura

### Modelo — tabla `submissions` (Drizzle)
| columna | tipo | nota |
|---|---|---|
| id | text PK | = `opportunityId`; FK → opportunities(id) on delete cascade |
| fechaPresentacion | text | ISO `YYYY-MM-DD`, nullable |
| radicado | text | número de radicado / referencia de la postulación, nullable |
| fechaResultadoEsp | text | ISO, fecha esperada de resultado, nullable |
| proximoHito | text | descripción del próximo hito, nullable |
| proximoHitoFecha | text | ISO, nullable |
| notas | text | nullable |
| updatedAt | timestamptz NOT NULL default now() | |

Tipos `SubmissionRow` / `NewSubmissionRow`. Columna SQL: `fecha_presentacion`, `fecha_resultado_esp`,
`proximo_hito`, `proximo_hito_fecha`, `updated_at` (mapeo snake_case de Drizzle).

### Lógica pura — `lib/agent/tracking/deadlines.ts`
- `IN_FLIGHT_STATES`: `['priorizada','en_alianzas','en_formulacion','presentada','en_evaluacion']`
  (excluye `detectada`/`analizada` = pre-decisión, y `aprobada`/`rechazada`/`descartada` = cerradas).
- `type Urgency = 'vencida' | 'urgente' | 'proxima' | 'lejana' | 'sin_fecha'`.
- `type DeadlineKind = 'deadline' | 'hito' | 'resultado'`.
- `interface NextDate { date: string | null; kind: DeadlineKind | null; daysLeft: number | null; urgency: Urgency }`.
- `nextRelevantDate(input: { state: PipelineState; deadlineDate: string | null; submission: SubmissionLike | null }, today: Date): NextDate`
  - `SubmissionLike = { fechaResultadoEsp: string | null; proximoHitoFecha: string | null }`.
  - **Antes de presentar** (`state` ∈ {priorizada, en_alianzas, en_formulacion}): usa `deadlineDate`
    como `kind: 'deadline'`.
  - **Presentada / en evaluación** (`state` ∈ {presentada, en_evaluacion}): toma la fecha **más próxima
    aún futura o de hoy** entre `proximoHitoFecha` (`kind: 'hito'`) y `fechaResultadoEsp` (`kind:
    'resultado'`); si ambas son null, cae a `deadlineDate` (`kind: 'deadline'`).
  - `daysLeft` = diferencia en días enteros entre la fecha elegida y `today` (negativo si pasó).
    Comparación por día calendario (normalizando a medianoche UTC) para evitar ruido de horas.
  - `urgency`: `vencida` (daysLeft < 0), `urgente` (0–7), `proxima` (8–30), `lejana` (>30),
    `sin_fecha` (date null).
- `interface InFlightItem { opportunityId: string; name: string; state: PipelineState; next: NextDate }`.
- `rankInFlight(items: TrackingInput[], today: Date): InFlightItem[]`
  - `TrackingInput = { opportunityId; name; state; deadlineDate; submission }`.
  - Filtra a `IN_FLIGHT_STATES`, computa `nextRelevantDate`, ordena por `daysLeft` asc con `sin_fecha`
    (null) al final; devuelve la lista rankeada.
- `buildTrackingInputs(opps: OpportunityRow[], submissions: SubmissionRow[]): TrackingInput[]`
  — helper puro compartido por `/seguimiento` y el dashboard (evita duplicar el armado): por cada
  oportunidad arma `{ opportunityId: o.id, name: o.analysis.source.name, state: o.state, deadlineDate:
  o.analysis.deadline.date, submission: <la de su id, o null> }`. Une por id con un `Map`.
- `deadlineCounts(items: InFlightItem[]): { vencidas: number; estaSemana: number; enEvaluacion: number }`
  - `vencidas` = urgency `vencida`; `estaSemana` = urgency `urgente`; `enEvaluacion` = `state ===
    'en_evaluacion'`. (Para los widgets del dashboard.)

Puro y total: lista vacía → `[]` y conteos en 0; fechas inválidas/nulas → `sin_fecha`.

### Persistencia — `lib/db/submissions.ts`
- `listSubmissions(): Promise<SubmissionRow[]>`.
- `getSubmission(opportunityId: string): Promise<SubmissionRow | undefined>`.
- `lib/db/submission-actions.ts` (`'use server'`): `saveSubmissionAction(opportunityId: string, patch:
  Partial<Omit<NewSubmissionRow,'id'>>): Promise<void>` — upsert (`insert ... onConflictDoUpdate`,
  set `updatedAt: new Date()`) → `revalidatePath('/seguimiento')`, `revalidatePath('/dashboard')`,
  `revalidatePath(\`/oportunidad/${opportunityId}\`)`.

### UI
- **`/seguimiento`** (Server Component, `export const dynamic = 'force-dynamic'`) + link "Seguimiento"
  en `components/nav-header.tsx`. Lee oportunidades (queries existentes) + `listSubmissions()`, arma
  los `TrackingInput` (name = `analysis.source.name`, deadlineDate = `analysis.deadline.date`), llama
  `rankInFlight(inputs, new Date())` y renderiza la lista ordenada por urgencia: semáforo por
  `urgency`, badge de estado, próxima fecha + `kind` + días restantes, link al detalle. Estado vacío
  si no hay nada en vuelo. DB caída → estado vacío con nota (try/catch, no rompe).
- **Detalle `/oportunidad/[id]`**: sección nueva "Seguimiento de la postulación"
  (`components/tracking/submission-section.tsx`, `'use client'`): form con
  fechaPresentacion / radicado / fechaResultadoEsp / proximoHito / proximoHitoFecha / notas →
  `saveSubmissionAction` en `useTransition` + `router.refresh()`. El page carga `getSubmission(id)` y
  se la pasa. Se muestra siempre (es válido registrar aun antes de presentar), con copy que orienta.
- **Dashboard** (`components/dashboard/dashboard-view.tsx`): 3 widgets nuevos reusando `widget-card`
  — "Vencen esta semana" (`estaSemana`), "Vencidas" (`vencidas`), "En evaluación" (`enEvaluacion`),
  alimentados por `deadlineCounts(rankInFlight(buildTrackingInputs(opps, submissions), new Date()))`.
  El page del dashboard usa el mismo helper `buildTrackingInputs` que `/seguimiento`.

### Reuso
Mismo patrón de tabla 1:1 + queries + action + UI que Financiadores §11 / Aliados §12. La lógica de
deadlines es pura como `alliance/match` o `scoring`. No toca el análisis ni el pipeline existentes.

## Manejo de errores (product-grade)
- `nextRelevantDate` / `rankInFlight` / `deadlineCounts` puros y totales: nunca lanzan; null/ inválido → `sin_fecha`.
- `/seguimiento` y el dashboard: DB caída al leer submissions → la vista/los widgets caen a vacío/0 sin romper el resto.
- Form: fechas deben ser ISO `YYYY-MM-DD` o vacío; validación en el cliente antes de llamar la action.
- Upsert idempotente (un registro vigente por oportunidad); regenerar reemplaza, sin estado parcial.

## Testing
- `lib/agent/tracking/deadlines.test.ts` (puro): `nextRelevantDate` pre-presentación (usa deadline),
  post-presentación (elige hito vs resultado el más próximo; fallback a deadline); buckets de urgencia
  (vencida / urgente / próxima / lejana / sin_fecha) con `today` fijo; `rankInFlight` ordena asc con
  sin_fecha al final y filtra fuera las cerradas/pre-decisión; `deadlineCounts` cuenta correctamente.
- `lib/db/submissions.test.ts` (integración skipIf): `listSubmissions` / `getSubmission`.
- `lib/db/submission-actions.test.ts` (integración skipIf, mock `next/cache`): upsert round-trip
  (create + update por id).
- Mantener verde la suite (tests de alianzas + previos) y typecheck limpio; `pnpm build` con
  `/seguimiento` y el detalle dinámicos. Tests de integración: individuales con `DATABASE_URL`
  exportada inline (nunca `pnpm test -- <file>`).

## Migración
`pnpm db:push` cuelga con el pooler de Supabase → aplicar la migración de `submissions` con un script
throwaway vía cliente `postgres` directo + verificación por `information_schema`, y borrarlo antes de
commitear.

## Variables de entorno
Ninguna nueva.

## Fuera de alcance (slices posteriores)
- **Resultado (ganada/perdida) → lección aprendida** hacia la base de conocimiento / `lessonsLearned`
  del financiador (§15).
- **Alertas activas** (email / WhatsApp): necesitan un canal y credenciales.
- Incluir los `due_date` de las tareas operativas en el ranking de deadlines.
- Cambios automáticos de estado a partir de las fechas (p. ej. auto-`presentada`); historial de hitos.

## Relación con el roadmap
Primer incremento del seguimiento post-decisión: convierte el ciclo de estados (que ya existe) en una
**superficie accionable** con metadata de postulación y visibilidad transversal de deadlines. Junto al
"si conviene" (análisis), el "con quién" (§12) y el "cómo formular" (§13), cierra el "qué pasa después".
