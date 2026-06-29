import { describe, it, expect } from 'vitest'
import { messageToCorpusInputs } from './parse'
import type { GmailMessage } from './types'

const extractPdf = async (bytes: Uint8Array) => (bytes.length > 0 ? 'TEXTO DEL PDF' : '')

function msg(over: Partial<GmailMessage> = {}): GmailMessage {
  return { id: 'm1', from: 'fao@un.org', subject: 'Convocatoria X', body: 'Cuerpo del correo', attachments: [], ...over }
}

describe('messageToCorpusInputs', () => {
  it('arma un input con el cuerpo + encabezado de remitente/asunto', async () => {
    const { inputs } = await messageToCorpusInputs(msg(), extractPdf)
    expect(inputs).toHaveLength(1)
    expect(inputs[0].body).toContain('fao@un.org')
    expect(inputs[0].body).toContain('Convocatoria X')
    expect(inputs[0].body).toContain('Cuerpo del correo')
  })

  it('extrae el texto de un adjunto PDF', async () => {
    const { inputs } = await messageToCorpusInputs(
      msg({ attachments: [{ filename: 'terminos.pdf', mimeType: 'application/pdf', data: new Uint8Array([1]) }] }),
      extractPdf,
    )
    expect(inputs.some((i) => i.body.includes('TEXTO DEL PDF'))).toBe(true)
  })

  it('omite adjuntos no-PDF con nota', async () => {
    const { inputs, notes } = await messageToCorpusInputs(
      msg({ body: '', attachments: [{ filename: 'foto.png', mimeType: 'image/png', data: new Uint8Array([1]) }] }),
      extractPdf,
    )
    expect(inputs).toHaveLength(0)
    expect(notes.join(' ')).toMatch(/no es PDF/i)
  })

  it('correo vacío → sin inputs + nota', async () => {
    const { inputs, notes } = await messageToCorpusInputs(msg({ body: '   ' }), extractPdf)
    expect(inputs).toHaveLength(0)
    expect(notes.join(' ')).toMatch(/no traía texto/i)
  })
})
