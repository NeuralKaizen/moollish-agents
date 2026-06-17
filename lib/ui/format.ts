import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { DEFAULT_WEIGHTS } from '@/lib/agent/config'

type Semaforo = OpportunityAnalysis['semaforo']
type Recommendation = OpportunityAnalysis['recommendation']
type Vehicle = OpportunityAnalysis['recommended_vehicle']
type CriterionKey = keyof OpportunityAnalysis['criteria_scores']
type Level = OpportunityAnalysis['effort']

export const SEMAFORO_META: Record<Semaforo, { label: string; color: string }> = {
  verde_alto: { label: 'Verde alto', color: '#3c7d34' },
  verde_condicionado: { label: 'Verde condicionado', color: '#3c7d34' },
  amarillo: { label: 'Amarillo', color: '#9a6b12' },
  naranja: { label: 'Naranja', color: '#c2611c' },
  rojo: { label: 'Rojo', color: '#b23a2e' },
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  apply_now: 'Aplicar ya',
  apply_with_partner: 'Aplicar con socio',
  observe: 'Observar',
  request_info: 'Pedir información',
  discard: 'Descartar',
}

export const VEHICLE_LABEL: Record<Vehicle, string> = {
  moollish: 'Moollish',
  moollish_sat2farm: 'Moollish + Sat2Farm',
  foundation_nova: 'Foundation Nova',
  alianza: 'Alianza',
}

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  alineacion_estrategica: 'Alineación estratégica',
  elegibilidad: 'Elegibilidad jurídica/institucional',
  monto_retorno: 'Monto y retorno esperado',
  probabilidad_exito: 'Probabilidad de éxito',
  complejidad_documental: 'Complejidad documental',
  tiempo_disponible: 'Tiempo disponible',
  impacto_estrategico: 'Impacto estratégico',
  riesgo_ejecucion: 'Riesgo de ejecución',
}

export const LEVEL_LABEL: Record<Level, string> = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
}

export function criterionWeightPct(key: CriterionKey): number {
  return Math.round(DEFAULT_WEIGHTS[key] * 100)
}

export function daysRemaining(isoDate: string | null, now: Date = new Date()): number | null {
  if (!isoDate) return null
  const target = new Date(isoDate).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - now.getTime()) / 86_400_000)
}

export function formatCurrency(value: number | null, currency: string | null): string {
  if (value == null) return '—'
  try {
    return new Intl.NumberFormat('es-CO', {
      style: currency ? 'currency' : 'decimal',
      currency: currency ?? undefined,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${value.toLocaleString('es-CO')}${currency ? ` ${currency}` : ''}`
  }
}
