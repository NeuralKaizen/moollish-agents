// lib/radar/secop.test.ts
import { describe, it, expect } from 'vitest'
import { buildSecopUrl, fetchSecopRows } from './secop'

describe('secop client', () => {
  it('buildSecopUrl arma la URL con $q y $limit sobre el dataset', () => {
    const url = buildSecopUrl({ q: 'agricultura', limit: 10 })
    expect(url).toContain('/resource/')
    expect(url).toContain('.json')
    expect(url).toContain('%24q=agricultura')
    expect(url).toContain('%24limit=10')
  })
  it('fetchSecopRows usa el fetch inyectado y devuelve las filas', async () => {
    const fakeFetch = (async () => ({ ok: true, json: async () => [{ id_del_proceso: 'X' }] })) as unknown as typeof fetch
    const rows = await fetchSecopRows('agro', { fetchImpl: fakeFetch })
    expect(rows).toEqual([{ id_del_proceso: 'X' }])
  })
  it('fetchSecopRows lanza si la respuesta no es ok', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 429, json: async () => [] })) as unknown as typeof fetch
    await expect(fetchSecopRows('agro', { fetchImpl: fakeFetch })).rejects.toThrow(/429/)
  })
})
