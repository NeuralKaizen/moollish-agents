import type { DemoOpportunity, PipelineState } from '@/lib/demo/types'
import type { SubmissionRow } from '@/lib/db/schema'

export const IN_FLIGHT_STATES: PipelineState[] = [
  'priorizada', 'en_alianzas', 'en_formulacion', 'presentada', 'en_evaluacion',
]
const POST_SUBMIT: PipelineState[] = ['presentada', 'en_evaluacion']

export type Urgency = 'vencida' | 'urgente' | 'proxima' | 'lejana' | 'sin_fecha'
export type DeadlineKind = 'deadline' | 'hito' | 'resultado'

export interface NextDate {
  date: string | null
  kind: DeadlineKind | null
  daysLeft: number | null
  urgency: Urgency
}

export interface SubmissionLike {
  fechaResultadoEsp: string | null
  proximoHitoFecha: string | null
}

export interface TrackingInput {
  opportunityId: string
  name: string
  state: PipelineState
  deadlineDate: string | null
  submission: SubmissionLike | null
}

export interface InFlightItem {
  opportunityId: string
  name: string
  state: PipelineState
  next: NextDate
}

// Parsea el prefijo YYYY-MM-DD a medianoche UTC. Devuelve null si no matchea.
function toUtcMidnight(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

function dayDiff(iso: string, today: Date): number | null {
  const target = toUtcMidnight(iso)
  if (target == null) return null
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((target - base) / 86_400_000)
}

function classify(date: string | null, kind: DeadlineKind | null, today: Date): NextDate {
  if (!date) return { date: null, kind: null, daysLeft: null, urgency: 'sin_fecha' }
  const daysLeft = dayDiff(date, today)
  if (daysLeft == null) return { date: null, kind: null, daysLeft: null, urgency: 'sin_fecha' }
  let urgency: Urgency
  if (daysLeft < 0) urgency = 'vencida'
  else if (daysLeft <= 7) urgency = 'urgente'
  else if (daysLeft <= 30) urgency = 'proxima'
  else urgency = 'lejana'
  return { date, kind, daysLeft, urgency }
}

export function nextRelevantDate(
  input: { state: PipelineState; deadlineDate: string | null; submission: SubmissionLike | null },
  today: Date,
): NextDate {
  const { state, deadlineDate, submission } = input
  if (POST_SUBMIT.includes(state)) {
    const candidates: { date: string; kind: DeadlineKind; ms: number }[] = []
    if (submission?.proximoHitoFecha) {
      const ms = toUtcMidnight(submission.proximoHitoFecha)
      if (ms != null) candidates.push({ date: submission.proximoHitoFecha, kind: 'hito', ms })
    }
    if (submission?.fechaResultadoEsp) {
      const ms = toUtcMidnight(submission.fechaResultadoEsp)
      if (ms != null) candidates.push({ date: submission.fechaResultadoEsp, kind: 'resultado', ms })
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.ms - b.ms)
      return classify(candidates[0].date, candidates[0].kind, today)
    }
  }
  return classify(deadlineDate, deadlineDate ? 'deadline' : null, today)
}

export function rankInFlight(items: TrackingInput[], today: Date): InFlightItem[] {
  return items
    .filter((it) => IN_FLIGHT_STATES.includes(it.state))
    .map((it) => ({
      opportunityId: it.opportunityId,
      name: it.name,
      state: it.state,
      next: nextRelevantDate({ state: it.state, deadlineDate: it.deadlineDate, submission: it.submission }, today),
    }))
    .sort((a, b) => {
      const da = a.next.daysLeft
      const db = b.next.daysLeft
      if (da == null && db == null) return 0
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
}

export function deadlineCounts(items: InFlightItem[]): { vencidas: number; estaSemana: number; enEvaluacion: number } {
  let vencidas = 0
  let estaSemana = 0
  let enEvaluacion = 0
  for (const it of items) {
    if (it.next.urgency === 'vencida') vencidas++
    if (it.next.urgency === 'urgente') estaSemana++
    if (it.state === 'en_evaluacion') enEvaluacion++
  }
  return { vencidas, estaSemana, enEvaluacion }
}

export function buildTrackingInputs(opps: DemoOpportunity[], submissions: SubmissionRow[]): TrackingInput[] {
  const byId = new Map(submissions.map((s) => [s.id, s]))
  return opps.map((o) => ({
    opportunityId: o.analysis.opportunity_id,
    name: o.analysis.source.name,
    state: o.state,
    deadlineDate: o.analysis.deadline.date,
    submission: byId.get(o.analysis.opportunity_id) ?? null,
  }))
}
