import type { DetectedOpportunity } from './types'

// Los nombres de campo de SECOP II en datos.gov.co varían; probamos candidatos con fallback.
// Confirmar contra el dataset real en runtime y ajustar estas listas si hace falta.
function pick(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return null
}

export function normalizeSecopRow(row: Record<string, unknown>): DetectedOpportunity | null {
  const sourceRef = pick(row, ['id_del_proceso', 'referencia_del_proceso', 'id', 'numero_del_proceso'])
  const title = pick(row, ['descripci_n_del_procedimiento', 'nombre_del_procedimiento', 'objeto_del_contrato', 'objeto_a_contratar', 'objeto'])
  if (!sourceRef || !title) return null
  return {
    source: 'secop',
    sourceRef,
    dedupKey: `secop:${sourceRef}`,
    title,
    funder: pick(row, ['entidad', 'nombre_entidad', 'nombre_de_la_entidad']),
    amount: pick(row, ['precio_base', 'valor_total_adjudicacion', 'valor_del_contrato', 'cuant_a']),
    currency: 'COP',
    deadline: pick(row, ['fecha_de_recepcion_de', 'fecha_de_presentaci_n_de_oferta', 'fecha_de_publicacion_del']),
    url: pick(row, ['urlproceso', 'url_proceso', 'enlace', 'url']),
    themes: null,
  }
}
