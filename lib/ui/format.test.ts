import { describe, it, expect } from 'vitest'
import {
  SEMAFORO_META, RECOMMENDATION_LABEL, criterionWeightPct,
  daysRemaining, formatCurrency, PIPELINE_STATE_META,
} from './format'
import { PIPELINE_STATES } from '@/lib/demo/types'

describe('format helpers', () => {
  it('tiene meta para cada semáforo', () => {
    for (const k of ['verde_alto', 'verde_condicionado', 'amarillo', 'naranja', 'rojo'] as const) {
      expect(SEMAFORO_META[k].label.length).toBeGreaterThan(0)
      expect(SEMAFORO_META[k].color).toMatch(/^#/)
    }
  })

  it('mapea la recomendación a label en español', () => {
    expect(RECOMMENDATION_LABEL.apply_now).toBe('Aplicar ya')
    expect(RECOMMENDATION_LABEL.discard).toBe('Descartar')
  })

  it('convierte el peso del criterio a porcentaje entero', () => {
    expect(criterionWeightPct('alineacion_estrategica')).toBe(20)
    expect(criterionWeightPct('riesgo_ejecucion')).toBe(5)
  })

  it('calcula días restantes respecto a un "ahora" fijo', () => {
    const now = new Date('2026-06-17T00:00:00.000Z')
    expect(daysRemaining('2026-06-27T00:00:00.000Z', now)).toBe(10)
    expect(daysRemaining(null, now)).toBeNull()
    expect(daysRemaining('no-es-fecha', now)).toBeNull()
  })

  it('formatea monto y maneja null', () => {
    expect(formatCurrency(null, 'USD')).toBe('—')
    expect(formatCurrency(1000000, 'USD')).toMatch(/1/)
    expect(formatCurrency(1000, null)).toMatch(/1/)
  })
})

describe('PIPELINE_STATE_META', () => {
  it('tiene etiqueta y color para los 10 estados', () => {
    for (const s of PIPELINE_STATES) {
      expect(PIPELINE_STATE_META[s].label).toBeTruthy()
      expect(PIPELINE_STATE_META[s].color).toMatch(/^#/)
    }
  })
})
