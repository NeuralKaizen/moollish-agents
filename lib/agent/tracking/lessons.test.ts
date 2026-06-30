import { describe, it, expect } from 'vitest'
import { stateForResultado, appendLesson } from './lessons'

const today = new Date('2026-06-30T12:00:00Z')

describe('stateForResultado', () => {
  it('mapea ganada→aprobada, perdida→rechazada, otro→null', () => {
    expect(stateForResultado('ganada')).toBe('aprobada')
    expect(stateForResultado('perdida')).toBe('rechazada')
    expect(stateForResultado('otro')).toBeNull()
  })
})

describe('appendLesson', () => {
  it('crea la primera entrada cuando no hay texto previo', () => {
    expect(appendLesson(null, 'faltó socio local', today)).toBe('- [2026-06-30] faltó socio local')
    expect(appendLesson('   ', 'otra', today)).toBe('- [2026-06-30] otra')
  })

  it('anexa preservando el texto previo', () => {
    expect(appendLesson('- [2026-01-01] vieja', 'nueva', today)).toBe('- [2026-01-01] vieja\n- [2026-06-30] nueva')
  })

  it('lección vacía o en blanco → devuelve el texto previo sin cambios', () => {
    expect(appendLesson('algo', '   ', today)).toBe('algo')
    expect(appendLesson(null, '', today)).toBe('')
  })
})
