import { z } from 'zod'

export const CRITERION_KEYS = [
  'alineacion_estrategica',
  'elegibilidad',
  'monto_retorno',
  'probabilidad_exito',
  'complejidad_documental',
  'tiempo_disponible',
  'impacto_estrategico',
  'riesgo_ejecucion',
] as const
export type CriterionKey = (typeof CRITERION_KEYS)[number]

export const LevelEnum = z.enum(['bajo', 'medio', 'alto'])
export const SemaforoEnum = z.enum([
  'verde_alto', 'verde_condicionado', 'amarillo', 'naranja', 'rojo',
])
export const RecommendationEnum = z.enum([
  'apply_now', 'apply_with_partner', 'observe', 'request_info', 'discard',
])
export const VehicleEnum = z.enum([
  'moollish', 'moollish_sat2farm', 'foundation_nova', 'alianza',
])
export const CategoryEnum = z.enum([
  'financiacion_no_reembolsable', 'contratacion_publica',
  'cooperacion_alianzas', 'programas_territoriales', 'inversion_impacto',
])

const CriterionScore = z.object({
  score: z.number().min(0).max(100),
  justification: z.string(),
})

const CriteriaScores = z.object({
  alineacion_estrategica: CriterionScore,
  elegibilidad: CriterionScore,
  monto_retorno: CriterionScore,
  probabilidad_exito: CriterionScore,
  complejidad_documental: CriterionScore,
  tiempo_disponible: CriterionScore,
  impacto_estrategico: CriterionScore,
  riesgo_ejecucion: CriterionScore,
})

// Lo que pedimos al LLM (NO incluye overall_score, semaforo ni recommendation: los calcula el código).
export const LlmAnalysisSchema = z.object({
  source: z.object({
    name: z.string(),
    url: z.string().nullable(),
    channel: z.string(),
    confidence_level: z.enum(['alta', 'media', 'baja']),
  }),
  classification: z.object({
    category: CategoryEnum,
    subcategory: z.string().nullable(),
    instrument: z.string().nullable(),
    themes: z.array(z.string()),
    geography: z.array(z.string()),
  }),
  deadline: z.object({
    date: z.string().nullable(), // ISO 8601 o null
    verified: z.boolean(),
  }),
  funding_amount: z.object({
    value: z.number().nullable(),
    currency: z.string().nullable(),
    confirmed: z.boolean(),
    estimated_cop: z.number().nullable(),
    estimated_usd: z.number().nullable(),
  }),
  eligibility: z.object({
    eligible_entities: z.array(z.string()),
    countries: z.array(z.string()),
    restrictions: z.array(z.string()),
    required_documents: z.array(z.string()),
    gaps: z.array(z.string()),
  }),
  recommended_vehicle: VehicleEnum,
  vehicle_rationale: z.string(),
  criteria_scores: CriteriaScores,
  institutional_fit: z.object({
    moollish: z.number().min(0).max(100),
    sat2farm: z.number().min(0).max(100),
    foundation_nova: z.number().min(0).max(100),
    alliance: z.number().min(0).max(100),
  }),
  effort: LevelEnum,
  risk: LevelEnum,
  main_gap: z.string(),
  partners_needed: z.array(z.object({
    gap: z.string(),
    ally_type: z.string(),
    suggested_role: z.string(),
    priority: LevelEnum,
    reason: z.string(),
  })),
  risks: z.array(z.object({
    type: z.enum(['legal', 'reputacional', 'financiero', 'tecnico', 'tiempo', 'ejecucion']),
    description: z.string(),
    severity: LevelEnum,
  })),
  next_actions: z.array(z.object({
    action: z.string(),
    responsible: z.string(),
    due_date: z.string().nullable(),
    dependency: z.string().nullable(),
  })),
  evidence: z.array(z.object({
    claim: z.string(),
    quote: z.string(),
    field: z.string(),
  })),
  missing_data: z.array(z.string()),
  draft_outputs: z.object({
    executive_summary: z.string(),
    narrative_angle: z.string(),
  }),
})
export type LlmAnalysis = z.infer<typeof LlmAnalysisSchema>

// Salida final del agente: lo del LLM + campos calculados por código + metadata de auditoría.
export const OpportunityAnalysisSchema = LlmAnalysisSchema.extend({
  opportunity_id: z.string(),
  overall_score: z.number().min(0).max(100),
  semaforo: SemaforoEnum,
  recommendation: RecommendationEnum,
  analysis_meta: z.object({
    model: z.string(),
    weights_version: z.string(),
    analyzed_at: z.string(),
  }),
})
export type OpportunityAnalysis = z.infer<typeof OpportunityAnalysisSchema>
