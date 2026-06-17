import { DEFAULT_WEIGHTS } from './config'
import { CRITERION_KEYS, type CriterionKey } from './schema'

export type CriteriaScores = Record<CriterionKey, { score: number; justification: string }>
export type Semaforo = 'verde_alto' | 'verde_condicionado' | 'amarillo' | 'naranja' | 'rojo'
export type Recommendation = 'apply_now' | 'apply_with_partner' | 'observe' | 'request_info' | 'discard'

export function computeOverallScore(
  scores: CriteriaScores,
  weights: Record<CriterionKey, number> = DEFAULT_WEIGHTS,
): number {
  const total = CRITERION_KEYS.reduce((sum, k) => sum + scores[k].score * weights[k], 0)
  return Math.round(total)
}

export function scoreToSemaforo(score: number): Semaforo {
  if (score >= 85) return 'verde_alto'
  if (score >= 70) return 'verde_condicionado'
  if (score >= 55) return 'amarillo'
  if (score >= 40) return 'naranja'
  return 'rojo'
}

export function semaforoToRecommendation(s: Semaforo): Recommendation {
  switch (s) {
    case 'verde_alto': return 'apply_now'
    case 'verde_condicionado': return 'apply_with_partner'
    case 'amarillo': return 'observe'
    case 'naranja': return 'observe'
    case 'rojo': return 'discard'
  }
}

// Dato crítico ausente (§9/§10): sin deadline, sin monto no confirmado, o sin entidad elegible.
export function hasCriticalGap(a: {
  deadline: { date: string | null; verified?: boolean }
  funding_amount: { value: number | null; confirmed: boolean; currency?: string | null; estimated_cop?: number | null; estimated_usd?: number | null }
  eligibility: { eligible_entities: string[]; countries?: string[]; restrictions?: string[]; required_documents?: string[]; gaps?: string[] }
}): boolean {
  const noDeadline = a.deadline.date === null
  const noAmount = a.funding_amount.value === null && !a.funding_amount.confirmed
  const noEligibility = a.eligibility.eligible_entities.length === 0
  return noDeadline || noAmount || noEligibility
}

// La decisión sale del semáforo; si hay gap crítico se fuerza request_info, salvo que sea discard.
export function deriveRecommendation(semaforo: Semaforo, criticalGap: boolean): Recommendation {
  const base = semaforoToRecommendation(semaforo)
  if (base === 'discard') return 'discard'
  return criticalGap ? 'request_info' : base
}
