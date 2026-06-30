import { describe, it, expect } from 'vitest'
import { scoreAlly, suggestAllies, type AllyProfile, type PartnerGap, type MatchContext } from './match'

const gap: PartnerGap = { ally_type: 'universidad', suggested_role: 'validación científica', priority: 'alto', reason: 'falta rigor' }
const ctx: MatchContext = { themes: 'agricultura seguridad alimentaria innovación', country: null }

const universidad: AllyProfile = {
  name: 'Universidad Nacional', type: 'universidad / centro de investigación', country: 'Colombia',
  capabilities: 'investigación aplicada validación medición impacto', recommendedRole: 'Socio científico', reputation: 'alto',
}
const ong: AllyProfile = {
  name: 'Fundación Raíces', type: 'ONG / fundación local', country: 'Colombia',
  capabilities: 'trabajo comunitario llegada territorial', recommendedRole: 'Implementador', reputation: 'medio',
}

describe('scoreAlly', () => {
  it('el match de tipo sube el score', () => {
    expect(scoreAlly(gap, universidad, ctx)).toBeGreaterThan(scoreAlly(gap, ong, ctx))
  })

  it('a igualdad de lo demás, mayor reputación da más score', () => {
    const alto: AllyProfile = { name: 'A', type: 'universidad', reputation: 'alto' }
    const bajo: AllyProfile = { name: 'B', type: 'universidad', reputation: 'bajo' }
    expect(scoreAlly(gap, alto, ctx)).toBeGreaterThan(scoreAlly(gap, bajo, ctx))
  })

  it('la complementariedad de capacidades vs temas sube el score', () => {
    const sinTemas: AllyProfile = { name: 'C', type: 'universidad', capabilities: 'cocina repostería', reputation: 'medio' }
    const conTemas: AllyProfile = { name: 'D', type: 'universidad', capabilities: 'agricultura innovación', reputation: 'medio' }
    expect(scoreAlly(gap, conTemas, ctx)).toBeGreaterThan(scoreAlly(gap, sinTemas, ctx))
  })

  it('la geografía aporta cuando ambos países coinciden', () => {
    const ctxCo: MatchContext = { themes: '', country: 'Colombia' }
    const ctxNull: MatchContext = { themes: '', country: null }
    const a: AllyProfile = { name: 'E', type: 'x', country: 'Colombia', reputation: 'bajo' }
    expect(scoreAlly(gap, a, ctxCo)).toBeGreaterThan(scoreAlly(gap, a, ctxNull))
  })

  it('score 0 cuando no hay ninguna señal', () => {
    const nada: AllyProfile = { name: 'Z', type: 'banco', capabilities: 'finanzas', reputation: 'bajo' }
    expect(scoreAlly(gap, nada, ctx)).toBe(0)
  })
})

describe('suggestAllies', () => {
  it('rankea desc y limita al top-N', () => {
    const res = suggestAllies([gap], [ong, universidad], ctx, { top: 1 })
    expect(res).toHaveLength(1)
    expect(res[0].candidates).toHaveLength(1)
    expect(res[0].candidates[0].ally.name).toBe('Universidad Nacional')
  })

  it('descarta candidatos con score 0', () => {
    const nada: AllyProfile = { name: 'Z', type: 'banco', capabilities: 'finanzas', reputation: 'bajo' }
    const res = suggestAllies([gap], [nada], ctx)
    expect(res[0].candidates).toHaveLength(0)
  })

  it('partnersNeeded vacío → []', () => {
    expect(suggestAllies([], [universidad], ctx)).toEqual([])
  })

  it('aliados vacíos → cada brecha con candidates []', () => {
    const res = suggestAllies([gap], [], ctx)
    expect(res).toEqual([{ gap, candidates: [] }])
  })
})
