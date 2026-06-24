import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, PipelineState } from './types'
import { tasksFromAnalysis } from './types'

export function makeOpportunity(analysis: OpportunityAnalysis, createdAt: string): DemoOpportunity {
  return {
    analysis,
    state: 'analizada',
    created_at: createdAt,
    responsible: null,
    tasks: tasksFromAnalysis(analysis),
    decision_reason: null,
  }
}

export function addOpportunity(
  list: DemoOpportunity[], analysis: OpportunityAnalysis, createdAt: string,
): DemoOpportunity[] {
  const withoutDup = list.filter((o) => o.analysis.opportunity_id !== analysis.opportunity_id)
  return [makeOpportunity(analysis, createdAt), ...withoutDup]
}

export function setOpportunityState(
  list: DemoOpportunity[], id: string, state: PipelineState, reason?: string,
): DemoOpportunity[] {
  return list.map((o) =>
    o.analysis.opportunity_id === id
      ? { ...o, state, decision_reason: reason ?? o.decision_reason }
      : o,
  )
}

export function toggleOpportunityTask(
  list: DemoOpportunity[], id: string, index: number,
): DemoOpportunity[] {
  return list.map((o) => {
    if (o.analysis.opportunity_id !== id) return o
    return { ...o, tasks: o.tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t)) }
  })
}
