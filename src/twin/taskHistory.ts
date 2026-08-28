import { twinEngine } from './engine'
import type { TaskAction, TaskPhase } from '../types'

export type TaskHistoryRecord = {
  id: string
  action: TaskAction
  title: string
  actor: string
  phases: Array<{ phase: TaskPhase; at: number }>
  startedAt: number
  endedAt: number
  fault: boolean
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
  records = [{ ...track, endedAt }, ...records].slice(0, MAX_RECORDS)
  emit()
}

function onSnapshot(): void {
  const { task } = twinEngine.getSnapshot()
  const now = Date.now()

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
