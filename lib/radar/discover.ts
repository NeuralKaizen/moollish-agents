import { normalizeSecopRow } from './secop-normalize'
import { passesPrefilter, matchedKeywords } from './anexo-d'
import type { NewDetectedRow } from '@/lib/db/schema'

export interface DiscoverDeps {
  fetchRows: (q: string) => Promise<Record<string, unknown>[]>
  recordDetected: (row: NewDetectedRow) => Promise<void>
  queries?: string[]
}
export interface DiscoverSummary { found: number; inserted: number; skipped: number }

export async function discoverFromSecop(deps: DiscoverDeps): Promise<DiscoverSummary> {
  const queries = deps.queries ?? ['agricultura', 'ganadería', 'ambiental']
  const summary: DiscoverSummary = { found: 0, inserted: 0, skipped: 0 }
  const seen = new Set<string>()

  for (const q of queries) {
    let rows: Record<string, unknown>[]
    try { rows = await deps.fetchRows(q) } catch { continue }
    for (const raw of rows) {
      try {
        const d = normalizeSecopRow(raw)
        if (!d) { summary.skipped += 1; continue }
        summary.found += 1
        const hay = `${d.title} ${d.funder ?? ''}`
        if (!passesPrefilter(hay)) { summary.skipped += 1; continue }
        if (seen.has(d.dedupKey)) { summary.skipped += 1; continue }
        seen.add(d.dedupKey)
        await deps.recordDetected({
          id: d.dedupKey, source: d.source, sourceRef: d.sourceRef, title: d.title,
          funder: d.funder, amount: d.amount, currency: d.currency, deadline: d.deadline,
          url: d.url, themes: matchedKeywords(hay).join(', '), status: 'detectada',
        })
        summary.inserted += 1
      } catch { summary.skipped += 1 }
    }
  }
  return summary
}
