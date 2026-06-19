# Agente 1 — Capa de Ingestión (URL · PDF · texto) · Diseño

**Fecha:** 2026-06-18
**Producto:** Moollish Funding Officer AI (Agente 1 — Chief Funding, Partnerships & Strategic Opportunities Officer AI)
**Alcance de este spec:** SOLO la capa de **ingestión** que alimenta el núcleo de análisis ya existente. Sin RAG, sin persistencia/CRM, sin conectores de correo/redes.
**Fuente de verdad funcional:** `agents-profiles/Especificacion_Profesional_Agente_1_Moollish_Funding_Officer_AI (1).pdf` — §4 (Ingestión multicanal), §8 (Módulo 2: análisis de oportunidades enviadas por Alex), §16 (Integraciones), §18/§22 (guardrails), Anexo F (backlog P0).
**Depende de:** spec `2026-06-17-agente1-nucleo-analisis-design.md` (núcleo de análisis, ya implementado en `lib/agent/`).

---

## 1. Objetivo

Hoy el agente sólo analiza **texto pegado**. En la demo dijo "no hay fechas disponibles" porque el cronograma estaba en la web/PDF de la convocatoria y el agente **nunca lo leyó** — la regla §18 ("no inventar") funcionó, pero perdimos aura porque el dato *sí existía*.

Este spec construye la **capa de ingestión** (§4 + Módulo 2 §8): que Alex pegue una **URL**, suba un **PDF** o pegue **texto**, y el agente **lea la página, descargue los documentos enlazados (pliego, términos de referencia, cronograma, anexos), extraiga su contenido** y se lo entregue al núcleo. El núcleo no cambia su lógica: ahora va a tener el dato real delante.

El valor: convertir el caso de la demo en un éxito — el agente realmente navega, baja los archivos y extrae el cronograma/fechas/requisitos.

---

## 2. Alcance

### Dentro (esta fase)
- **Entrada multicanal P0** (Anexo F): pegar **URL**, pegar **texto** (lo actual, intacto), **subir PDF**.
- Lectura de páginas web que **renderizan JavaScript** (SPAs como SECOP II) vía **Firecrawl**.
- **Detección y descarga** de documentos enlazados relevantes (PDF/doc/docx; pliego, términos, anexo, cronograma, convocatoria).
- **Extracción de texto** de documentos remotos (Firecrawl) y de PDFs **subidos** (local, `unpdf`).
- **Ensamblado** de un corpus normalizado con encabezado por fuente y **presupuesto de caracteres** con truncación **honesta** (nunca silenciosa).
- **Transparencia de ingestión** en la UI: qué página se leyó y qué documentos se descargaron.
- Guardrails §18/§22: degradación honesta si un sitio no se puede leer; el agente lo dice y pide el PDF/texto, sin inventar.
- Tests unitarios de la lógica pura + cliente mockeado + script de validación en vivo contra los casos reales del §20.

### Fuera (fases posteriores)
- RAG sobre repositorio institucional (§4, §11 como base viva).
- Persistencia en Neon Postgres, CRM y ciclo de vida (§14).
- Conectores de correo / WhatsApp / Instagram / SECOP API / Grants.gov (§16, V1+).
- **Búsqueda web autónoma** para descubrir la página oficial o completar datos faltantes.
- **Navegador headless propio** (Playwright/Chromium) — usamos servicio externo en su lugar.
- OCR de capturas de Instagram/LinkedIn (Módulo 2, vía imagen) — esta fase cubre URL/PDF/texto.

---

## 3. Arquitectura

La capa de ingestión vive en `lib/ingest/` y se monta **delante** del núcleo `lib/agent/`. El flujo de producción queda `entrada → ingest → analyzeOpportunity → respuesta`. El núcleo conserva su contrato actual (`analyzeOpportunity(text, deps, opts)`).

