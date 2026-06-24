import type { OpportunityAnalysis } from '@/lib/agent/schema'

export const PIPELINE_STATES = [
  'detectada', 'analizada', 'priorizada', 'en_alianzas', 'en_formulacion',
  'presentada', 'en_evaluacion', 'aprobada', 'rechazada', 'descartada',
] as const
export type PipelineState = (typeof PIPELINE_STATES)[number]

export interface DemoTask {
  action: string
  responsible: string
  due_date: string | null
  dependency: string | null
  done: boolean
}

export interface DemoOpportunity {
  analysis: OpportunityAnalysis
  state: PipelineState
  created_at: string            // ISO 8601
  responsible: string | null
  tasks: DemoTask[]
  decision_reason: string | null
}

export function tasksFromAnalysis(a: OpportunityAnalysis): DemoTask[] {
  return a.next_actions.map((n) => ({
    action: n.action,
    responsible: n.responsible,
    due_date: n.due_date,
    dependency: n.dependency,
    done: false,
  }))
}
