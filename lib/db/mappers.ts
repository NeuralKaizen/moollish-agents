import type { DemoOpportunity } from '@/lib/demo/types'
import type { OpportunityRow, NewOpportunityRow } from './schema'

export function rowToOpportunity(row: OpportunityRow): DemoOpportunity {
  return {
    analysis: row.analysis,
    state: row.state,
    created_at: row.createdAt.toISOString(),
    responsible: row.responsible,
    tasks: row.tasks,
    decision_reason: row.decisionReason,
  }
}

export function opportunityToRow(o: DemoOpportunity): NewOpportunityRow {
  return {
    id: o.analysis.opportunity_id,
    state: o.state,
    createdAt: new Date(o.created_at),
    responsible: o.responsible,
    decisionReason: o.decision_reason,
    analysis: o.analysis,
    tasks: o.tasks,
  }
}
