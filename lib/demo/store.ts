import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { DemoOpportunity, PipelineState } from './types'
import { addOpportunity, setOpportunityState, toggleOpportunityTask } from './operations'

export const DEMO_STORAGE_KEY = 'moollish.demo.v1'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DemoStore {
  getSnapshot(): DemoOpportunity[]
  subscribe(listener: () => void): () => void
  add(analysis: OpportunityAnalysis): void
  setState(id: string, state: PipelineState, reason?: string): void
  toggleTask(id: string, index: number): void
  reset(): void
}

export function createStore(
  seed: DemoOpportunity[],
  storage: KeyValueStorage | null,
  now: () => string = () => new Date().toISOString(),
): DemoStore {
  const listeners = new Set<() => void>()

  function persist(s: DemoOpportunity[]): void {
    storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(s))
  }
  function load(): DemoOpportunity[] {
    if (!storage) return seed
    const raw = storage.getItem(DEMO_STORAGE_KEY)
    if (raw === null) { persist(seed); return seed }
    try {
      return JSON.parse(raw) as DemoOpportunity[]
    } catch {
      persist(seed)
      return seed
    }
  }

  let state: DemoOpportunity[] = load()

  function commit(next: DemoOpportunity[]): void {
    state = next
    persist(state)
    listeners.forEach((l) => l())
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    add(analysis) { commit(addOpportunity(state, analysis, now())) },
    setState(id, s, reason) { commit(setOpportunityState(state, id, s, reason)) },
    toggleTask(id, index) { commit(toggleOpportunityTask(state, id, index)) },
    reset() { commit([...seed]) },
  }
}
