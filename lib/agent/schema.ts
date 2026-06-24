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
  score: z.number().min(0).max(100).describe('0-100 de conveniencia: 100 = lo más favorable para aplicar.'),
  justification: z.string().describe('Por qué ese score, basado en el texto de la convocatoria.'),
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
    name: z.string().describe('Nombre del financiador o de la convocatoria.'),
    url: z.string().nullable().describe('URL de la fuente, o null si no se conoce.'),
    channel: z.string().describe('Canal de origen: web, pdf, correo, instagram, whatsapp, linkedin, manual…'),
    confidence_level: z.enum(['alta', 'media', 'baja']).describe('Confiabilidad de la fuente.'),
  }),
  classification: z.object({
    category: CategoryEnum.describe('Categoría de la taxonomía §6.'),
    subcategory: z.string().nullable().describe('Subcategoría libre (ej. grant, licitación, consorcio), o null.'),
    instrument: z.string().nullable().describe('Instrumento financiero concreto, o null.'),
    themes: z.array(z.string()).describe('Temas (ej. agtech, clima, seguridad alimentaria).'),
    geography: z.array(z.string()).describe('Países o regiones de aplicación.'),
  }),
  deadline: z.object({
    date: z.string().nullable().describe('Fecha límite en ISO 8601, o null si no está en la fuente.'),
    verified: z.boolean().describe('true solo si la fuente afirma explícitamente la fecha.'),
  }),
  funding_amount: z.object({
    value: z.number().nullable().describe('Monto en la moneda original, o null si no se indica.'),
    currency: z.string().nullable().describe('Moneda original (ISO ej. USD, EUR, COP), o null.'),
    confirmed: z.boolean().describe('true solo si el monto está afirmado en la fuente, no estimado.'),
    estimated_cop: z.number().nullable().describe('Estimación en COP (nunca confirmada), o null.'),
    estimated_usd: z.number().nullable().describe('Estimación en USD (nunca confirmada), o null.'),
    range_min: z.number().nullable().describe('Mínimo del rango de financiación, o null.'),
    range_max: z.number().nullable().describe('Máximo del rango de financiación, o null.'),
  }),
  eligibility: z.object({
    eligible_entities: z.array(z.string()).describe('Tipos de entidad que pueden aplicar.'),
    countries: z.array(z.string()).describe('Países elegibles.'),
    restrictions: z.array(z.string()).describe('Restricciones de país, tipo de entidad o experiencia.'),
    required_documents: z.array(z.string()).describe('Documentos exigidos (estados financieros, cartas, certificaciones…).'),
    gaps: z.array(z.string()).describe('Brechas de elegibilidad de Moollish frente a los requisitos.'),
  }),
  recommended_vehicle: VehicleEnum.describe('Vehículo líder recomendado para aplicar.'),
  vehicle_rationale: z.string().describe('Por qué ese vehículo (interpretación estratégica).'),
  criteria_scores: CriteriaScores,
  institutional_fit: z.object({
    moollish: z.number().min(0).max(100).describe('Encaje con el negocio productivo-tecnológico.'),
    sat2farm: z.number().min(0).max(100).describe('Encaje con monitoreo satelital, carbono, riesgo climático.'),
    foundation_nova: z.number().min(0).max(100).describe('Encaje con enfoque social/comunitario/inclusión.'),
    alliance: z.number().min(0).max(100).describe('Conveniencia de aplicar en alianza entre vehículos.'),
  }),
  effort: LevelEnum.describe('Esfuerzo de formulación: bajo/medio/alto.'),
  risk: LevelEnum.describe('Riesgo global: bajo/medio/alto.'),
  main_gap: z.string().describe('La brecha principal a resolver para poder aplicar.'),
  partners_needed: z.array(z.object({
    gap: z.string().describe('Brecha que cubre el aliado.'),
    ally_type: z.string().describe('Tipo de aliado (universidad, ONG, alcaldía, socio internacional…).'),
    suggested_role: z.string().describe('Rol sugerido del aliado en la propuesta.'),
    priority: LevelEnum.describe('Prioridad de conseguir este aliado.'),
    reason: z.string().describe('Por qué se necesita.'),
  })).describe('Aliados requeridos (§12). Vacío si no se necesitan.'),
  risks: z.array(z.object({
    type: z.enum(['legal', 'reputacional', 'financiero', 'tecnico', 'tiempo', 'ejecucion']),
    description: z.string(),
    severity: LevelEnum,
  })).describe('Riesgos detectados con su severidad.'),
  next_actions: z.array(z.object({
    action: z.string().describe('Tarea concreta ejecutable en 24-72h.'),
    responsible: z.string().describe('Responsable sugerido.'),
    due_date: z.string().nullable().describe('Fecha objetivo en ISO 8601, o null.'),
    dependency: z.string().nullable().describe('Dependencia bloqueante, o null.'),
  })).describe('Acciones inmediatas (Anexo A). Incluí verificación si falta un dato crítico.'),
  evidence: z.array(z.object({
    claim: z.string().describe('Afirmación sostenida (fecha, monto, elegibilidad, requisito).'),
    quote: z.string().describe('Fragmento textual literal de la convocatoria que la respalda.'),
    field: z.string().describe('Campo del esquema que respalda (ej. deadline.date).'),
  })).describe('Citas que separan hechos de inferencias (regla CITAR FUENTE).'),
  missing_data: z.array(z.string()).describe('Datos críticos ausentes en la fuente.'),
  draft_outputs: z.object({
    executive_summary: z.string().describe('2-4 frases: qué busca la oportunidad y por qué importa para Moollish.'),
    narrative_angle: z.string().describe('Ángulo narrativo para posicionar a Moollish ante el financiador.'),
  }),
})
export type LlmAnalysis = z.infer<typeof LlmAnalysisSchema>

// Salida final del agente: lo del LLM + campos calculados por código + metadata de auditoría.
export const OpportunityAnalysisSchema = LlmAnalysisSchema.extend({
  deadline: LlmAnalysisSchema.shape.deadline.extend({
    days_remaining: z.number().nullable(), // calculado por el código, NO por el LLM
  }),
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
