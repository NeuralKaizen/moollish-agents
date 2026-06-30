# Copiloto de formulación §13 — primer slice: Concept Note — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-29.
> Construye sobre Fase A (persistencia), §11 (match financiador), el análisis existente.
> Roadmap: Módulo 6 §13 (estructuración preliminar) — primer entregable; los otros 5 reusan el patrón.
> Mentalidad: PRODUCTO, no demo (memoria `building-product-not-demo`).

## Objetivo

Cuando una oportunidad está priorizada, pasar de analista a **copiloto de formulación**:
generar, **on-demand**, un primer borrador útil de **Concept Note** a partir del análisis ya
hecho — para validar interés con un aliado o financiador sin redactar de cero. Es el primer
entregable del §13; la maquinaria (generador + tabla `drafts` + acción + UI) queda lista para
sumar los demás (teoría de cambio, marco lógico, presupuesto, cronograma, matriz de riesgos).

## Decisiones de alcance (brainstorming)

- **Solo Concept Note** en este slice; los otros 5 entregables → slices posteriores (cada uno =
  schema + prompt nuevos sobre la misma maquinaria).
- **On-demand** (botón en el detalle), nunca automático — el §13 aplica a oportunidades priorizadas.
- **Un borrador vigente por (oportunidad, tipo)**: regenerar **reemplaza** (upsert); sin historial
  de versiones por ahora.
- **Trabaja sobre el análisis ya guardado** (no re-scrapea la fuente).

## Arquitectura

### Modelo — tabla `drafts` (Drizzle)
| columna | tipo | nota |
|---|---|---|
| id | text PK | `<opportunity_id>:<kind>` (un vigente por tipo → upsert) |
| opportunityId | text NOT NULL | FK → opportunities.id, on delete cascade |
| kind | text NOT NULL | 'concept_note' |
| content | jsonb NOT NULL | el Concept Note estructurado |
| missingData | jsonb `string[]` NOT NULL | datos ausentes en la fuente |
| createdAt | timestamptz NOT NULL default now() | |
Tipos `DraftRow`/`NewDraftRow`. `id = '<opportunityId>:concept_note'` → `recordDraft` hace
`onConflictDoUpdate` (regenerar reemplaza).

### Generador — `lib/agent/drafts/concept-note.ts`
- `ConceptNoteSchema` (Zod) — secciones del §13 "contenido mínimo":
  `problema`, `solucion`, `beneficiarios`, `innovacion`, `resultados`, `presupuesto_marco`
  (strings), + `missing_data: string[]`.
- `type ConceptNote = z.infer<typeof ConceptNoteSchema>`.
- `generateConceptNote(analysis: OpportunityAnalysis, funderBlock: string, deps: { generate }): Promise<ConceptNote>`
  — `deps.generate(prompt, model)` **inyectable** (mismo patrón que `analyzeOpportunity`), así
  es testeable sin pegarle al LLM. La impl real (`generateConceptNoteWithOpenRouter`) usa el AI
  SDK con `Output.object(ConceptNoteSchema)`.
- **Prompt + guardrail (obligatorio §13)**: identidad de copiloto de formulación; instrucciones:
  marcar todo como **BORRADOR**, **NO inventar** requisitos/fechas/montos/condiciones no
  presentes en la fuente, **citar/usar la evidencia** del análisis, y poner en `missing_data`
  todo dato faltante para completar el concept note. El contexto que recibe es el análisis
  serializado (resumen, evidencia con citas, fit, monto, deadline, etc.) + el `funderBlock` del
  financiador (reusa §11) para alinear la narrativa.

### Persistencia — `lib/db/drafts.ts`
- `recordDraft(row: NewDraftRow): Promise<void>` (insert `onConflictDoUpdate` target id → regenerar reemplaza).
- `getDraft(opportunityId: string, kind: string): Promise<DraftRow | undefined>`.

### Acción + UI
- `generateConceptNoteAction(opportunityId: string)` (`'use server'`):
  `getOpportunity(opportunityId)` → si no existe, return; arma el `funderBlock`
  (`listFunders`→`matchFunder`(sobre el análisis)→`formatFunderBlock`, degradando a genérico) →
  `generateConceptNote(o.analysis, funderBlock, { generate: generateConceptNoteWithOpenRouter })`
  → `recordDraft({ id: \`${opportunityId}:concept_note\`, opportunityId, kind:'concept_note', content, missingData })`
  → `revalidatePath('/oportunidad/'+opportunityId)`. Si el LLM falla, propaga el error (la UI lo
  muestra) y NO guarda borrador parcial.
- En **`app/oportunidad/[id]/page.tsx`** (Server Component, ya existe): cargar `getDraft(id,'concept_note')`
  y pasarlo a un componente nuevo `ConceptNoteSection`.
- **`components/drafts/concept-note-section.tsx`** (client): botón **"Generar concept note"**
  (o "Regenerar" si ya hay uno) que llama la action en `useTransition` + `router.refresh()`;
  muestra el concept note con un **badge "BORRADOR"**, sus 6 secciones, y un aviso de
  **datos faltantes** (`missing_data`).

### Reuso
`analyzeOpportunity`-pattern (deps.generate inyectado), `generateText`+`Output.object` (AI SDK/
OpenRouter), match de financiador (`listFunders`/`rowToProfile`/`matchFunder`/`formatFunderBlock`),
`getOpportunity`. El generador NO toca el análisis ni el pipeline.

## Manejo de errores (product-grade)
- LLM falla / output inválido → la action propaga el error; la UI muestra "no se pudo generar";
  no se guarda borrador parcial.
- Oportunidad inexistente → la action no hace nada.
- Regenerar reemplaza el borrador anterior (upsert por id), sin estado parcial.
- El guardrail evita inventar: lo ausente va a `missing_data`, no se rellena con supuestos.

## Testing
- `lib/agent/drafts/concept-note.test.ts` (puro, `generate` mockeado): `generateConceptNote`
  arma el prompt con el guardrail y devuelve el `ConceptNote` parseado; el schema valida las 6
  secciones + `missing_data`.
- `lib/db/drafts.test.ts` (integración skipIf): `recordDraft` upsert (regenerar reemplaza) + `getDraft`.
- `generateConceptNoteAction`: la generación real se verifica en runtime; la lógica de wiring se
  cubre por typecheck (integración seam, como las otras actions).
- Mantener verde la suite actual (156 tests) y typecheck limpio.

## Variables de entorno
Ninguna nueva (usa `OPENROUTER_API_KEY` y `DATABASE_URL`). Modelo: `DEFAULT_MODEL` (o un
`DRAFTS_MODEL` opcional si más adelante se quiere un modelo distinto; no en este slice).

## Fuera de alcance (slices posteriores)
- Los otros 5 entregables (teoría de cambio, marco lógico, presupuesto preliminar, cronograma,
  matriz de riesgos) — mismo generador/tabla/UI, schema+prompt por tipo.
- Historial de versiones de borradores.
- Exportar a PDF/Word; edición manual del borrador en la UI.
- Generación que re-scrapea o pide documentos faltantes.

## Relación con el roadmap
Primer incremento del Módulo 6 §13. Cierra el arco del agente: detectar → analizar → priorizar →
**formular** un primer borrador, con el guardrail de calidad que el PDF exige.