```
lib/ingest/
  firecrawl.ts       # Cliente fino de Firecrawl detrás de la interfaz Reader.
  document-links.ts  # Heurística pura: de los links de una página, elige documentos a bajar.
  pdf.ts             # Extracción de texto de un PDF SUBIDO (local, unpdf).
  ingest.ts          # Orquesta: ingestFromUrl / ingestFromPdf / ingestFromText -> IngestResult.
  config.ts          # Caps y timeouts (env): máx docs, máx chars/doc, presupuesto total.
scripts/
  ingest.ts          # Runner CLI: pnpm ingest <url> -> imprime IngestResult (validación en vivo §20).
app/api/analyze/
  route.ts           # Orquesta ingest -> analyze. Acepta {url} | {text} | multipart PDF.
components/
  opportunity-input.tsx   # Campo inteligente: URL vs texto + botón "Subir PDF".
  analysis/ingestion-summary.tsx  # Bloque nuevo: qué leyó y qué descargó el agente.
```

### Interfaz `Reader` (abstracción de proveedor)
```ts
interface Reader {
  scrapePage(url: string): Promise<{ markdown: string; links: string[]; title: string | null }>
  scrapeDoc(url: string): Promise<{ text: string }>
}
```
Firecrawl implementa `Reader`. Si en el futuro cambiamos de proveedor, sólo se reescribe `firecrawl.ts`. El resto de la capa depende de `Reader`, no de Firecrawl.

---

## 4. Contrato de salida — `IngestResult`

```ts
interface IngestSource {
  type: 'page' | 'pdf' | 'upload'
  name: string          // título de página o nombre de archivo
  url: string | null    // null para PDF subido
  chars: number         // caracteres extraídos de esta fuente
}

interface IngestResult {
  text: string            // corpus ensamblado que recibe el núcleo
  sources: IngestSource[] // todo lo que se leyó/descargó (para la UI de transparencia)
  truncated: boolean      // true si se recortó por presupuesto de caracteres
  notes: string[]         // mensajes honestos: "No pude leer X (bloqueado), subí el PDF"
}
```

El corpus `text` ensambla cada fuente con un encabezado claro para que el núcleo (y sus `evidence`) puedan referenciar el origen:

```
### Página: <título>  (<url>)
<markdown de la página>

### Documento: cronograma.pdf  (<url>)
<texto del PDF>
```

---

## 5. Flujos

### 5.1 URL (caso de la demo)
1. `reader.scrapePage(url)` → markdown + links + título. (Firecrawl renderiza JS.)
2. `selectDocumentLinks(links, { pageUrl })` → lista de URLs de documentos a bajar:
   - extensiones `.pdf`, `.doc`, `.docx`;
   - o texto del enlace que matchee *pliego, términos|terminos, anexo, cronograma, convocatoria, bases, TdR*;
   - **prioriza mismo dominio**, dedup, cap `INGEST_MAX_DOCS` (default 5).
3. Por cada doc: `reader.scrapeDoc(docUrl)` → texto. Errores por-doc se registran en `notes`, no abortan el resto.
4. `assembleCorpus(page, docs, { maxCharsPerDoc, totalBudget })` → `text` con encabezados + `truncated`.
5. `IngestResult` listo para el núcleo.

### 5.2 PDF subido
1. Extracción local con `unpdf` (`pdf.ts`) — no requiere URL ni servicio externo.
2. Una sola fuente `type: 'upload'`. Mismo ensamblado/presupuesto.

### 5.3 Texto pegado
1. Passthrough: `IngestResult` con una fuente `type: 'page'` sintética (name: "Texto pegado", url: null). Mantiene el camino actual intacto.

---

## 6. API — `/api/analyze`

Orquesta **ingest → analyze** en una sola request (con estado de carga en la UI).

- **Entrada:**
  - `{ url: string }` → `ingestFromUrl`
  - `{ text: string }` → `ingestFromText` (comportamiento actual preservado)
  - `multipart/form-data` con archivo PDF → `ingestFromPdf`
- **Salida:** el `OpportunityAnalysis` de siempre **+** un bloque `ingestion: { sources, truncated, notes }`.
- `maxDuration` se sube (scrapear varios PDFs + LLM puede superar 60s). Timeouts por llamada a Firecrawl y caps evitan cuelgues.
- Validación de entrada: URL bien formada; tamaño máx de PDF subido; mensajes de error claros en español.

El núcleo recibe `ingestResult.text`. Opcionalmente se le pasa `url` como hint para `source.url`.

