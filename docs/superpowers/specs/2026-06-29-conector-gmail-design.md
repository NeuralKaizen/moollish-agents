# Conector de correo reenviado (Gmail, §8) — Agente 1

> Diseño validado en brainstorming. Fecha: 2026-06-29.
> Construye sobre Fase A (persistencia), §11 (match de financiador) y la ingesta existente.
> Roadmap: Módulo 2 §8 ("correo reenviado") + §16 (integración Gmail). Primer job programado del sistema.
> Mentalidad: PRODUCTO, no demo (memoria `building-product-not-demo`).
> Credenciales: anotadas en `docs/apis-y-credenciales.md`.

## Objetivo

Que las convocatorias que llegan por **email** entren al Agente 1 sin trabajo manual: Alex
reenvía el correo a una **casilla dedicada** y el agente, periódicamente, lo lee, extrae su
contenido y adjuntos, lo analiza con el pipeline existente y lo deja en el pipeline de
oportunidades. Es el canal "correo reenviado" del §8 y la integración Gmail del §16, y
establece el patrón de **jobs programados** reutilizable para el radar (§7).

## Decisiones de alcance (brainstorming)

- **Auth: Gmail API + OAuth**, scope **`gmail.readonly`** (solo lectura, no modifica la casilla).
- **Trigger: Vercel Cron + polling** (no push/Pub/Sub).
- **Dedup: tabla `processed_emails`** por `message_id` (read-only; no marca Gmail).
- **Un correo = una oportunidad**; adjuntos PDF se extraen, otros tipos se omiten; **el binario
  del adjunto NO se retiene** (storage diferido, consistente con la captura).
- **Sin envíos automáticos** (§22): el agente solo lee y registra.

## Arquitectura

### Flujo
```
Vercel Cron (~cada 30 min) → GET /api/cron/gmail  (Authorization: Bearer CRON_SECRET)
  → GmailReader (googleapis, OAuth2 refresh token, gmail.readonly) lista mensajes de la casilla
  → filtra los message_id ya presentes en `processed_emails`
  → por cada correo nuevo:
       parse → { from, subject, body, attachments PDF→texto }
       assembleCorpus(cuerpo + textos de PDF)
       analyzeOpportunity(corpus, { generate }, { funderBlock })   ← match financiador (§11)
       addOpportunityAction(analysis)                              ← queda en el pipeline
       insert processed_emails(message_id, status:'ok', opportunity_id)
     (si algo falla: insert processed_emails(message_id, status:'failed', error) y se sigue)
```

### Componentes y archivos
- **`lib/gmail/client.ts`** — wrapper de `googleapis`. Crea un OAuth2 client con
  `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN`, scope
  `gmail.readonly`. Inicialización **perezosa** (importar no lanza; el throw por env ausente
  recién en el primer uso, como `lib/db/client.ts`). Expone la interfaz:
  ```ts
  interface GmailMessage { id: string; from: string; subject: string; body: string;
    attachments: { filename: string; mimeType: string; data: Uint8Array }[] }
  interface GmailReader {
    listMessageIds(opts?: { max?: number }): Promise<string[]>
    getMessage(id: string): Promise<GmailMessage>
  }
  export function createGmailReader(): GmailReader
  ```
  (El reader es **inyectable** en el job → testeable con un mailbox falso.)
- **`lib/gmail/parse.ts`** (puro) — `messageToCorpusInputs(msg, extractPdf)` →
  `Promise<{ inputs: CorpusInput[]; notes: string[] }>`: arma un `CorpusInput` con el cuerpo
  (`from`/`subject` en el encabezado) y un `CorpusInput` por cada adjunto **PDF** (texto vía el
  `extractPdf` inyectado, reusando `lib/ingest/pdf`); adjuntos no-PDF → nota y se omiten.
  Testeable sin red ni LLM.
