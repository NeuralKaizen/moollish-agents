# Resultado → lección aprendida — slice del seguimiento — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-30.
> Construye sobre el slice de Seguimiento (tabla `submissions`) y sobre Financiadores §11
> (`funders.lessonsLearned` ya se inyecta en el prompt de análisis vía `formatFunderBlock`).
> Roadmap: cierra el ciclo de seguimiento; primer paso de la base de conocimiento §15.
> Mentalidad: PRODUCTO, no demo.

## Objetivo

Cuando una postulación termina, capturar el **resultado** (ganada/perdida/otro) y la **lección
aprendida**, **sincronizar el estado** del pipeline en un solo gesto, y **anexar la lección al
financiador** correspondiente para que futuros análisis de ese financiador la aprovechen. Reusa el
canal de aprendizaje que ya existe (`funders.lessonsLearned` → `formatFunderBlock` → prompt), sin
tabla de conocimiento nueva.

## Decisiones de alcance (brainstorming)

- **Feed-forward por financiador**: anexar la lección al `lessonsLearned` del financiador (que ya
  alimenta el análisis), no una tabla `lessons` nueva (eso es §15 completo, slice posterior).
- **Resultado + lección viven en `submissions`** (extender, no tabla nueva): es el cierre de la postulación.
- **Sincronizar estado en un gesto**: ganada→`aprobada`, perdida→`rechazada`, otro→sin cambio.
- Lógica pura (`stateForResultado`, `appendLesson`) con `today` inyectado.

## Arquitectura

### Modelo — extender tabla `submissions` (ALTER, no tabla nueva)
Nuevas columnas:
| columna | tipo | nota |
|---|---|---|
| resultado | text `'ganada'\|'perdida'\|'otro'` | nullable |
| montoOtorgado | text | nullable (monto efectivamente otorgado si ganada) |
| leccion | text | nullable (lección aprendida, texto libre) |
| leccionAnexada | boolean NOT NULL default false | marca si la lección ya se anexó al financiador (evita duplicar) |

Columnas SQL: `resultado`, `monto_otorgado`, `leccion`, `leccion_anexada`. Se actualiza el `$type`
de la columna `resultado` a la unión. `SubmissionRow`/`NewSubmissionRow` reflejan los nuevos campos.

### Lógica pura — `lib/agent/tracking/lessons.ts`
- `type Resultado = 'ganada' | 'perdida' | 'otro'`.
- `stateForResultado(r: Resultado): PipelineState | null` — `ganada`→`'aprobada'`, `perdida`→`'rechazada'`,
  `otro`→`null` (no toca el estado).
- `appendLesson(existing: string | null, leccion: string, today: Date): string` — formatea
  `- [YYYY-MM-DD] <leccion.trim()>` y lo **anexa** al texto existente (con un salto de línea) o lo crea
  si `existing` es vacío/null. Preserva el contenido previo. La fecha sale de `today` inyectado
  (`Date.UTC`/`toISOString().slice(0,10)` para `YYYY-MM-DD`). Total: `leccion` vacía → devuelve
  `existing ?? ''` sin cambios (el guard real de "sin lección" vive en la action).

### Persistencia — extender `lib/db/submission-actions.ts`
- `recordOutcomeAction(opportunityId: string, outcome: { resultado: Resultado | null; montoOtorgado: string | null; leccion: string | null }): Promise<void>`
  - Upsert en `submissions` de `{ resultado, montoOtorgado, leccion }` (mismo patrón `onConflictDoUpdate`
    que `saveSubmissionAction`, set `updatedAt`).
  - Si `resultado` no es null y `stateForResultado(resultado)` no es null → `db.update(opportunities)
    .set({ state }).where(eq(opportunities.id, opportunityId))`.
  - Revalida `/seguimiento`, `/dashboard`, `/pipeline`, `/oportunidad/${opportunityId}`.
- `saveLessonToFunderAction(opportunityId: string): Promise<{ status: 'anexada' | 'sin_financiador' | 'sin_leccion' }>`
  - Carga la oportunidad (`getOpportunity`) y la submission (`getSubmission`). Si no hay `leccion`
    (vacía/null) → `{ status: 'sin_leccion' }`.
  - `const rows = await listFunders()`; `const matched = matchFunder(JSON.stringify(o.analysis), rows.map(rowToProfile))`.
    Si `matched` es null → `{ status: 'sin_financiador' }`. Ubica el `FunderRow` por `name === matched.name`.
  - `updateFunderAction(row.id, { lessonsLearned: appendLesson(row.lessonsLearned, submission.leccion, new Date()) })`
    (reusa la action existente, que revalida `/financiadores`). Marca `submissions.leccionAnexada = true`.
    Revalida el detalle. Devuelve `{ status: 'anexada' }`.

