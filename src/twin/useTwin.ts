import { useSyncExternalStore } from 'react'
import { twinEngine } from './engine'
import type { TwinSnapshot } from '../types'

export function useTwin(): TwinSnapshot {
  return useSyncExternalStore(twinEngine.subscribe, twinEngine.getSnapshot)
}

export { twinEngine }
