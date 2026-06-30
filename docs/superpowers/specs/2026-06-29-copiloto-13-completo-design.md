# Copiloto de formulación §13 completo — 6 entregables — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-29.
> Generaliza la maquinaria del slice Concept Note (ya en master) a todos los entregables del §13.
> Roadmap: Módulo 6 §13 (estructuración preliminar) — completar el módulo.
> Mentalidad: PRODUCTO, no demo.

## Objetivo

Completar el §13: generar on-demand, con guardrail, los **6 entregables** de formulación para
una oportunidad — Concept Note (ya existe), Teoría de Cambio, Marco Lógico, Presupuesto
preliminar, Cronograma y Matriz de Riesgos. Para evitar duplicar 6 veces el mismo código, se
**generaliza** la maquinaria del Concept Note a un **registro de tipos**: una sola UI, una sola
acción y un generador genérico; cada entregable es una entrada del registro (label + secciones).

## Decisiones de alcance (brainstorming)

- **Contenido como secciones de texto con nombre por tipo** (no estructuras tabulares finas): cada
  entregable = un Zod de campos string según el "contenido mínimo" del §13 + `missing_data`.
  Estructura fina (tablas reales de presupuesto/riesgos, export) → mejora posterior.
- **Generalizar** (registro + genérico), no duplicar; **refactorizar el Concept Note** al registro.
- On-demand (botón por entregable), guardrail §13, trabaja sobre el análisis guardado.

## Arquitectura

### Registro — `lib/agent/drafts/registry.ts`
```ts
interface DraftSection { key: string; label: string }
interface DraftKind { kind: string; label: string; sections: DraftSection[] }
export const DRAFT_KINDS: DraftKind[]
```
Los 6 tipos con sus secciones (contenido mínimo del §13):
- `concept_note` — Concept Note: problema, solucion, beneficiarios, innovacion, resultados, presupuesto_marco.
- `teoria_cambio` — Teoría de Cambio: problema, insumos, actividades, productos, resultados, impacto, supuestos.
- `marco_logico` — Marco Lógico: fin, proposito, componentes, actividades, indicadores, medios_verificacion, supuestos.
- `presupuesto` — Presupuesto preliminar: categorias, costos_unitarios, contrapartida, fee, tecnologia, personal, operacion.
- `cronograma` — Cronograma: fases, hitos, responsables, fecha_limite, ruta_critica.
- `matriz_riesgos` — Matriz de Riesgos: riesgos_tecnicos, riesgos_financieros, riesgos_sociales, riesgos_legales, riesgos_ambientales, mitigaciones.

Helpers (puros): `getDraftKind(kind): DraftKind | undefined`; `buildKindSchema(kind): ZodObject`
— deriva el schema `{ [section.key]: z.string(), …, missing_data: z.array(z.string()) }` a partir
de las secciones (no se escriben 6 schemas a mano).

### Generador genérico — `lib/agent/drafts/generate.ts`
- `GUARDRAIL` (constante compartida, §13: BORRADOR / no inventar requisitos·fechas·montos no
  presentes / usar y citar la evidencia / missing_data). (Se mueve desde concept-note.ts.)
- `buildDraftPrompt(kind: string, analysis: OpportunityAnalysis, funderBlock: string): string` —
  guardrail + label y secciones del tipo (del registro) + `JSON.stringify(analysis)` + funderBlock.
- `type DraftGenerator = (prompt: string, schema: z.ZodTypeAny) => Promise<Record<string, unknown>>`.
- `generateDraft(kind, analysis, funderBlock, deps: { generate: DraftGenerator }): Promise<{ content: Record<string, string>; missingData: string[] }>`
  — arma el prompt + `buildKindSchema(kind)`, llama `deps.generate`, y **separa** `missing_data`
  (→ missingData) del resto (→ content: Record sección→texto). `generate` inyectable → testeable.
- `generateDraftWithOpenRouter(prompt, schema)` — impl real (`generateText` + `Output.object({ schema })`).

