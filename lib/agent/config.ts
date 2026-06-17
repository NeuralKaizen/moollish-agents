import type { CriterionKey } from './schema'

export const WEIGHTS_VERSION = 'v1'

// Pesos del §9 de la spec. Suman 1.0. Configurables sin tocar el prompt.
export const DEFAULT_WEIGHTS: Record<CriterionKey, number> = {
  alineacion_estrategica: 0.20,
  elegibilidad: 0.15,
  monto_retorno: 0.15,
  probabilidad_exito: 0.15,
  complejidad_documental: 0.10,
  tiempo_disponible: 0.10,
  impacto_estrategico: 0.10,
  riesgo_ejecucion: 0.05,
}

// Slug de OpenRouter. Verificar el más nuevo en https://openrouter.ai/api/v1/models.
export const DEFAULT_MODEL = process.env.AGENT_MODEL ?? 'anthropic/claude-sonnet-4.5'
