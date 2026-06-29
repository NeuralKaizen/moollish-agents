export interface FunderProfile {
  name: string
  aliases: string[]
  themes?: string | null
  geographies?: string | null
  typicalAmounts?: string | null
  frequency?: string | null
  eligibleEntity?: string | null
  requiredDocuments?: string | null
  winningExamples?: string | null
  contacts?: string | null
  language?: string | null
  evaluationCriteria?: string | null
  lessonsLearned?: string | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Match de palabra completa, case-insensitive: el alias debe estar rodeado de
// caracteres no alfanuméricos (o bordes del texto), para no matchear "CAR" en "descargar".
function aliasAppears(alias: string, text: string): boolean {
  const a = alias.trim()
  if (a.length === 0) return false
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(a)}([^\\p{L}\\p{N}]|$)`, 'iu')
  return re.test(text)
}

export function matchFunder(text: string, funders: FunderProfile[]): FunderProfile | null {
  for (const f of funders) {
    if (f.aliases.some((alias) => aliasAppears(alias, text))) return f
  }
  return null
}

const FIELD_LABELS: [keyof FunderProfile, string][] = [
  ['themes', 'Temas/prioridades'],
  ['geographies', 'Geografías'],
  ['typicalAmounts', 'Montos típicos'],
  ['frequency', 'Frecuencia'],
  ['eligibleEntity', 'Tipo de entidad elegible'],
  ['requiredDocuments', 'Documentos exigidos'],
  ['winningExamples', 'Ejemplos de proyectos ganadores'],
  ['contacts', 'Contactos'],
  ['language', 'Idioma'],
  ['evaluationCriteria', 'Criterios de evaluación'],
  ['lessonsLearned', 'Lecciones aprendidas'],
]

export function formatFunderBlock(funder: FunderProfile | null): string {
  if (!funder) {
    return 'PERFIL DEL FINANCIADOR: No se identificó un financiador con perfil cargado. Analizá con criterio general, sin inventar prioridades específicas de un financiador.'
  }
  const lines = [`PERFIL DEL FINANCIADOR — ${funder.name} (usar para interpretar prioridades y narrativa, no para inventar requisitos):`]
  for (const [key, label] of FIELD_LABELS) {
    const value = funder[key]
    if (typeof value === 'string' && value.trim().length > 0) lines.push(`- ${label}: ${value.trim()}`)
  }
  return lines.join('\n')
}
