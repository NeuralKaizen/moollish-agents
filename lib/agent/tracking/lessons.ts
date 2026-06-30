import type { PipelineState } from '@/lib/demo/types'

export type Resultado = 'ganada' | 'perdida' | 'otro'

export function stateForResultado(r: Resultado): PipelineState | null {
  if (r === 'ganada') return 'aprobada'
  if (r === 'perdida') return 'rechazada'
  return null
}

// Anexa "- [YYYY-MM-DD] <leccion>" al texto existente (o lo crea). today inyectado → testeable.
export function appendLesson(existing: string | null, leccion: string, today: Date): string {
  const trimmed = leccion.trim()
  const base = (existing ?? '').trim()
  if (!trimmed) return base
  const date = today.toISOString().slice(0, 10)
  const entry = `- [${date}] ${trimmed}`
  return base ? `${base}\n${entry}` : entry
}
