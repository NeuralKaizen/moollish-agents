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

export interface AnalyzeDeps {
  generate: (text: string, model: string) => Promise<LlmAnalysis>
  now?: () => string
  uuid?: () => string
}

export interface AnalyzeOpts {
  model?: string
  weights?: Record<CriterionKey, number>
}

export async function analyzeOpportunity(
  text: string,
  deps: AnalyzeDeps,
  opts: AnalyzeOpts = {},
): Promise<OpportunityAnalysis> {
  const model = opts.model ?? DEFAULT_MODEL
  const weights = opts.weights ?? DEFAULT_WEIGHTS

  const raw = await deps.generate(text, model)
  const parsed = LlmAnalysisSchema.parse(raw)

  const overall_score = computeOverallScore(parsed.criteria_scores, weights)
  const semaforo = scoreToSemaforo(overall_score)
  const recommendation = deriveRecommendation(semaforo, hasCriticalGap(parsed))

  return {
    ...parsed,
    opportunity_id: (deps.uuid ?? randomUUID)(),
    overall_score,
    semaforo,
    recommendation,
    analysis_meta: {
      model,
      weights_version: WEIGHTS_VERSION,
      analyzed_at: (deps.now ?? (() => new Date().toISOString()))(),
    },
  }
}
