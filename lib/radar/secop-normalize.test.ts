// lib/radar/secop-normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSecopRow } from './secop-normalize'

const row = {
  id_del_proceso: 'CO1.123',
  descripci_n_del_procedimiento: 'Monitoreo ambiental y riego',
  entidad: 'CAR Cundinamarca',
  precio_base: '500000000',
  fecha_de_recepcion_de: '2026-09-30T00:00:00.000',
  urlproceso: 'https://comunidad.secop.gov.co/proceso/CO1.123',
}

describe('normalizeSecopRow', () => {
  it('mapea una fila SECOP a DetectedOpportunity con dedupKey', () => {
    const d = normalizeSecopRow(row)
    expect(d).not.toBeNull()
    expect(d!.sourceRef).toBe('CO1.123')
    expect(d!.dedupKey).toBe('secop:CO1.123')
    expect(d!.title).toContain('Monitoreo ambiental')
    expect(d!.funder).toBe('CAR Cundinamarca')
    expect(d!.amount).toBe('500000000')
    expect(d!.currency).toBe('COP')
    expect(d!.url).toContain('secop.gov.co')
  })
  it('devuelve null si falta id o título', () => {
    expect(normalizeSecopRow({ entidad: 'X' })).toBeNull()
    expect(normalizeSecopRow({ id_del_proceso: 'A' })).toBeNull()
  })
})
