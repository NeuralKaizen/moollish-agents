'use client'

import { useSyncExternalStore } from 'react'
import { createStore, type KeyValueStorage } from './store'
import { SEED_OPPORTUNITIES } from './seed'
import type { DemoOpportunity } from './types'

const browserStorage: KeyValueStorage | null =
  typeof window !== 'undefined' ? window.localStorage : null

export const demoStore = createStore(SEED_OPPORTUNITIES, browserStorage)

export function useOpportunities(): DemoOpportunity[] {
  return useSyncExternalStore(
    demoStore.subscribe,
    demoStore.getSnapshot,
    () => SEED_OPPORTUNITIES, // snapshot de servidor (SSR)
  )
}

export function useOpportunity(id: string): DemoOpportunity | undefined {
  return useOpportunities().find((o) => o.analysis.opportunity_id === id)
}
