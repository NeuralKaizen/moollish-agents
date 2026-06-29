export interface GmailAttachment {
  filename: string
  mimeType: string
  data: Uint8Array
}

export interface GmailMessage {
  id: string
  from: string
  subject: string
  body: string
  attachments: GmailAttachment[]
}

export interface GmailReader {
  listMessageIds(opts?: { max?: number }): Promise<string[]>
  getMessage(id: string): Promise<GmailMessage>
}
