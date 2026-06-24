import '../lib/load-env'
import { createFirecrawlReader } from '../lib/ingest/firecrawl'
import { ingestFromUrl } from '../lib/ingest/ingest'

const url = process.argv[2]
if (!url) {
  console.error('Uso: pnpm ingest <url>')
  process.exit(1)
}

try {
  const result = await ingestFromUrl(url, {
    reader: createFirecrawlReader(),
    onProgress: (step) => console.error(`· ${step}`),
  })
  console.error(`\nFuentes (${result.sources.length}):`)
  for (const s of result.sources) {
    console.error(`  - [${s.type}] ${s.name} — ${s.chars} chars${s.url ? ` (${s.url})` : ''}`)
  }
  if (result.notes.length) {
    console.error('Notas:')
    for (const n of result.notes) console.error(`  ! ${n}`)
  }
  console.error(`Truncado: ${result.truncated}\n`)
  console.log(result.text)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n✗ No se pudo ingerir la URL: ${message}`)
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('  → Falta FIRECRAWL_API_KEY. Cárgala en .env.local.')
  }
  process.exit(1)
}
