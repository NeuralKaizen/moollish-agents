import { google, type gmail_v1 } from 'googleapis'
import type { GmailReader, GmailMessage, GmailAttachment } from './types'

let cached: GmailReader | null = null

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

interface AttachmentRef { filename: string; mimeType: string; attachmentId: string }

function walk(part: gmail_v1.Schema$MessagePart | undefined, bodyParts: string[], atts: AttachmentRef[]): void {
  if (!part) return
  if (part.parts && part.parts.length > 0) {
    for (const p of part.parts) walk(p, bodyParts, atts)
    return
  }
  if (part.mimeType === 'text/plain' && part.body?.data) {
    bodyParts.push(Buffer.from(part.body.data, 'base64url').toString('utf8'))
  } else if (part.filename && part.body?.attachmentId) {
    atts.push({ filename: part.filename, mimeType: part.mimeType ?? '', attachmentId: part.body.attachmentId })
  }
}

export function createGmailReader(): GmailReader {
  if (cached) return cached
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Faltan GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GMAIL_REFRESH_TOKEN (revisá las env).')
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  const gmail = google.gmail({ version: 'v1', auth })

  cached = {
    async listMessageIds(opts) {
      const res = await gmail.users.messages.list({ userId: 'me', q: 'in:inbox', maxResults: opts?.max ?? 25 })
      return (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id)
    },
    async getMessage(id): Promise<GmailMessage> {
      const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      const payload = res.data.payload
      const headers = payload?.headers
      const bodyParts: string[] = []
      const refs: AttachmentRef[] = []
      walk(payload, bodyParts, refs)
      const attachments: GmailAttachment[] = []
      for (const ref of refs) {
        const att = await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: ref.attachmentId })
        const data = att.data.data ? new Uint8Array(Buffer.from(att.data.data, 'base64url')) : new Uint8Array()
        attachments.push({ filename: ref.filename, mimeType: ref.mimeType, data })
      }
      return {
        id,
        from: headerValue(headers, 'From'),
        subject: headerValue(headers, 'Subject'),
        body: bodyParts.join('\n').trim(),
        attachments,
      }
    },
  }
  return cached
}
