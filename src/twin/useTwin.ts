import { useRef, useSyncExternalStore } from 'react'
import { twinEngine } from './engine'
import type { TwinSnapshot } from '../types'

export function useTwin(): TwinSnapshot {
  return useSyncExternalStore(twinEngine.subscribe, twinEngine.getSnapshot)
}

/**
 * 按切片订阅快照：selector 结果引用相等时不触发重渲染。
 * 适用于顶栏/KPI 等只需少量字段的面板，降低 4Hz 全树刷新成本。
 */
export function useTwinSelector<T>(
  selector: (snapshot: TwinSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const equalRef = useRef(isEqual)
  equalRef.current = isEqual
  const cacheRef = useRef<{ snapshot: TwinSnapshot; value: T } | null>(null)

  return useSyncExternalStore(twinEngine.subscribe, () => {
    const snapshot = twinEngine.getSnapshot()
    const cached = cacheRef.current
    if (cached && cached.snapshot === snapshot) return cached.value
    const next = selectorRef.current(snapshot)
    if (cached && equalRef.current(cached.value, next)) {
      cacheRef.current = { snapshot, value: cached.value }
      return cached.value
    }
    cacheRef.current = { snapshot, value: next }
    return next
  })
}

export { twinEngine }
