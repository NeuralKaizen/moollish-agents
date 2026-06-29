# Financiadores: perfiles vivos (§11, sin embeddings) — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-29.
> Construye sobre Fase A (persistencia Supabase/Drizzle, en master).
> Roadmap: `docs/agente1-estado-y-roadmap.md` — Módulo 4 §11 (primer slice).
> Mentalidad: PRODUCTO, no demo (memoria `building-product-not-demo`).

## Objetivo

Reemplazar el bloque estático `FUNDER_KNOWLEDGE` (7 financiadores hardcodeados en el
prompt) por **perfiles vivos de financiadores**: datos estructurados y **editables sin
tocar código** en la DB. Al analizar una convocatoria, el agente **identifica el
financiador** y le **inyecta solo su perfil** (match-then-inject), en vez del bloque fijo de
siete. Es el primer paso del §11; los embeddings/RAG quedan para un slice posterior.

## Contexto (importante)

La herramienta es **de cero**: no hay corpus interno real (propuestas, casos). Los 7
financiadores actuales son conocimiento de dominio que se hardcodeó en `lib/agent/funders.ts`,
transcrito de la tabla del §11 del PDF. Por eso un RAG sobre repositorio interno tendría poco
de dónde recuperar hoy. Este slice entrega el valor inmediato (perfiles dinámicos, editables,
que alimentan el análisis con match) y deja el camino abierto a embeddings.

## Decisiones de alcance (tomadas en brainstorming)

- **Perfiles vivos estructurados primero**; embeddings/pgvector/RAG → slice posterior.
- **Match-then-inject**: se inyecta el perfil del financiador detectado, no todos.
- **Detección por alias determinista** (sin LLM, sin embeddings): aislada en una sola
  función `matchFunder` (el *seam* para sumar match semántico después sin rediseño).
- **CRUD completo** con pantalla `/financiadores` (editar sin código, Anexo E).

## Arquitectura

### Modelo de datos — tabla `funders` (Drizzle/Postgres)
Campos del §11; casi todos texto libre multilínea, editables:

| columna | tipo | nota |
|---|---|---|
| id | text PK | slug (ej. `fao`) |
| name | text NOT NULL | nombre visible |
| aliases | jsonb `string[]` NOT NULL | usados por el match (ej. ["FAO","Food and Agriculture Organization"]) |
| themes | text | temas/prioridades |
| geographies | text | geografías |
| typical_amounts | text | montos típicos |
| frequency | text | frecuencia de convocatorias |
| eligible_entity | text | tipo de entidad elegible |
| required_documents | text | documentos exigidos |
| winning_examples | text | ejemplos de proyectos ganadores |
| contacts | text | contactos |
| language | text | idioma |
| evaluation_criteria | text | criterios de evaluación |
| lessons_learned | text | lecciones aprendidas |
| updated_at | timestamptz NOT NULL default now() | |

Campos de texto opcionales (nullable) salvo `name` y `aliases`. Sembrada con los **7
actuales** (FAO, FONTAGRO, DIV Fund, Minciencias, ADR/MinAgricultura, CAR, UE/Horizon) a
partir de `FUNDER_KNOWLEDGE` + la tabla §11.

Tipos: `FunderRow` ($inferSelect), `NewFunderRow` ($inferInsert).

### Match-then-inject (sin embeddings) — `lib/agent/funder-match.ts` (puro)
- `matchFunder(text: string, funders: FunderProfile[]): FunderProfile | null` — normaliza
  (minúsculas) el texto ingestado y devuelve el primer financiador cuyo algún `alias`
  aparece como **palabra completa** (whole-word, case-insensitive, con límites de palabra
  para evitar falsos positivos como "CAR" dentro de "descargar"). Determinista y testeable.
  **Único seam**: cuando
  entren embeddings, este match se reemplaza/complementa sin tocar el resto.
