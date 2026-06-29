# Radar §7 — primer slice: SECOP / Datos Abiertos — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-29.
> Construye sobre Fase A (persistencia), §11 (match financiador), el pipeline de análisis y
> el patrón de jobs programados del conector Gmail (§8).
> Roadmap: Módulo 1 §7 (radar) — primer slice de una fuente; las demás reusan el patrón.
> Mentalidad: PRODUCTO, no demo (memoria `building-product-not-demo`).
> Credenciales: anotadas en `docs/apis-y-credenciales.md`.

## Objetivo

Detectar oportunidades automáticamente desde fuentes oficiales antes de que el equipo pierda
tiempo revisando a mano. Este primer slice conecta **SECOP / Datos Abiertos (Colombia)**:
descubre procesos de contratación, los normaliza, **pre-filtra por palabras clave (Anexo D)**,
deduplica y los registra como **"Detectada"** (livianas, sin análisis profundo). Alex/el agente
**promueve** las prometedoras → corre el análisis completo (Módulo 3) y caen en el pipeline.

## Decisiones de alcance (brainstorming)

- **"Detectada" liviana**: el radar NO corre el LLM por cada hallazgo; registra metadatos. El
  análisis completo ocurre al **promover** (fiel al §7/§14).
- **Tabla separada `detected_opportunities`** (no se toca el pipeline/dashboard actuales, que
  asumen `analysis` completo). Promover crea una fila normal en `opportunities`.
- **Fuente inicial: SECOP / Datos Abiertos** (API pública Socrata de `datos.gov.co`).
- **Trigger: Vercel Cron** (reusa el patrón del conector Gmail; endpoint protegido por `CRON_SECRET`).
- Una sola fuente y un solo cron en este slice; otras fuentes y scheduling fino van después.

## Arquitectura

### Modelo — tabla `detected_opportunities` (Drizzle)
| columna | tipo | nota |
|---|---|---|
| id | text PK | `secop:<proceso_id>` o uuid |
| source | text NOT NULL | 'secop' |
| sourceRef | text NOT NULL | id del proceso en SECOP |
| dedupKey | text NOT NULL UNIQUE | `secop:<proceso_id>` (dedup) |
| title | text NOT NULL | objeto del proceso |
| funder | text | entidad contratante |
| amount | text | valor (texto; normalización ligera) |
| currency | text | 'COP' por defecto en SECOP |
| deadline | text | fecha límite (ISO si se puede) |
| url | text | link al proceso |
| themes | text | keywords que matchearon |
| status | text NOT NULL | 'detectada' \| 'promovida' \| 'descartada' |
| opportunityId | text | null hasta promover |
| detectedAt | timestamptz NOT NULL default now() | |

Índice único en `dedupKey`. Tipos `DetectedRow`/`NewDetectedRow`.

### Descubrimiento — `lib/radar/`
- **`anexo-d.ts`** (puro): `INCLUDE_KEYWORDS` / `EXCLUDE_KEYWORDS` del Anexo D (agro, rural,
  clima, ambiente, IA, tecnología, ganadería, agricultura; excluir obras civiles puras, etc.) +
  `passesPrefilter(text): boolean` (incluye ≥1 keyword y no es excluido).
- **`secop.ts`**: cliente de la API Socrata de `datos.gov.co` (dataset SECOP II). Construye la
  URL con `$q`/`$where` (keywords + ventana de fechas reciente) y `$limit`; header opcional
  `X-App-Token` si `DATOS_GOV_APP_TOKEN` está seteado. `fetch` **inyectable** → testeable.
  Devuelve filas crudas (JSON). Cualquier credencial ausente NO lanza (la API es pública).
- **`secop-normalize.ts`** (puro): `normalizeSecopRow(row): DetectedOpportunity | null` —
  mapea los campos SECOP a la forma liviana (title=objeto, funder=entidad, amount/currency,
  deadline, url, sourceRef, dedupKey); devuelve `null` si faltan campos clave (sin id/objeto).
- **`discover.ts`**: `discoverFromSecop(deps): Promise<{ found; inserted; skipped }>` — orquesta:
  query → normalize (saltea nulls) → `passesPrefilter` → dedup-insert. Deps inyectados
  (`fetchRows`, `recordDetected`, opcional `alreadyKnown`); try/catch por fila → una mala no
  frena el lote.

