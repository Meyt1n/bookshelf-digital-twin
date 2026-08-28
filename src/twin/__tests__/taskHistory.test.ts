// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { twinEngine } from '../engine'
import {
  clearHistory,
  getHistory,
  linkNavMission,
  noteNavPhase,
  recordTaskSnapshot,
} from '../taskHistory'
import type { MotionTask, TaskPhase } from '../../types'

function mkTask(id: string, phase: TaskPhase, action: 'store' | 'take' = 'store'): MotionTask {
  return {
    id,
    action,
    cid: 2,
    floor: 1,
    cell: 2,
    bookId: 7,
    title: '测试图书',
    actor: '测试',
    phase,
    phaseStart: 0,
    createdAt: 1000,
  }
}

describe('taskHistory · 相位轨迹与导航联动关联', () => {
  beforeAll(() => {
    // 停掉单例引擎的 250ms tick：其订阅回调会以引擎真实任务（null）
    // 调 recordTaskSnapshot，与测试驱动的假任务轨迹竞争
    twinEngine.dispose()
  })

  beforeEach(() => {
    clearHistory()
  })

  it('任务相位去重记录，任务结束后归档', () => {
    recordTaskSnapshot(mkTask('T900', 'dispatch'), 1000)
    recordTaskSnapshot(mkTask('T900', 'dispatch'), 1100)
    recordTaskSnapshot(mkTask('T900', 'ack'), 1200)
    recordTaskSnapshot(mkTask('T900', 'deliver'), 1300)
    expect(getHistory()).toHaveLength(0)

    recordTaskSnapshot(null, 2000)
    const [rec] = getHistory()
    expect(rec.id).toBe('T900')
    expect(rec.phases.map((p) => p.phase)).toEqual(['dispatch', 'ack', 'deliver'])
    expect(rec.endedAt).toBe(2000)
    expect(rec.fault).toBe(false)
  })

  it('急停相位置 fault 标记', () => {
    recordTaskSnapshot(mkTask('T901', 'dispatch'), 1000)
    recordTaskSnapshot(mkTask('T901', 'fault'), 1500)
    recordTaskSnapshot(null, 1600)
    expect(getHistory()[0].fault).toBe(true)
  })

  it('linkNavMission 作用于进行中任务：归档后保留 correlationId', () => {
    recordTaskSnapshot(mkTask('T902', 'dispatch'), 1000)
    linkNavMission('T902', 'T902')
    recordTaskSnapshot(null, 2000)
    expect(getHistory()[0].correlationId).toBe('T902')
  })

  it('linkNavMission 作用于已归档记录', () => {
    recordTaskSnapshot(mkTask('T903', 'dispatch'), 1000)
    recordTaskSnapshot(null, 2000)
    expect(getHistory()[0].correlationId).toBeUndefined()

    linkNavMission('T903', 'T903')
    expect(getHistory()[0].correlationId).toBe('T903')
  })

  it('noteNavPhase 追加到进行中任务的联动时间线', () => {
    recordTaskSnapshot(mkTask('T904', 'dispatch'), 1000)
    linkNavMission('T904', 'T904')
    noteNavPhase('T904', '前往「藏书区」', 1500)
    recordTaskSnapshot(null, 2000)

    const [rec] = getHistory()
    expect(rec.navPhases).toEqual([{ label: '前往「藏书区」', at: 1500 }])
  })

  it('noteNavPhase 追加到已归档记录（任务结束后导航才到站）', () => {
    recordTaskSnapshot(mkTask('T905', 'dispatch'), 1000)
    linkNavMission('T905', 'T905')
    noteNavPhase('T905', '前往「藏书区」', 1500)
    recordTaskSnapshot(null, 2000)
    noteNavPhase('T905', '已送达「藏书区」', 2600)

    const [rec] = getHistory()
    expect(rec.navPhases?.map((p) => p.label)).toEqual(['前往「藏书区」', '已送达「藏书区」'])
  })

  it('未知 correlationId 不产生副作用', () => {
    recordTaskSnapshot(mkTask('T906', 'dispatch'), 1000)
    recordTaskSnapshot(null, 2000)
    noteNavPhase('T999', '前往「服务台」')
    const [rec] = getHistory()
    expect(rec.navPhases ?? []).toHaveLength(0)
  })
})