- **`lib/db/schema.ts`** — tabla `processed_emails`: `messageId` text PK, `processedAt`
  timestamptz default now, `status` text ('ok'|'failed'), `error` text null, `opportunityId`
  text null. Tipos `ProcessedEmailRow`/`NewProcessedEmailRow`.
- **`lib/db/processed-emails.ts`** — `listProcessedIds(): Promise<Set<string>>` (o array),
  `recordProcessed(row): Promise<void>`.
- **`app/api/cron/gmail/route.ts`** — el job (runtime nodejs). Valida el header
  `Authorization: Bearer ${process.env.CRON_SECRET}` (401 si no coincide); orquesta:
  listar → filtrar contra `processed_emails` → por cada uno parse+ingest+analyze+save+record,
  con try/catch por correo. Responde un resumen `{ processed, skipped, failed }`.
- **`vercel.json`** — `crons: [{ path: '/api/cron/gmail', schedule: '*/30 * * * *' }]`
  (intervalo ajustable).

### Reuso
- `assembleCorpus` (`lib/ingest/corpus`), `extractPdfText` (`lib/ingest/pdf`),
  `analyzeOpportunity` (`lib/agent/analyze`), `generateWithOpenRouter` (`lib/agent/llm`),
  match de financiador (`listFunders`/`matchFunder`/`formatFunderBlock`),
  `addOpportunityAction` (`lib/db/actions`). El conector no reescribe nada del análisis.

## Seguridad y gobernanza (§22)
- Scope **read-only**: el agente nunca modifica ni borra correos.
- Endpoint de cron protegido por `CRON_SECRET` (rechaza requests sin el bearer correcto).
- Sin envíos automáticos: solo lectura + registro en el pipeline.
- Secrets solo en env de Vercel / `.env.local`; nunca en el repo.

## Manejo de errores (product-grade)
- Falla de Gmail al listar → el job responde error pero no rompe nada persistido.
- Falla en un correo puntual (parse/análisis) → se registra `processed_emails(status:'failed', error)`
  y se continúa con los demás; al quedar registrado, **no se reintenta en loop**.
- Correo sin texto útil (ni cuerpo ni PDF legible) → se registra ok con una nota; no se crea
  una oportunidad vacía (si el corpus queda vacío, se omite el análisis y se anota).
- Adjuntos no-PDF → se omiten con nota.

## Testing
- `lib/gmail/parse.test.ts` (puro, `extractPdf` mockeado): cuerpo→corpus con from/subject;
  adjunto PDF→texto en el corpus; adjunto no-PDF omitido + nota; correo vacío → inputs vacíos.
- `lib/db/processed-emails.test.ts` (integración, `skipIf(!DATABASE_URL)`): record + list dedup.
- Job (`GmailReader` mockeado + `addOpportunityAction`/análisis inyectables o mockeados):
  procesa nuevos, saltea ya-procesados, registra `failed` sin frenar el lote, valida `CRON_SECRET`.
- `lib/gmail/client.ts`: solo se valida que importar no lanza (lazy) — el llamado real a Gmail
  se verifica en runtime/staging, no en tests.
- Mantener verde la suite actual (134 tests) y typecheck limpio.

## Variables de entorno (nuevas)
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (Gmail API).
- `CRON_SECRET` (interno; protege el endpoint).
- (Dependencia npm nueva: `googleapis`.)

## Fuera de alcance (slices posteriores)
- Gmail push/Pub/Sub (tiempo real); marcar leído / labels.
- Retención de adjuntos en storage (cuando se decida proveedor).
- Dedup a nivel **oportunidad** (dos correos de la misma convocatoria) → radar §7 / Anexo D.
- Parseo de remitente como entidad/contacto persistido (§15 Contactos).
- Otros canales (WhatsApp/Instagram) — §16.

## Relación con el roadmap
Completa el canal "correo reenviado" del Módulo 2 §8 e inaugura los **jobs programados**
(Vercel Cron → endpoint protegido → procesar → registrar) que el radar §7 reutiliza para
buscar en fuentes (SECOP, EU, Grants.gov, etc.).
