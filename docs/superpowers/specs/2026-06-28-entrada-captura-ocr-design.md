# Entrada por captura (OCR/visión) — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-28.
> Construye sobre Fase A (persistencia real en Supabase, ya en master).
> Roadmap: `docs/agente1-estado-y-roadmap.md` (slice de Fase B / Módulo 2 §8).
> Mentalidad: PRODUCTO, no demo — robustez, persistencia de artefactos, auditoría.

## Objetivo

Permitir que Alex suba o **pegue una captura** (Instagram/LinkedIn/correo) de una
convocatoria y reciba el mismo análisis ejecutivo que hoy da para URL/PDF/texto. Es la
user story #1 del PDF (Anexo E) y el Módulo 2 §8 ("muchas oportunidades llegan por
captura"). El agente lee la imagen con visión, **sigue el enlace** que detecte para
enriquecer el análisis, y **persiste la captura** como evidencia auditable.

## Alcance

**Dentro:**
- Nuevo tipo de entrada `image` (PNG/JPG/WebP) en el analizador.
- Subida por **botón de archivo** y por **pegar del portapapeles** (Ctrl/Cmd+V) con preview.
- Paso de **visión** (OpenRouter, modelo multimodal) que transcribe el texto visible y
  detecta URL / cuenta / fuente probable.
- Si detecta una URL, **sigue el enlace** con la ingesta web actual (Firecrawl) y combina
  imagen + página en el corpus; si no hay URL o el scrape falla, degrada a análisis
  solo-imagen con una nota.
- Reusa `analyzeOpportunity` SIN cambios (scoring, semáforo, salida §Anexo A intactos).
- **Persistencia de la captura** en Supabase Storage (bucket privado) + nueva tabla
  `documents` (§15 Documento, acotada) ligada a la oportunidad.
- Mostrar la captura como evidencia en el detalle de la oportunidad (URL firmada).

**Fuera (fases posteriores):**
- Correo reenviado (parseo de remitente/adjuntos) y conectores SECOP/Gmail.
- OCR de múltiples imágenes en una sola oportunidad; drag&drop.
- Versionado/citas completas del Documento (§15) más allá de lo acotado abajo.
- Radar/descubrimiento.

## Arquitectura

### Flujo end-to-end
```
Alex sube/pega una captura
  → POST /api/analyze (multipart, imagen)
  → paso de VISIÓN: transcribe texto visible + detecta { detected_url, source_guess }
  → si detected_url → ingesta web actual (Firecrawl) → assembleCorpus([imagenTexto, página])
       (sin URL o scrape falla → solo imagenTexto + nota)
  → analyzeOpportunity(corpus)            ← sin cambios
  → al GUARDAR: imagen → Supabase Storage; se inserta el Documento ligado a la oportunidad
```
La pieza nueva vive en la costura `ingesta → análisis`; el analizador, el scoring y la
persistencia de oportunidades de Fase A no cambian.

### Visión — `lib/agent/llm.ts` + `lib/ingest/image.ts`
- `generateVisionExtract(bytes: Uint8Array, mime: string, model: string): Promise<VisionExtract>`
  en `lib/agent/llm.ts`. Usa `generateText` del AI SDK con un mensaje multimodal
  (text part + image part vía data URL) y `Output.object` con un Zod schema:
  ```ts
  VisionExtract = {
    text: string            // transcripción/lectura del contenido visible
    detected_url: string | null
    source_guess: string | null  // p. ej. "Instagram @fao" o "correo de FONTAGRO"
  }
  ```
  Modelo: `process.env.VISION_MODEL ?? DEFAULT_MODEL` (hoy `google/gemini-2.5-flash`, ya
  multimodal). El system prompt instruye: transcribir fielmente, NO inventar, marcar lo
  ilegible, y extraer el enlace si aparece.
- `ingestFromImage(bytes, mime, name, deps): Promise<IngestResult>` en `lib/ingest/image.ts`.
  `deps = { visionExtract, reader, onProgress }`. Corre la visión; arma `CorpusInput`
  con el texto de la imagen (`type: 'upload'`, name); si `detected_url`, scrapea con el
  `Reader` y agrega la página (`type: 'page'`) — reutilizando `selectDocumentLinks`/
  `assembleCorpus` como `ingestFromUrl`. Devuelve el mismo `IngestResult`
  (text, sources, truncated, notes) que las otras vías → el resto del pipeline es agnóstico.
  Notas: si no hay URL → nota "no detecté un enlace; análisis preliminar desde la imagen";
  si scrape falla → nota "detecté un enlace pero no pude abrirlo: <motivo>".

### Persistencia — Supabase Storage + tabla `documents`
- **Storage:** bucket privado `captures`. Subida server-side con la service role key
  (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en env). Path:
  `captures/<opportunity_id>/<timestamp>-<filename>`.
