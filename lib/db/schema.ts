import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { ConceptNote } from '@/lib/agent/drafts/concept-note'
import type { DemoTask, PipelineState } from '@/lib/demo/types'

export const opportunities = pgTable('opportunities', {
  id: text('id').primaryKey(), // = analysis.opportunity_id
  state: text('state').$type<PipelineState>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  responsible: text('responsible'),
  decisionReason: text('decision_reason'),
  analysis: jsonb('analysis').$type<OpportunityAnalysis>().notNull(),
  tasks: jsonb('tasks').$type<DemoTask[]>().notNull(),
})

export type OpportunityRow = typeof opportunities.$inferSelect
export type NewOpportunityRow = typeof opportunities.$inferInsert

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'captura'
  storagePath: text('storage_path').notNull(),
  ocrText: text('ocr_text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DocumentRow = typeof documents.$inferSelect
export type NewDocumentRow = typeof documents.$inferInsert

export const funders = pgTable('funders', {
  id: text('id').primaryKey(), // slug, ej. 'fao'
  name: text('name').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull(),
  themes: text('themes'),
  geographies: text('geographies'),
  typicalAmounts: text('typical_amounts'),
  frequency: text('frequency'),
  eligibleEntity: text('eligible_entity'),
  requiredDocuments: text('required_documents'),
  winningExamples: text('winning_examples'),
  contacts: text('contacts'),
  language: text('language'),
  evaluationCriteria: text('evaluation_criteria'),
  lessonsLearned: text('lessons_learned'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FunderRow = typeof funders.$inferSelect
export type NewFunderRow = typeof funders.$inferInsert

export const processedEmails = pgTable('processed_emails', {
  messageId: text('message_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').$type<'ok' | 'failed'>().notNull(),
  error: text('error'),
  opportunityId: text('opportunity_id'),
})

export type ProcessedEmailRow = typeof processedEmails.$inferSelect
export type NewProcessedEmailRow = typeof processedEmails.$inferInsert

export const detectedOpportunities = pgTable('detected_opportunities', {
  id: text('id').primaryKey(), // dedup key, ej. 'secop:<sourceRef>'
  source: text('source').notNull(),
  sourceRef: text('source_ref').notNull(),
  title: text('title').notNull(),
  funder: text('funder'),
  amount: text('amount'),
  currency: text('currency'),
  deadline: text('deadline'),
  url: text('url'),
  themes: text('themes'),
  status: text('status').$type<'detectada' | 'promovida' | 'descartada'>().notNull(),
  opportunityId: text('opportunity_id'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DetectedRow = typeof detectedOpportunities.$inferSelect
export type NewDetectedRow = typeof detectedOpportunities.$inferInsert

export const drafts = pgTable('drafts', {
  id: text('id').primaryKey(), // '<opportunityId>:<kind>' — un vigente por tipo
  opportunityId: text('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'concept_note'
  content: jsonb('content').$type<ConceptNote>().notNull(),
  missingData: jsonb('missing_data').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DraftRow = typeof drafts.$inferSelect
export type NewDraftRow = typeof drafts.$inferInsert
