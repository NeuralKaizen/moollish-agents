export interface DetectedOpportunity {
  source: string
  sourceRef: string
  dedupKey: string
  title: string
  funder: string | null
  amount: string | null
  currency: string | null
  deadline: string | null
  url: string | null
  themes: string | null
}