- **Tabla `documents`** (Drizzle, §15 Documento acotada por YAGNI):
  | columna | tipo |
  |---|---|
  | id | text PK (uuid o `<opp>-<ts>`) |
  | opportunity_id | text NOT NULL (FK lógica → opportunities.id) |
  | kind | text NOT NULL ('captura') |
  | storage_path | text NOT NULL |
  | ocr_text | text NOT NULL |
  | created_at | timestamptz NOT NULL default now() |
- **Cliente de Storage** en `lib/db/storage.ts`: `@supabase/supabase-js` con la service
  key, inicialización perezosa (mismo patrón que `lib/db/client.ts`, importar no debe
  lanzar; el throw por env ausente recién en primer uso).

### Secuencia de guardado (sin huérfanos)
La visión lee los **bytes en memoria**; la imagen NO se sube en `/api/analyze`. Recién al
guardar la oportunidad:
- Server action `addOpportunityWithCapture(analysis, image: { bytes, mime, name }, ocrText)`:
  1. sube la imagen a Storage → `storage_path` (si falla, aborta ANTES de tocar la DB).
  2. upsert de la oportunidad (reusa la lógica de `addOpportunityAction`: re-analizar
     conserva el progreso del pipeline).
  3. inserta el `documents` row con `storage_path` + `ocr_text`.
  4. `revalidatePath('/')`, `'/pipeline'`, `'/dashboard'`.
- El analizador (`app/page.tsx`), cuando la entrada fue una imagen, llama a esta acción en
  vez de `addOpportunityAction`; mantiene en estado los bytes + ocrText devueltos por el
  stream. (El stream `result` suma `ocr_text` y `source` de la imagen para que el cliente
  los tenga; los bytes ya los tiene el cliente desde el File.)

### UI — `components/opportunity-input.tsx`
- `accept` del input suma `image/png,image/jpeg,image/webp`; el botón pasa a
  "Subir PDF o captura".
- Handler `onPaste` (en el contenedor/textarea): si el portapapeles trae una imagen, la
  toma como archivo y la carga igual que un upload. Muestra **preview** (miniatura) en vez
  del `📄 nombre` cuando el archivo es imagen.
- `decideInput`/`AnalyzeInput` suman `{ kind: 'image'; file: File }`; `analyze-client.ts`
  la manda como multipart (igual que el PDF, distinguible por mime).

### Detalle de la oportunidad — `app/oportunidad/[id]/page.tsx`
- Carga los `documents` de la oportunidad (`kind:'captura'`) y, si hay, muestra la imagen
  como evidencia usando una **URL firmada** de Storage (expira; generada server-side).

## Modelo de datos del API/stream
`ProgressEvent` `result` suma campos opcionales para la vía imagen:
```ts
{ type: 'result'; analysis; ingestion; capture?: { ocr_text: string; source_guess: string | null } }
```
(El resto de vías no setean `capture`.)

## Manejo de errores (product-grade)
- Imagen ilegible/sin texto → la visión devuelve texto vacío → análisis falla con mensaje
  claro; nada se persiste.
- `detected_url` presente pero scrape falla → degrada a análisis solo-imagen + nota.
- Storage falla al guardar → se aborta antes de crear la oportunidad/documento (sin estado
  parcial).
- Tamaño de imagen > `MAX_UPLOAD_BYTES` → error claro antes de procesar.
- `/api/analyze`: distinguir imagen vs PDF por `file.type` (mime), no por extensión.

## Testing
- `lib/ingest/image.test.ts` (puro, mocks de `visionExtract` y `Reader`): caso con URL
  (combina imagen+página), sin URL (solo imagen + nota), scrape falla (degrada + nota),
  imagen sin texto (resultado vacío señalizado).
- `lib/ui/input-kind.test.ts`: `decideInput` enruta archivos de imagen a `kind:'image'`
  y PDFs a `kind:'pdf'`.
- `lib/db/documents.test.ts` (integración, `skipIf(!DATABASE_URL)`): insertar documento
  ligado a una oportunidad y leerlo.
- `addOpportunityWithCapture` (integración): sube a Storage (bucket de test o mock) + crea
  oportunidad + documento; verifica orden y que un fallo de Storage no deja oportunidad.
- Se mantienen los 116+ tests actuales verdes.

## Variables de entorno (nuevas)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (para Storage).
- `VISION_MODEL` (opcional; default `DEFAULT_MODEL`).

## Relación con el roadmap
Primer incremento de la Fase B (Módulo 2 §8) y primer uso de **Supabase Storage** + del
modelo **Documento (§15)** — base para correo reenviado y para citar evidencia en fases
siguientes.
