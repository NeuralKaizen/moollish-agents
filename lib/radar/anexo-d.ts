// Palabras clave del Anexo D (familias de oportunidad de Moollish). En minúsculas.
export const INCLUDE_KEYWORDS = [
  'agricultura', 'agrícola', 'agro', 'agropecuari', 'rural', 'ganaderí', 'ganader',
  'clima', 'climátic', 'ambiental', 'ambiente', 'biodiversidad', 'restauración',
  'riego', 'seguridad alimentaria', 'monitoreo ambiental', 'reforestación',
  'tecnología agropecuaria', 'inteligencia artificial', 'satelital', 'precisión',
]
export const EXCLUDE_KEYWORDS = [
  'obra civil', 'pavimentación', 'pavimento', 'construcción de vía', 'andenes',
  'mobiliario', 'papelería', 'vigilancia', 'aseo y cafetería',
]

export function passesPrefilter(text: string): boolean {
  const t = text.toLowerCase()
  if (EXCLUDE_KEYWORDS.some((k) => t.includes(k))) return false
  return INCLUDE_KEYWORDS.some((k) => t.includes(k))
}

export function matchedKeywords(text: string): string[] {
  const t = text.toLowerCase()
  return INCLUDE_KEYWORDS.filter((k) => t.includes(k))
}