### Persistencia — `lib/db/detected.ts`
- `recordDetected(row: NewDetectedRow): Promise<void>` (insert `onConflictDoNothing` por dedupKey).
- `listDetected(): Promise<DetectedRow[]>` (orden detectedAt desc).
- `getDetected(id): Promise<DetectedRow | undefined>`.
- `markDetected(id, status, opportunityId?): Promise<void>`.

### Endpoint de cron — `app/api/cron/radar/route.ts`
GET protegido por `CRON_SECRET` (fail-closed, igual que `/api/cron/gmail`). Llama
`discoverFromSecop` con el cliente real + `recordDetected`. Devuelve el resumen. `vercel.json`
suma `{ path: '/api/cron/radar', schedule: '0 */12 * * *' }` (cada 12h; §7 "fuentes con API: diario / fechas críticas 6-12h").

### Vista Radar — `/radar` + promover
- **`app/radar/page.tsx`** (Server Component, `force-dynamic`): lista `listDetected()` con filtro
  por estado.
- **Componentes**: fila con título/entidad/monto/deadline+días/link/temas + acciones
  **Promover** y **Descartar** (client → server actions + `router.refresh()`).
- **`promoteDetectedAction(id)`** (`'use server'`): arma un corpus con los campos de la detectada
  (title, funder, amount, deadline, url, themes); opcionalmente, si hay `FIRECRAWL_API_KEY` y
  `url`, scrapea la página para enriquecer; corre `analyzeOpportunity` (con match de financiador
  §11) → `addOpportunityAction` → `markDetected(id, 'promovida', analysis.opportunity_id)`.
  Si el análisis falla, NO cambia el estado (queda 'detectada').
- **`discardDetectedAction(id)`**: `markDetected(id, 'descartada')`.
- Link "Radar" en `components/nav-header.tsx`.

### Reuso
`analyzeOpportunity`+`generateWithOpenRouter`, match financiador (`listFunders`/`matchFunder`/
`formatFunderBlock`), `addOpportunityAction`, `createFirecrawlReader` (opcional), el patrón de
cron + `CRON_SECRET`. El radar no reescribe el análisis ni el pipeline.

## Manejo de errores (product-grade)
- API SECOP caída/rate-limited → el job responde error sin persistir basura; reintenta en la
  próxima corrida.
- Fila SECOP malformada → `normalizeSecopRow` devuelve null o el try/catch la saltea con nota;
  no frena el lote.
- Dedup por `dedupKey` (`onConflictDoNothing`) evita duplicados entre corridas.
- Promover: fallo de análisis/scrape → la detectada queda 'detectada' (reintentable), sin estado
  parcial.
- Cron protegido por `CRON_SECRET` fail-closed.

## Testing
- `lib/radar/anexo-d.test.ts` (puro): include/exclude por keywords.
- `lib/radar/secop-normalize.test.ts` (puro): fila cruda → DetectedOpportunity; fila sin campos
  clave → null.
- `lib/radar/discover.test.ts` (fakes): inserta nuevas, saltea ya-conocidas/duplicadas, fila mala
  no frena el lote, aplica el pre-filtro.
- `lib/db/detected.test.ts` (integración skipIf): recordDetected dedup + list + markDetected.
- `promoteDetectedAction` (integración, análisis/scrape inyectados o mockeados): crea oportunidad
  + marca promovida; fallo de análisis deja 'detectada'.
- Mantener verde la suite actual (142 tests) y typecheck limpio.

## Variables de entorno (nuevas)
- `DATOS_GOV_APP_TOKEN` (opcional; header `X-App-Token` de Socrata para mejores rate-limits).
- Reusa `CRON_SECRET` (conector Gmail). Sin credenciales obligatorias nuevas (la API es pública).

## Fuera de alcance (slices posteriores)
- Otras fuentes (EU Funding&Tenders, Grants.gov, UNGM, World Bank) — reusan `discover*`/normalize
  por fuente.
- Dedup cross-fuente a nivel oportunidad.
- Scheduling fino por tipo de fuente (§7 frecuencias); por ahora un cron cada 12h.
- Unificar detectadas dentro del pipeline `opportunities` (hoy tabla separada).

## Relación con el roadmap
Primer incremento del Módulo 1 §7. Establece el patrón discover→normalize→prefilter→dedup→
"Detectada"→promover, que las demás fuentes del §5/§16 reutilizan. Junto con el conector Gmail,
completa la **entrada automática** de oportunidades.
