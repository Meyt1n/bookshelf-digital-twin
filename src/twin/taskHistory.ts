import { twinEngine } from './engine'
import type { MotionTask, TaskAction, TaskPhase } from '../types'

export type TaskHistoryRecord = {
  id: string
  action: TaskAction
  title: string
  actor: string
  phases: Array<{ phase: TaskPhase; at: number }>
  startedAt: number
  endedAt: number
  fault: boolean
  /** 导航联动 ID：孪生任务联动派送 / 演示剧本共用（通常 = 任务 id） */
  correlationId?: string
  /** 关联导航任务的阶段快照（回放列表中的联动时间线） */
  navPhases?: Array<{ label: string; at: number }>
}

const MAX_RECORDS = 20

let records: TaskHistoryRecord[] = []
const listeners = new Set<() => void>()

type ActiveTrack = {
  id: string
  action: TaskAction
  title: string
  actor: string
  phases: Array<{ phase: TaskPhase; at: number }>
  startedAt: number
  lastPhase: TaskPhase
  fault: boolean
  correlationId?: string
  navPhases: Array<{ label: string; at: number }>
}

let active: ActiveTrack | null = null
let unsubEngine: (() => void) | null = null

function emit(): void {
  listeners.forEach((fn) => fn())
}

function pushPhase(track: ActiveTrack, phase: TaskPhase, at: number): void {
  if (track.lastPhase === phase) return
  track.phases.push({ phase, at })
  track.lastPhase = phase
  if (phase === 'fault') track.fault = true
}

function finalizeTrack(track: ActiveTrack, endedAt: number): void {
  records = [
    { ...track, navPhases: [...track.navPhases], endedAt },
    ...records,
  ].slice(0, MAX_RECORDS)
  emit()
}

/**
 * 记录一次任务快照（引擎订阅内部调用；导出供测试直接驱动）。
 * task 为 null 表示当前无任务 → 结束并归档进行中的轨迹。
 */
export function recordTaskSnapshot(task: MotionTask | null, now = Date.now()): void {
  if (task) {
    if (!active || active.id !== task.id) {
      active = {
        id: task.id,
        action: task.action,
        title: task.title,
        actor: task.actor,
        phases: [{ phase: task.phase, at: now }],
        startedAt: task.createdAt,
        lastPhase: task.phase,
        fault: task.phase === 'fault',
        navPhases: [],
      }
    } else {
      pushPhase(active, task.phase, now)
    }
    return
  }

  if (active) {
    finalizeTrack(active, now)
    active = null
  }
}

/**
 * 把导航任务与孪生任务通过 correlationId 关联起来
 * （twinBridge 联动派送 / 演示剧本调用；通常 correlationId = taskId）。
 */
export function linkNavMission(taskId: string, correlationId: string): void {
  if (active && active.id === taskId) {
    active.correlationId = correlationId
    return
  }
  if (!records.some((r) => r.id === taskId && r.correlationId !== correlationId)) return
  records = records.map((r) => (r.id === taskId ? { ...r, correlationId } : r))
  emit()
}

/** 追加导航阶段快照到关联的任务轨迹（进行中或已归档均可） */
export function noteNavPhase(correlationId: string, label: string, at = Date.now()): void {
  if (active && active.correlationId === correlationId) {
    active.navPhases.push({ label, at })
    return
  }
  if (!records.some((r) => r.correlationId === correlationId)) return
  records = records.map((r) =>
    r.correlationId === correlationId
      ? { ...r, navPhases: [...(r.navPhases ?? []), { label, at }] }
      : r,
  )
  emit()
}

function onSnapshot(): void {
  recordTaskSnapshot(twinEngine.getSnapshot().task)
}

function ensureSubscribed(): void {
  if (unsubEngine !== null) return
  unsubEngine = twinEngine.subscribe(onSnapshot)
  onSnapshot()
}

export function subscribeHistory(fn: () => void): () => void {
  ensureSubscribed()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getHistory(): readonly TaskHistoryRecord[] {
  ensureSubscribed()
  return records
}

export function clearHistory(): void {
  records = []
  active = null
  emit()
}

ensureSubscribed()