### Modelo / queries
- `drafts.content`: cambia de `.$type<ConceptNote>()` a **`.$type<Record<string, string>>()`**
  (genérico para todos los tipos; `missing_data` ya tiene su columna). **Sin migración** (TS only).
- `lib/db/drafts.ts`: sumar `listDrafts(opportunityId: string): Promise<DraftRow[]>` (todos los
  borradores de la oportunidad). `recordDraft`/`getDraft` quedan igual.

### Acción + refactor
- `lib/db/draft-actions.ts`: `generateDraftAction(opportunityId: string, kind: string): Promise<void>`
  (genérica) reemplaza `generateConceptNoteAction`. Lógica: `getOpportunity` → si no existe, return;
  funderBlock (listFunders→matchFunder(JSON.stringify(analysis))→formatFunderBlock, degradando) →
  `generateDraft(kind, o.analysis, funderBlock, { generate: generateDraftWithOpenRouter })` →
  `recordDraft({ id: \`${opportunityId}:${kind}\`, opportunityId, kind, content, missingData })` →
  revalidar `/oportunidad/${opportunityId}`.
- **Refactor del Concept Note al registro**: `concept_note` pasa a ser una entrada de `DRAFT_KINDS`.
  Se eliminan `lib/agent/drafts/concept-note.ts` (su `GUARDRAIL`/schema/prompt/generadores van al
  registro+generate.ts), `generateConceptNoteAction` y `components/drafts/concept-note-section.tsx`,
  reemplazados por lo genérico. Los tests de concept-note se adaptan/reescriben sobre el genérico.

### UI — `components/drafts/drafts-section.tsx`
Sección "Borradores de formulación" en el detalle: itera `DRAFT_KINDS`; por cada tipo, una tarjeta
con su `label`, botón **Generar/Regenerar** (si ya hay borrador) → `generateDraftAction(opportunityId, kind)`
en `useTransition` + `router.refresh()`, badge **BORRADOR**, las secciones (label del registro +
`content[section.key]`) y el aviso de **datos faltantes** (`missingData`). El page carga
`listDrafts(id)` y arma un `Map<kind, DraftRow>` para pasarle a cada tarjeta el borrador existente.

## Manejo de errores (product-grade)
- LLM falla / output inválido → la action propaga; no se guarda borrador parcial (recordDraft tras generar OK).
- Oportunidad inexistente → no-op. `kind` desconocido → `buildKindSchema`/`getDraftKind` lo detecta y la action no hace nada (o lanza un error claro; no genera).
- Regenerar reemplaza (upsert por id), sin estado parcial. Cada entregable es independiente (un fallo no afecta a los otros).

## Testing
- `lib/agent/drafts/registry.test.ts` (puro): `DRAFT_KINDS` tiene los 6 tipos con secciones no vacías; `buildKindSchema` deriva un schema que valida un objeto con esas secciones + missing_data y rechaza si falta una sección.
- `lib/agent/drafts/generate.test.ts` (puro, `generate` mockeado): `buildDraftPrompt` incluye el guardrail + las secciones del tipo + contexto del análisis; `generateDraft` separa content/missingData correctamente; un kind por cada tipo produce el prompt con sus secciones.
- `lib/db/drafts.test.ts`: sumar caso de `listDrafts` (integración skipIf) — devuelve los borradores de una oportunidad.
- Refactor: los tests existentes del concept note se reescriben sobre el genérico (mismo cubrimiento).
- Mantener verde la suite (159 tests) y typecheck limpio. `pnpm build`: el detalle sigue dinámico.

## Variables de entorno
Ninguna nueva.

## Fuera de alcance (mejoras posteriores)
- Estructura fina por tipo (tablas de presupuesto/riesgos, marco lógico como matriz) y export a PDF/Word.
- Edición manual del borrador en la UI; historial de versiones.
- Un modelo dedicado por entregable (`DRAFTS_MODEL`); por ahora `DEFAULT_MODEL`.

## Relación con el roadmap
Cierra el Módulo 6 §13: el agente entrega, para una oportunidad priorizada, los seis insumos de
formulación como borradores con guardrail — el "copiloto que acelera la postulación" del PDF.
