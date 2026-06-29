import { randomUUID } from 'node:crypto'
import {
  LlmAnalysisSchema,
  type LlmAnalysis,
  type OpportunityAnalysis,
  type CriterionKey,
} from './schema'
import { DEFAULT_WEIGHTS, DEFAULT_MODEL, WEIGHTS_VERSION } from './config'
import {
  computeOverallScore, scoreToSemaforo, deriveRecommendation, hasCriticalGap,
} from './scoring'
import { formatFunderBlock } from './funder-match'

export interface AnalyzeDeps {
  generate: (text: string, model: string, funderBlock: string) => Promise<LlmAnalysis>
  now?: () => string
  uuid?: () => string
}

export interface AnalyzeOpts {
  model?: string
  weights?: Record<CriterionKey, number>
  funderBlock?: string
}

// Días hasta la fecha límite. Cae a null si no hay fecha o si la fecha no es parseable
// (un modelo liviano podría devolver una fecha inválida; no queremos un NaN en la salida).
export function computeDaysRemaining(deadlineDate: string | null, nowIso: string): number | null {
  if (deadlineDate === null) return null
  const diffMs = new Date(deadlineDate).getTime() - new Date(nowIso).getTime()
  if (!Number.isFinite(diffMs)) return null
  return Math.ceil(diffMs / 86_400_000)
}

export async function analyzeOpportunity(
  text: string,
  deps: AnalyzeDeps,
  opts: AnalyzeOpts = {},
): Promise<OpportunityAnalysis> {
  const model = opts.model ?? DEFAULT_MODEL
  const weights = opts.weights ?? DEFAULT_WEIGHTS
  const funderBlock = opts.funderBlock ?? formatFunderBlock(null)

  const raw = await deps.generate(text, model, funderBlock)
  const parsed = LlmAnalysisSchema.parse(raw)

  const overall_score = computeOverallScore(parsed.criteria_scores, weights)
  const semaforo = scoreToSemaforo(overall_score)
  const recommendation = deriveRecommendation(semaforo, hasCriticalGap(parsed))

  const analyzedAt = (deps.now ?? (() => new Date().toISOString()))()
  const days_remaining = computeDaysRemaining(parsed.deadline.date, analyzedAt)

  return {
    ...parsed,
    deadline: { ...parsed.deadline, days_remaining },
    opportunity_id: (deps.uuid ?? randomUUID)(),
    overall_score,
    semaforo,
    recommendation,
    analysis_meta: {
      model,
      weights_version: WEIGHTS_VERSION,
      analyzed_at: analyzedAt,
    },
  }
}
