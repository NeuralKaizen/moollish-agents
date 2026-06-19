// Caps de ingestión, ajustables por env sin tocar código. Defaults conservadores.
export const INGEST_MAX_DOCS = Number(process.env.INGEST_MAX_DOCS ?? 5)
export const INGEST_MAX_CHARS_PER_DOC = Number(process.env.INGEST_MAX_CHARS_PER_DOC ?? 40_000)
export const INGEST_TOTAL_BUDGET = Number(process.env.INGEST_TOTAL_BUDGET ?? 120_000)
export const FIRECRAWL_TIMEOUT_MS = Number(process.env.FIRECRAWL_TIMEOUT_MS ?? 30_000)

// Límite de body de una Vercel Function: 4.5 MB.
export const MAX_UPLOAD_BYTES = 4_500_000
