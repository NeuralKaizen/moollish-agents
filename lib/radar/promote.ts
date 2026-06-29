import type { DetectedRow } from '@/lib/db/schema'

export function detectedToCorpus(d: DetectedRow): string {
  return [
    'Convocatoria detectada por el radar (SECOP / Datos Abiertos).',
    `Título: ${d.title}`,
    d.funder ? `Entidad: ${d.funder}` : null,
    d.amount ? `Valor: ${d.amount} ${d.currency ?? ''}`.trim() : null,
    d.deadline ? `Fecha límite: ${d.deadline}` : null,
    d.url ? `URL: ${d.url}` : null,
  ].filter(Boolean).join('\n')
}

export interface PromoteDeps {
  getDetected: (id: string) => Promise<DetectedRow | undefined>
  analyzeAndSave: (text: string) => Promise<string>
  markPromoted: (id: string, opportunityId: string) => Promise<void>
}

export async function promoteDetected(id: string, deps: PromoteDeps): Promise<'promoted' | 'not_found'> {
  const d = await deps.getDetected(id)
  if (!d) return 'not_found'
  const opportunityId = await deps.analyzeAndSave(detectedToCorpus(d))
  await deps.markPromoted(id, opportunityId)
  return 'promoted'
}
