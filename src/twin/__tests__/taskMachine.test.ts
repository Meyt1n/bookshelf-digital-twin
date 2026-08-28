import { describe, expect, it, vi } from 'vitest'
import { GANTRY_HOME, HEAD_REST, cellY, cellZ } from '../../scene/layout'
import { PHASE_MS, taskFlow } from '../kinematics'
import { tickTask, type TaskHost } from '../taskMachine'
import type { MotionTask, TaskAction, TaskPhase } from '../../types'

function mkHost() {
  return {
    pushEvent: vi.fn<TaskHost['pushEvent']>(),
    moveGantryTo: vi.fn<TaskHost['moveGantryTo']>(),
    beginBayScan: vi.fn<TaskHost['beginBayScan']>(),
    applyInventoryChange: vi.fn<TaskHost['applyInventoryChange']>(),
    acknowledge: vi.fn<TaskHost['acknowledge']>(),
    noteCompleted: vi.fn<TaskHost['noteCompleted']>(),
  } satisfies TaskHost
}

function mkTask(action: TaskAction, phase: TaskPhase = 'dispatch', phaseStart = 0): MotionTask {
  return {
    id: 'T001',
    action,
    cid: 6,
    floor: 2,
    cell: 2,
    bookId: 7,
    title: '测试图书',
    actor: '测试',
    phase,
    phaseStart,
    createdAt: 0,
  }
}

/** 让当前相位时长走满并推进一拍；返回推进后的 now */
function advance(task: MotionTask, host: TaskHost, now: number): number {
  const next = task.phaseStart + (PHASE_MS[task.phase] ?? 1) + 1
  expect(now).toBeLessThanOrEqual(next)
  tickTask(task, host, next)
  return next
}

describe('taskMachine · 相位推进', () => {
  it('相位时长未走完：不推进、无副作用、任务保持', () => {
    const host = mkHost()
    const task = mkTask('store', 'dispatch', 1000)
    const alive = tickTask(task, host, 1000 + PHASE_MS.dispatch - 10)
    expect(alive).toBe(true)
    expect(task.phase).toBe('dispatch')
    expect(host.pushEvent).not.toHaveBeenCalled()
    expect(host.acknowledge).not.toHaveBeenCalled()
  })

  it('dispatch → ack：控制器应答（acknowledge 恰好一次）', () => {
    const host = mkHost()
    const task = mkTask('store')
    advance(task, host, 0)
    expect(task.phase).toBe('ack')
    expect(host.acknowledge).toHaveBeenCalledTimes(1)
    expect(host.pushEvent).toHaveBeenCalledWith('motion', 'info', expect.stringContaining('ACK=0x00'))
  })

  it('存书 ack → deliver（机器人直送，龙门不动）；取书 ack → lift（龙门升降）', () => {
    const storeHost = mkHost()
    const store = mkTask('store', 'ack')
    advance(store, storeHost, 0)
    expect(store.phase).toBe('deliver')
    expect(storeHost.moveGantryTo).not.toHaveBeenCalled()

    const takeHost = mkHost()
    const take = mkTask('take', 'ack')
    advance(take, takeHost, 0)
    expect(take.phase).toBe('lift')
    expect(takeHost.moveGantryTo).toHaveBeenCalledWith(
      expect.any(Number),
      GANTRY_HOME.x,
      cellY(take.floor),
      cellZ(take.floor),
      PHASE_MS.lift,
    )
  })

  it('存书 deliver → scan：夹板拍照识别启动', () => {
    const host = mkHost()
    const task = mkTask('store', 'deliver')
    advance(task, host, 0)
    expect(task.phase).toBe('scan')
    expect(host.beginBayScan).toHaveBeenCalledWith(task)
  })

  it('operate → retract：库存变更恰好一次', () => {
    const host = mkHost()
    const task = mkTask('store', 'operate')
    advance(task, host, 0)
    expect(task.phase).toBe('retract')
    expect(host.applyInventoryChange).toHaveBeenCalledTimes(1)
  })

  it('retract → return：龙门回到第二层大隔间待机位', () => {
    const host = mkHost()
    const task = mkTask('take', 'retract')
    advance(task, host, 0)
    expect(task.phase).toBe('return')
    expect(host.moveGantryTo).toHaveBeenCalledWith(
      expect.any(Number),
      GANTRY_HOME.x,
      GANTRY_HOME.y,
      HEAD_REST.z,
      PHASE_MS.return,
    )
  })

  it('存书全程相位顺序与 taskFlow 一致，完成落账一次后终结', () => {
    const host = mkHost()
    const task = mkTask('store')
    const seen: TaskPhase[] = [task.phase]
    let now = 0
    for (let i = 0; i < 30 && task.phase !== 'done'; i++) {
      now = advance(task, host, now)
      seen.push(task.phase)
    }
    expect(seen).toEqual([...taskFlow('store'), 'done'])
    expect(host.noteCompleted).toHaveBeenCalledTimes(1)
    // done 相位走满 → 终结
    expect(tickTask(task, host, now + PHASE_MS.done + 1)).toBe(false)
  })

  it('取书全程：return 后回 handoff 交车，handoff → done 落账', () => {
    const host = mkHost()
    const task = mkTask('take')
    const seen: TaskPhase[] = [task.phase]
    let now = 0
    for (let i = 0; i < 30 && task.phase !== 'done'; i++) {
      now = advance(task, host, now)
      seen.push(task.phase)
    }
    expect(seen).toEqual([...taskFlow('take'), 'done'])
    expect(host.noteCompleted).toHaveBeenCalledTimes(1)
    expect(host.pushEvent).toHaveBeenCalledWith('take', 'ok', expect.stringContaining('取书完成'))
  })

  it('fault 相位走满 → 终结且无落账', () => {
    const host = mkHost()
    const task = mkTask('store', 'fault', 0)
    expect(tickTask(task, host, PHASE_MS.fault + 1)).toBe(false)
    expect(host.noteCompleted).not.toHaveBeenCalled()
  })
})