- `formatFunderBlock(funder: FunderProfile | null): string` — arma el bloque de prompt del
  financiador (campos no vacíos). Si `null` → bloque genérico ("No se identificó un
  financiador con perfil cargado; analizá con criterio general").

`FunderProfile` = la forma del perfil que consume el agente (subset de `FunderRow` sin
columnas de infra). Vive en `lib/agent/funder-match.ts` para no acoplar el agente a Drizzle.

### Inyección en el prompt — `lib/agent/prompt.ts` + `lib/agent/llm.ts` + `lib/agent/analyze.ts`
Hoy `FUNDER_KNOWLEDGE` tiene dos partes: la **lista de financiadores** y **VEHÍCULOS
INSTITUCIONALES**. Se separan:
- **Vehículos institucionales** (Moollish/Sat2Farm/Foundation Nova) → quedan **fijos** en el
  prompt (independientes del financiador). Se mueven a una constante propia
  (`INSTITUTIONAL_VEHICLES` en `lib/agent/funders.ts`), siempre presente.
- La **lista de 7 financiadores** se **elimina del prompt estático** y se reemplaza por el
  `funderBlock` matcheado.
- `buildSystemPrompt(today, funderBlock: string)` recibe el bloque y lo inserta donde hoy va
  `FUNDER_KNOWLEDGE` (más los vehículos fijos).
- `generateWithOpenRouter(text, model, funderBlock)` pasa el bloque a `buildSystemPrompt`.
- `analyzeOpportunity(text, { generate, funderBlock })` recibe el `funderBlock` **inyectado**
  (no accede a la DB → sigue testeable). Default: bloque genérico si no se provee.

### Dónde ocurre el match (la ruta tiene la DB)
`app/api/analyze/route.ts`: tras ingerir, antes de analizar:
`const funders = await listFunders(); const funder = matchFunder(ingest.text, funders); const funderBlock = formatFunderBlock(funder);` → `analyzeOpportunity(ingest.text, { generate, funderBlock })`.
Si `listFunders()` falla, se usa el bloque genérico (el análisis nunca se rompe por los
financiadores). Opcional: incluir el nombre del financiador detectado en una nota de
ingestión.

### CRUD — `lib/db/funders.ts` + acciones + `/financiadores`
- `lib/db/funders.ts`: `listFunders()`, `getFunder(id)` + mapper a `FunderProfile`.
- Server actions (`'use server'`): `createFunderAction`, `updateFunderAction`,
  `deleteFunderAction` (mismo patrón que las acciones de oportunidades; `revalidatePath('/financiadores')`).
- `/financiadores` (Server Component): lista los perfiles; client components para
  crear/editar (formulario con los campos del §11; `aliases` como lista editable separada
  por comas) y borrar con confirmación.
- Link "Financiadores" en `components/nav-header.tsx`.

## Manejo de errores (product-grade)
- Sin match → bloque genérico + nota; el análisis procede.
- DB de financiadores caída al analizar → bloque genérico (degradación), análisis no se rompe.
- Editar/borrar un financiador NO afecta análisis ya guardados (el perfil se inyecta en el
  momento; no se persiste dentro de la oportunidad).
- Validación de formulario: `name` y al menos un `alias` requeridos.

## Testing
- `lib/agent/funder-match.test.ts` (puro): match con/sin coincidencia, case-insensitive,
  alias multi-palabra, primer match cuando varios; `formatFunderBlock` con perfil y con null.
- `lib/agent/prompt.test.ts`: `buildSystemPrompt(today, funderBlock)` incluye el bloque dado
  y mantiene los vehículos institucionales; actualizar los tests existentes a la nueva firma.
- `lib/db/funders.test.ts` (integración, `skipIf(!DATABASE_URL)`): create/list/get/update/delete round-trip.
- Seed: los 7 perfiles cumplen el esquema y traen `aliases` no vacíos.
- Mantener verde la suite actual (125 tests) y typecheck limpio.

## Fuera de alcance (slices posteriores)
- Embeddings / match semántico / **pgvector** (seam `matchFunder` listo).
- RAG sobre repositorio interno (cuando haya corpus real).
- Loop de "lecciones aprendidas" automático desde resultados del CRM (§24).
- Asociar el financiador detectado como entidad persistida en la oportunidad (hoy solo se
  inyecta en el análisis).

## Variables de entorno
Ninguna nueva (usa `DATABASE_URL` existente; sin proveedor de embeddings).

## Relación con el roadmap
Primer incremento del Módulo 4 §11. Convierte el conocimiento de financiadores de estático a
vivo/editable y establece el patrón de match-then-inject que el match semántico (pgvector)
extenderá cuando exista corpus.
