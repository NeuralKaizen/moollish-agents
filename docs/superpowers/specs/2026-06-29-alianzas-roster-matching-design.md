# Motor de alianzas §12 — primer slice: roster + matching — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-29.
> Construye sobre Fase A (persistencia), el análisis (que ya produce `partners_needed`), y el
> patrón de roster editable de Financiadores (§11).
> Roadmap: Módulo 5 §12 — base de aliados + Alliance Fit Score. Mensajes de acercamiento: slice posterior.
> Mentalidad: PRODUCTO, no demo.

## Objetivo

Que el agente no solo detecte la **brecha** de aliados (ya lo hace en `partners_needed`), sino que
**sugiera aliados concretos** de una base curada, rankeados por un **Alliance Fit Score**. Primer
slice: una base de aliados editable (CRUD) + matching determinista que, en el detalle de una
oportunidad, propone los mejores aliados por cada brecha. Los **mensajes de acercamiento** quedan
para un slice posterior.

## Decisiones de alcance (brainstorming)

- **Fit Score determinista** (no LLM): a partir de los campos del aliado vs la brecha + la oportunidad.
- **Roster editable** (CRUD, mismo patrón que Financiadores §11), sembrado con ~6 aliados.
- **Matching mostrado en el detalle** (server-side, on-load; barato y determinista — sin acción).
- Mensajes de acercamiento, factores que requieren más datos (velocidad/cartas/riesgo de coordinación), LLM/embeddings en el match → fuera de este slice.

## Arquitectura

### Modelo — tabla `allies` (§15 Aliado, Drizzle)
| columna | tipo | nota |
|---|---|---|
| id | text PK | slug, ej. `univ-nacional` |
| name | text NOT NULL | |
| type | text NOT NULL | matchea `ally_type` de las brechas (universidad, ONG, alcaldía, socio internacional…) |
| country | text | |
| capabilities | text | qué hacen (para el solapamiento) |
| experience | text | |
| contact | text | |
| recommendedRole | text | rol típico |
| reputation | text NOT NULL | `'alto' \| 'medio' \| 'bajo'` |
| updatedAt | timestamptz NOT NULL default now() | |
Tipos `AllyRow`/`NewAllyRow`. Sembrada con ~6 aliados (universidad/centro de investigación, ONG/fundación local, Foundation Nova, partner internacional, especialista ambiental, alcaldía/gobernación).

### Matching + Fit Score — `lib/agent/alliance/match.ts` (puro)
- `AllyProfile` = forma que consume el matcher (subset de `AllyRow`: name, type, country, capabilities, recommendedRole, reputation).
- `scoreAlly(gap, ally, context): number` (0-100) — combina, con pesos fijos:
  - **Tipo**: solapamiento entre `gap.ally_type` y `ally.type` (case-insensitive, por palabras) — peso mayor.
  - **Complementariedad técnica/temas**: solapamiento de keywords entre `ally.capabilities` y `context.themes` (temas/título de la oportunidad).
  - **Geografía**: `ally.country` vs `context.country` (si ambos presentes).
  - **Reputación**: alto/medio/bajo → aporte fijo.
- `suggestAllies(partnersNeeded, allies, context, opts?): { gap; candidates: { ally: AllyProfile; score: number }[] }[]` — por cada brecha, ranquea los aliados por `scoreAlly` desc y devuelve el top (default 3); descarta score 0. `gap` = item de `partners_needed` (`ally_type`, `suggested_role`, `priority`, `reason`). `context = { themes: string; country: string | null }`.

### Persistencia — `lib/db/allies.ts`
- `listAllies(): Promise<AllyRow[]>` (orden por name); `getAlly(id)`; `rowToProfile(row): AllyProfile`.
- Server actions (`lib/db/ally-actions.ts`, `'use server'`): `createAllyAction`, `updateAllyAction`, `deleteAllyAction` (revalidatePath `/aliados`). Mismo patrón que financiadores.
- Seed: `lib/db/allies-seed.ts` (`ALLY_SEED: NewAllyRow[]`, los ~6) + `scripts/seed-allies.ts` (`pnpm seed:allies`).

### UI
- **`/aliados`** (Server Component + client CRUD), link en `nav-header`. Igual que `/financiadores`.
- **Detalle `/oportunidad/[id]`**: sección "Aliados sugeridos". Server-side: `const allies = await listAllies(); const suggestions = suggestAllies(o.analysis.partners_needed, allies.map(rowToProfile), { themes: \`${o.analysis.source.name} ${o.analysis.draft_outputs?.executive_summary ?? ''}\`, country: null })`. **`country` va `null` por ahora** (el análisis no tiene un campo país confiable); el factor geografía queda cableado en `scoreAlly` pero inerte hasta que exista una fuente de país. Los señales activas en este slice: **tipo + complementariedad + reputación**. Render por brecha: `ally_type` + `suggested_role` + `reason` + lista de aliados top con su Fit Score y `recommendedRole`. Estado vacío si no hay brechas o no hay aliados cargados.

### Reuso
Mismo patrón que Financiadores §11 (tabla + queries + actions + CRUD UI + seed). El matcher es puro como `funder-match`/`anexo-d`. No toca el análisis ni el pipeline.

## Manejo de errores (product-grade)
- Sin aliados cargados o sin brechas → estado vacío en el detalle (no rompe).
- `suggestAllies` es puro y total: brechas vacías → `[]`; aliados vacíos → cada brecha con `candidates: []`.
- DB de aliados caída al renderizar el detalle → la sección cae a vacío con nota (no rompe el resto del detalle).
- CRUD: `name`, `type` y `reputation` requeridos; validación en el formulario.

## Testing
- `lib/agent/alliance/match.test.ts` (puro): `scoreAlly` (match de tipo sube el score; solapamiento de capacidades; geografía; reputación) y `suggestAllies` (ranking desc, top-N, brecha sin candidatos, sin brechas).
- `lib/db/allies.test.ts` (integración skipIf): list/get/rowToProfile.
- `lib/db/ally-actions.test.ts` (integración skipIf, mock next/cache): create/update/delete.
- `lib/db/allies-seed.test.ts` (puro): ~6 aliados con id único, name/type/reputation no vacíos.
- Mantener verde la suite (163 tests) y typecheck limpio; build con el detalle dinámico.

## Variables de entorno
Ninguna nueva.

## Fuera de alcance (slices posteriores)
- **Mensajes de acercamiento** (borradores de outreach por aliado sugerido).
- Factores del fit que requieren más datos (velocidad de respuesta, cartas disponibles, riesgo de coordinación) + LLM/embeddings en el match.
- Persistir el aliado elegido en la oportunidad / mapa de aliados; historial de colaboración real.

## Relación con el roadmap
Primer incremento del Módulo 5 §12: convierte la "brecha de aliados" del análisis en
**sugerencias accionables** desde una base curada, con un Fit Score. Cierra el "con quién aplicar"
del PDF (junto al "si conviene" del análisis y el "cómo formular" del §13).
