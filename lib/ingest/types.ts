import type { OpportunityAnalysis } from '@/lib/agent/schema'

export interface IngestSource {
  type: 'page' | 'pdf' | 'upload'
  name: string
  url: string | null
  chars: number
}

export interface IngestResult {
  text: string
  sources: IngestSource[]
  truncated: boolean
  notes: string[]
}

export type IngestionSummary = Omit<IngestResult, 'text'>

export interface PageContent {
  markdown: string
  links: string[]
  title: string | null
}

export interface Reader {
  scrapePage(url: string): Promise<PageContent>
  scrapeDoc(url: string): Promise<{ text: string }>
}

export type ProgressEvent =
  | { type: 'progress'; step: string }
  | { type: 'result'; analysis: OpportunityAnalysis; ingestion: IngestionSummary }
  | { type: 'error'; error: string }
