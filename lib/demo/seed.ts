// lib/demo/seed.ts
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, PipelineState } from './types'
import { tasksFromAnalysis } from './types'
import generated from './analyses.generated.json'

interface SeedPlan { state: PipelineState; daysAgo: number; reason?: string }

// Estados curados para que el pipeline se vea variado en la demo (§14).
const PLAN: Record<string, SeedPlan> = {
  'fao-agrinno': { state: 'priorizada', daysAgo: 1 },
  'fontagro-ganaderia': { state: 'en_alianzas', daysAgo: 2 },
  'minciencias-966': { state: 'analizada', daysAgo: 0 },
  'div-fund-rural': { state: 'en_formulacion', daysAgo: 3 },
  'secop-car-ambiental': { state: 'descartada', daysAgo: 2, reason: 'Obra civil sin componente tecnológico suficiente para Sat2Farm.' },
}

const analyses = generated as Record<string, OpportunityAnalysis>
const NOW = Date.now()
const isoDaysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

export const SEED_OPPORTUNITIES: DemoOpportunity[] = Object.entries(PLAN)
  .filter(([key]) => analyses[key])
  .map(([key, plan]) => {
    const analysis = analyses[key]
    return {
      analysis,
      state: plan.state,
      created_at: isoDaysAgo(plan.daysAgo),
      responsible: null,
      tasks: tasksFromAnalysis(analysis),
      decision_reason: plan.reason ?? null,
    }
  })
