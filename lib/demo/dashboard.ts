import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, DemoTask, PipelineState } from './types'
import { PIPELINE_STATES } from './types'

const APPLY = new Set<OpportunityAnalysis['recommendation']>(['apply_now', 'apply_with_partner'])

export function montoUSD(f: OpportunityAnalysis['funding_amount']): number | null {
  if (f.estimated_usd != null) return f.estimated_usd
  if (f.currency === 'USD' && f.value != null) return f.value
  return null
}

function deadlineMs(o: DemoOpportunity): number {
  const d = o.analysis.deadline.date
  return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY
}

export function newOpportunities(list: DemoOpportunity[], now: number, hours = 72): DemoOpportunity[] {
  const cutoff = now - hours * 3_600_000
  return list.filter((o) => new Date(o.created_at).getTime() >= cutoff)
}

export interface StateBucket { state: PipelineState; count: number; totalUsd: number }
export function pipelineByState(list: DemoOpportunity[]): StateBucket[] {
  return PIPELINE_STATES.map((state) => {
    const items = list.filter((o) => o.state === state)
    const totalUsd = items.reduce((s, o) => s + (montoUSD(o.analysis.funding_amount) ?? 0), 0)
    return { state, count: items.length, totalUsd }
  }).filter((b) => b.count > 0)
}

export function topToApply(list: DemoOpportunity[], n = 10): DemoOpportunity[] {
  return [...list]
    .filter((o) => APPLY.has(o.analysis.recommendation))
    .sort((a, b) => b.analysis.overall_score - a.analysis.overall_score || deadlineMs(a) - deadlineMs(b))
    .slice(0, n)
}

export function criticalRisks(list: DemoOpportunity[]): DemoOpportunity[] {
  return list.filter((o) => {
    const a = o.analysis
    return a.eligibility.gaps.length > 0
      || a.missing_data.length > 0
      || a.risks.some((r) => r.severity === 'alto')
  })
}

export interface AllyNeed { ally_type: string; count: number }
export function requiredAllies(list: DemoOpportunity[]): AllyNeed[] {
  const counts = new Map<string, number>()
  for (const o of list) {
    for (const p of o.analysis.partners_needed) {
      counts.set(p.ally_type, (counts.get(p.ally_type) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([ally_type, count]) => ({ ally_type, count }))
    .sort((a, b) => b.count - a.count)
}

export function potentialResources(list: DemoOpportunity[]): number {
  return list.reduce((sum, o) => {
    const usd = montoUSD(o.analysis.funding_amount)
    return usd == null ? sum : sum + usd * (o.analysis.overall_score / 100)
  }, 0)
}

export interface TodayAction { opportunity: DemoOpportunity; task: DemoTask }
export function actionsToday(list: DemoOpportunity[], now: number): TodayAction[] {
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  const limit = endOfToday.getTime()
  const out: TodayAction[] = []
  for (const opportunity of list) {
    for (const task of opportunity.tasks) {
      if (!task.done && task.due_date && new Date(task.due_date).getTime() <= limit) {
        out.push({ opportunity, task })
      }
    }
  }
  return out
}
