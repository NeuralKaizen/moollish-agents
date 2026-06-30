export interface AllyProfile {
  name: string
  type: string
  country?: string | null
  capabilities?: string | null
  recommendedRole?: string | null
  reputation: 'alto' | 'medio' | 'bajo'
}

export interface PartnerGap {
  ally_type: string
  suggested_role: string
  priority: 'bajo' | 'medio' | 'alto'
  reason: string
}

export interface MatchContext {
  themes: string
  country: string | null
}

export interface AllyCandidate {
  ally: AllyProfile
  score: number
}

export interface GapSuggestion {
  gap: PartnerGap
  candidates: AllyCandidate[]
}

const REPUTATION_SCORE: Record<AllyProfile['reputation'], number> = { alto: 10, medio: 5, bajo: 0 }

// Tokeniza a palabras significativas (>=3 caracteres) en minúsculas, sin acentos para
// que "alcaldía"/"alcaldia" matcheen. Captura siglas como ONG (3 letras).
function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set()
  const norm = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return new Set(norm.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3))
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

// 0-100: tipo (0|50) + complementariedad (0..30) + geografía (0|10) + reputación (0|5|10).
export function scoreAlly(gap: PartnerGap, ally: AllyProfile, context: MatchContext): number {
  const typeScore = overlapCount(tokenize(gap.ally_type), tokenize(ally.type)) > 0 ? 50 : 0
  const capScore = Math.min(30, overlapCount(tokenize(ally.capabilities), tokenize(context.themes)) * 10)
  const geoScore =
    ally.country && context.country &&
    ally.country.trim().toLowerCase() === context.country.trim().toLowerCase()
      ? 10
      : 0
  const repScore = REPUTATION_SCORE[ally.reputation]
  return typeScore + capScore + geoScore + repScore
}

export function suggestAllies(
  partnersNeeded: PartnerGap[],
  allies: AllyProfile[],
  context: MatchContext,
  opts?: { top?: number },
): GapSuggestion[] {
  const top = opts?.top ?? 3
  return partnersNeeded.map((gap) => {
    const candidates = allies
      .map((ally) => ({ ally, score: scoreAlly(gap, ally, context) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
    return { gap, candidates }
  })
}