---

## 7. UI

### 7.1 `opportunity-input.tsx` — campo inteligente
- Detecta si lo pegado es **URL** (regex/`URL()`) vs **texto**.
- Botón **"Subir PDF"** (input file, acepta `application/pdf`).
- Estado `loading` con copy honesto: "Leyendo la página y descargando documentos…".
- Conserva el estado colapsado / re-analizar actual.

### 7.2 `analysis/ingestion-summary.tsx` — transparencia (nuevo)
Renderiza `ingestion.sources`:
> **Leí:** Convocatoria FONTAGRO 2026 — *fontagro.org/...*
> **Descargué 2 documentos:** `bases.pdf` · `cronograma.pdf`
> ⚠️ *(si `truncated`)* Contenido extenso: analicé los primeros N caracteres por documento.
> *(si `notes`)* No pude leer `X` — subí el PDF o pegá el texto.

Esto es central para **recuperar aura**: muestra que el agente fue, navegó y bajó los archivos.

---

## 8. Configuración / env

| Var | Default | Uso |
|---|---|---|
| `FIRECRAWL_API_KEY` | — | Autenticación Firecrawl. Sin ella, modo URL deshabilitado con mensaje claro. |
| `INGEST_MAX_DOCS` | 5 | Máx documentos a descargar por página. |
| `INGEST_MAX_CHARS_PER_DOC` | 40000 | Recorte por documento. |
| `INGEST_TOTAL_BUDGET` | 120000 | Presupuesto total de caracteres del corpus. |
| `FIRECRAWL_TIMEOUT_MS` | 30000 | Timeout por llamada. |

Caps default conservadores; ajustables sin tocar código. Toda truncación se refleja en `truncated`/`notes`.

---

## 9. Guardrails (§18 / §22)

- **No inventar:** la ingestión sólo agrega texto real de fuentes; el núcleo sigue marcando faltantes.
- **Degradación honesta:** sitio bloqueado / sin contenido / robots → `notes` lo explica y pide PDF/texto. No se fabrica contenido.
- **Truncación nunca silenciosa:** `truncated` + `notes` siempre visibles en UI.
- **Trazabilidad:** cada fuente queda etiquetada en el corpus y listada en `sources`, así `evidence` del núcleo puede citar el origen.
- **Respeto de términos:** sólo se descargan documentos enlazados desde la página dada por el usuario (acción autorizada por Alex), con cap de cantidad.

---

## 10. Testing

- **Unit puro (sin red):**
  - `document-links`: dado un set de links → documentos esperados (extensiones, keywords, mismo dominio, dedup, cap).
  - `assembleCorpus`: encabezados correctos, presupuesto respetado, `truncated` correcto.
  - detección URL vs texto en el input.
- **Cliente Firecrawl:** `fetch` mockeado → mapeo de respuesta, manejo de error/timeout, error por-doc no aborta.
- **CLI de validación en vivo:** `pnpm ingest <url>` contra los casos reales del §20 (SECOP CAR, FAO AgrInno, FONTAGRO, Minciencias 966). Gated por `FIRECRAWL_API_KEY`; **fuera de CI**.
- **Aceptación (Anexo F / §21):** dado el URL de una convocatoria real con cronograma, el análisis final trae `deadline.date` poblado y `evidence` que lo respalda.

---

## 11. Criterios de aceptación

1. Pegar la **URL** de una convocatoria con cronograma en su PDF → el análisis trae fecha límite y la cita correspondiente (resuelve la demo).
2. **Subir un PDF** → análisis completo a partir de su texto.
3. **Pegar texto** → comportamiento idéntico al actual.
4. El bloque de **ingestión** muestra página leída + documentos descargados.
5. Sitio ilegible → mensaje honesto pidiendo el documento, sin datos inventados.
6. Tests unitarios en verde; `pnpm ingest <url>` extrae texto real de al menos un caso del §20.

---

## 12. Dependencias nuevas

- `firecrawl` (o `fetch` directo a su REST API) — lectura web con render JS + parseo de PDFs remotos.
- `unpdf` — extracción de texto de PDFs subidos (serverless-friendly).
