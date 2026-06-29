import { describe, it, expect } from 'vitest'

describe('gmail client', () => {
  it('importar el módulo no lanza aunque falten credenciales', async () => {
    const mod = await import('./client')
    expect(typeof mod.createGmailReader).toBe('function')
  })
})