### UI — `components/tracking/outcome-section.tsx` (`'use client'`)
En el detalle, **después** de `SubmissionSection` y antes de `TaskList`:
- Form de resultado: `select` resultado (—/ganada/perdida/otro), input `montoOtorgado`, textarea `leccion`
  → botón "Guardar resultado" (`recordOutcomeAction` en `useTransition`, `router.refresh()`, **try/catch
  con error inline**, mismo patrón product-grade que el guardado de la postulación).
- Botón "Guardar lección al financiador" (`saveLessonToFunderAction`): muestra el `status` devuelto —
  `anexada` → "Lección anexada al financiador ✓"; `sin_financiador` → "No se identificó un financiador
  con perfil cargado"; `sin_leccion` → "Escribí la lección antes de anexarla". Si `submission.leccionAnexada`
  ya es true, lo indica en el copy. También con try/catch.
- El page del detalle ya carga `getSubmission(id)`; se la pasa a `OutcomeSection` (un solo fetch).

### Reuso
`updateFunderAction` (append al financiador), `matchFunder`/`rowToProfile`/`listFunders` (identificar
financiador), `getOpportunity`/`getSubmission` (cargar contexto), patrón de upsert de `saveSubmissionAction`.
La lógica pura sigue el estilo de `deadlines.ts`. No toca el análisis ni el pipeline existentes.

## Manejo de errores (product-grade)
- `stateForResultado`/`appendLesson` puros y totales.
- `recordOutcomeAction`: oportunidad inexistente → el upsert de submission fallaría por FK; se asume
  que el detalle solo se abre para oportunidades existentes (igual que el resto de actions del detalle).
- `saveLessonToFunderAction`: nunca lanza por "no hay financiador" o "no hay lección" → devuelve status.
- Cliente: ambos botones envueltos en try/catch con feedback inline (no rompen el detalle).
- `leccionAnexada` evita anexar dos veces sin querer; re-anexar requiere acción explícita.

## Testing
- `lib/agent/tracking/lessons.test.ts` (puro): `stateForResultado` (ganada→aprobada, perdida→rechazada,
  otro→null); `appendLesson` (crea desde null/vacío; anexa preservando lo previo; incluye la fecha
  `YYYY-MM-DD` de `today`; lección vacía → sin cambios).
- `lib/db/submission-actions.test.ts` (integración skipIf, extender): `recordOutcomeAction` guarda
  resultado/monto/leccion y sincroniza `opportunities.state` (ganada→aprobada); `saveLessonToFunderAction`
  anexa al `lessonsLearned` del financiador matcheado + marca `leccionAnexada`, y devuelve
  `sin_financiador` / `sin_leccion` en esas rutas. (Fixtures: oportunidad padre + financiador con alias
  que aparezca en el análisis.)
- Mantener verde la suite (tests de seguimiento + previos) y typecheck limpio; `pnpm build` con el
  detalle dinámico. Integración: individual con `DATABASE_URL` inline (nunca `pnpm test -- <file>`).

## Migración
`pnpm db:push` cuelga con el pooler → `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ...` vía script
throwaway (`postgres` directo) + verificación por `information_schema`, borrar antes de commitear.

## Variables de entorno
Ninguna nueva.

## Fuera de alcance (slices posteriores)
- Tabla `lessons` consultable / base de conocimiento §15 completa (lecciones genéricas, no por-financiador).
- Widget de win-rate (ganadas/perdidas, monto otorgado acumulado) en el dashboard.
- Edición/borrado de una lección ya anexada al financiador desde el detalle.

## Relación con el roadmap
Cierra el bucle de seguimiento: del "qué pasa después" al "qué aprendimos". La lección no queda inerte:
entra al perfil del financiador que **ya** alimenta el análisis, así el agente mejora sus próximas
decisiones sobre ese financiador. Primer incremento concreto de la base de conocimiento §15.
