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

function throttleSubscribe(
  subscribe: (onStoreChange: () => void) => () => void,
  intervalMs: number,
): (onStoreChange: () => void) => () => void {
  return (onStoreChange) => {
    let lastFire = 0
    let trailingTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const fire = () => {
      if (disposed) return
      lastFire = Date.now()
      trailingTimer = null
      onStoreChange()
    }

    const onEngineChange = () => {
      if (disposed) return
      const elapsed = Date.now() - lastFire
      if (elapsed >= intervalMs) {
        if (trailingTimer !== null) {
          clearTimeout(trailingTimer)
          trailingTimer = null
        }
        fire()
      } else if (trailingTimer === null) {
        trailingTimer = setTimeout(fire, intervalMs - elapsed)
      }
    }

    const unsub = subscribe(onEngineChange)
    return () => {
      disposed = true
      if (trailingTimer !== null) clearTimeout(trailingTimer)
      unsub()
    }
  }
}

/**
 * 与 useTwinSelector 相同的切片缓存，但将引擎订阅通知节流到至多每 intervalMs 一次（leading + trailing）。
 * 引擎仍 4Hz；遥测/事件流等 UI 可用 500ms 降低重渲染频率。
 */
export function useThrottledTwinSelector<T>(
  selector: (snapshot: TwinSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
  intervalMs = 500,
): T {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const equalRef = useRef(isEqual)
  equalRef.current = isEqual
  const cacheRef = useRef<{ snapshot: TwinSnapshot; value: T } | null>(null)
  const subscribeRef = useRef<(onStoreChange: () => void) => () => void | null>(null)
  if (subscribeRef.current === null) {
    subscribeRef.current = throttleSubscribe(twinEngine.subscribe, intervalMs)
  }

  return useSyncExternalStore(subscribeRef.current, () => {
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
