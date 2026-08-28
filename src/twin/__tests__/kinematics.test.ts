import { describe, expect, it } from 'vitest'
import {
  CART_DOCK,
  CART_HOME,
  GANTRY_CARRY_SWING,
  GANTRY_SWING_IDLE,
  BAY_ENTRY_REAR_Z,
  bayHeldBookWorld,
  robotHeldBookWorld,
} from '../../scene/layout'
import {
  PHASE_MS,
  sampleBay,
  sampleBookCarrier,
  sampleBookFlight,
  sampleCart,
  sampleGantry,
  sampleLaminate,
  taskFlow,
  taskPhaseProgress,
  type GantrySeg,
} from '../kinematics'
import type { ModuleState, MotionTask, TaskAction, TaskPhase } from '../../types'

const NOW = 50_000

/** 构造处于指定相位进度 p 的任务（p = 已过时长 / 相位时长） */
function mkTask(action: TaskAction, phase: TaskPhase, p: number): MotionTask {
  return {
    id: 'T001',
    action,
    cid: 2,
    floor: 1,
    cell: 2,
    bookId: 7,
    title: '测试图书',
    actor: '测试',
    phase,
    phaseStart: NOW - p * (PHASE_MS[phase] ?? 1),
    createdAt: 0,
  }
}

describe('taskPhaseProgress / taskFlow', () => {
  it('进度按相位时长归一并夹紧到 [0,1]', () => {
    expect(taskPhaseProgress(mkTask('store', 'deliver', 0.5), NOW)).toBeCloseTo(0.5, 5)
    expect(taskPhaseProgress(mkTask('store', 'deliver', -1), NOW)).toBe(0)
    expect(taskPhaseProgress(mkTask('store', 'deliver', 2), NOW)).toBe(1)
  })

  it('存 / 取书相位序列与原状态机一致', () => {
    expect(taskFlow('store')).toEqual([
      'dispatch', 'ack', 'deliver', 'scan', 'handoff', 'lift', 'traverse', 'operate', 'retract', 'return',
    ])
    expect(taskFlow('take')).toEqual([
      'dispatch', 'ack', 'lift', 'traverse', 'operate', 'retract', 'return', 'handoff',
    ])
  })
})

describe('sampleBookCarrier · 载体交接边界', () => {
  it('存书 deliver：cart → flight → bay 按 0.36 / 0.6 切换', () => {
    expect(sampleBookCarrier(mkTask('store', 'deliver', 0.2), NOW)).toBe('cart')
    expect(sampleBookCarrier(mkTask('store', 'deliver', 0.5), NOW)).toBe('flight')
    expect(sampleBookCarrier(mkTask('store', 'deliver', 0.8), NOW)).toBe('bay')
  })

  it('存书 scan 全程在大隔间；handoff 按 0.5 / 0.64 交给夹爪', () => {
    expect(sampleBookCarrier(mkTask('store', 'scan', 0.5), NOW)).toBe('bay')
    expect(sampleBookCarrier(mkTask('store', 'handoff', 0.3), NOW)).toBe('bay')
    expect(sampleBookCarrier(mkTask('store', 'handoff', 0.55), NOW)).toBe('flight')
    expect(sampleBookCarrier(mkTask('store', 'handoff', 0.9), NOW)).toBe('gantry')
  })

  it('取书 operate：slot → flight → gantry；handoff 末段回到 cart', () => {
    expect(sampleBookCarrier(mkTask('take', 'lift', 0.5), NOW)).toBe('slot')
    expect(sampleBookCarrier(mkTask('take', 'operate', 0.2), NOW)).toBe('slot')
    expect(sampleBookCarrier(mkTask('take', 'operate', 0.4), NOW)).toBe('flight')
    expect(sampleBookCarrier(mkTask('take', 'operate', 0.9), NOW)).toBe('gantry')
    expect(sampleBookCarrier(mkTask('take', 'handoff', 0.05), NOW)).toBe('gantry')
    expect(sampleBookCarrier(mkTask('take', 'handoff', 0.5), NOW)).toBe('bay')
    expect(sampleBookCarrier(mkTask('take', 'handoff', 0.99), NOW)).toBe('cart')
  })

  it('无任务 / 急停：无载体', () => {
    expect(sampleBookCarrier(null, NOW)).toBeNull()
    expect(sampleBookCarrier(mkTask('store', 'fault', 0.5), NOW)).toBeNull()
  })
})

describe('sampleGantry · 龙门段插值与夹持', () => {
  const seg: GantrySeg = {
    fromX: 0, fromY: 1, fromZ: 0.5,
    toX: 0.4, toY: 1.6, toZ: 0.5,
    start: NOW, dur: 1000,
  }

  it('段起点取 from，段结束取 to 且 moving=false', () => {
    const p0 = sampleGantry(seg, null, NOW)
    expect(p0.x).toBeCloseTo(0, 5)
    expect(p0.y).toBeCloseTo(1, 5)
    expect(p0.moving).toBe(true)
    const p1 = sampleGantry(seg, null, NOW + 1000)
    expect(p1.x).toBeCloseTo(0.4, 5)
    expect(p1.y).toBeCloseTo(1.6, 5)
    expect(p1.moving).toBe(false)
  })

  it('中点位置按 easeInOut 落在两端之间', () => {
    const mid = sampleGantry(seg, null, NOW + 500)
    expect(mid.x).toBeGreaterThan(0)
    expect(mid.x).toBeLessThan(0.4)
    expect(mid.y).toBeCloseTo(1.3, 5)
  })

  it('存书 traverse 载书横移：并拢持书 + 压紧', () => {
    const task = mkTask('store', 'traverse', 0.5)
    const pose = sampleGantry(seg, task, NOW + 500)
    expect(pose.carrying).toBe(true)
    expect(pose.swing).toBe(-GANTRY_CARRY_SWING)
    expect(pose.squeeze).toBe(true)
    expect(pose.carryBookId).toBe(7)
  })

  it('空闲时喇叭口待机角、不载书', () => {
    const pose = sampleGantry(seg, null, NOW)
    expect(pose.swing).toBe(GANTRY_SWING_IDLE)
    expect(pose.carrying).toBe(false)
    expect(pose.carryBookId).toBeNull()
  })
})

describe('sampleCart · 小车位姿', () => {
  it('无任务巡航：绕 CART_HOME 摆动且 moving', () => {
    const pose = sampleCart(null, null, NOW)
    expect(Math.abs(pose.x - CART_HOME.x)).toBeLessThanOrEqual(0.22 + 1e-9)
    expect(Math.abs(pose.z - CART_HOME.z)).toBeLessThanOrEqual(0.16 + 1e-9)
    expect(pose.moving).toBe(true)
    expect(pose.carrying).toBe(false)
  })

  it('存书 deliver 全程停靠 CART_DOCK：mast=1，松爪时机 p≥0.3', () => {
    const early = sampleCart(mkTask('store', 'deliver', 0.2), null, NOW)
    expect(early.x).toBe(CART_DOCK.x)
    expect(early.z).toBe(CART_DOCK.z)
    expect(early.mast).toBe(1)
    expect(early.clamped).toBe(true)
    const late = sampleCart(mkTask('store', 'deliver', 0.5), null, NOW)
    expect(late.clamped).toBe(false)
    expect(late.moving).toBe(false)
  })

  it('导航覆盖只接管 x/z/yaw/moving，机构状态保持任务驱动', () => {
    const nav = { x: 9, z: -9, yaw: 1.25, moving: true }
    const base = sampleCart(mkTask('store', 'deliver', 0.2), null, NOW)
    const merged = sampleCart(mkTask('store', 'deliver', 0.2), nav, NOW)
    expect(merged.x).toBe(9)
    expect(merged.z).toBe(-9)
    expect(merged.yaw).toBe(1.25)
    expect(merged.moving).toBe(true)
    expect(merged.mast).toBe(base.mast)
    expect(merged.reach).toBe(base.reach)
    expect(merged.carrying).toBe(base.carrying)
  })
})

describe('sampleBookFlight · 机构间过渡', () => {
  it('存书 deliver 中段：书在机器人爪与大隔间柜后入口之间飞行', () => {
    const flight = sampleBookFlight(mkTask('store', 'deliver', 0.48), NOW)
    expect(flight.active).toBe(true)
    expect(flight.bookId).toBe(7)
    expect(flight.t).toBeGreaterThan(0)
    expect(flight.t).toBeLessThan(1)
    const from = robotHeldBookWorld(1)
    const to = bayHeldBookWorld(BAY_ENTRY_REAR_Z)
    const lo = Math.min(from.z, to.z)
    const hi = Math.max(from.z, to.z)
    expect(flight.z).toBeGreaterThanOrEqual(lo)
    expect(flight.z).toBeLessThanOrEqual(hi)
  })

  it('非过渡窗口不激活', () => {
    expect(sampleBookFlight(mkTask('store', 'deliver', 0.2), NOW).active).toBe(false)
    expect(sampleBookFlight(mkTask('store', 'scan', 0.5), NOW).active).toBe(false)
    expect(sampleBookFlight(null, NOW).active).toBe(false)
  })
})

describe('sampleBay · 大隔间夹板', () => {
  it('deliver 末段：刚落柜后入口，倾斜扶正夹紧，不深送', () => {
    const early = sampleBay(mkTask('store', 'deliver', 0.65), NOW)
    expect(early.bookLocalZ).toBeCloseTo(BAY_ENTRY_REAR_Z, 5)
    expect(early.bookTilt).toBeGreaterThan(0)
    expect(early.belt).toBe(0)
    const late = sampleBay(mkTask('store', 'deliver', 0.95), NOW)
    expect(late.clamp).toBeGreaterThan(0.8)
    expect(late.bookTilt).toBeLessThan(0.1)
  })

  it('scan 相位夹板全紧，闪光只出现在 0.12–0.28 窗口', () => {
    const flashing = sampleBay(mkTask('store', 'scan', 0.2), NOW)
    expect(flashing.clamp).toBe(1)
    expect(flashing.bookVisible).toBe(true)
    expect(flashing.bookTilt).toBe(0)
    expect(flashing.scanFlash).toBeGreaterThan(0)
    const still = sampleBay(mkTask('store', 'scan', 0.5), NOW)
    expect(still.scanFlash).toBe(0)
  })

  it('存书 handoff：送书过程保持夹紧，交夹爪时才松开', () => {
    const moving = sampleBay(mkTask('store', 'handoff', 0.3), NOW)
    expect(moving.clamp).toBe(1)
    expect(moving.belt).toBe(1)
    const handing = sampleBay(mkTask('store', 'handoff', 0.55), NOW)
    expect(handing.clamp).toBeLessThan(1)
  })

  it('取书 handoff：入口扶正后夹住送柜后，交机器人时松开', () => {
    const upright = sampleBay(mkTask('take', 'handoff', 0.45), NOW)
    expect(upright.bookVisible).toBe(true)
    expect(upright.clamp).toBeGreaterThan(0.5)
    const haul = sampleBay(mkTask('take', 'handoff', 0.65), NOW)
    expect(haul.clamp).toBe(1)
    expect(haul.belt).toBe(-1)
    const release = sampleBay(mkTask('take', 'handoff', 0.85), NOW)
    expect(release.clamp).toBeLessThan(1)
  })

  it('无任务时回到待机间隙', () => {
    const idle = sampleBay(null, NOW)
    expect(idle.clamp).toBeCloseTo(0.08, 5)
    expect(idle.bookVisible).toBe(false)
    expect(idle.bookTilt).toBe(0)
  })
})

describe('sampleLaminate · 塑封通道', () => {
  const running: ModuleState = { status: 'running', startedAt: NOW - 5000, duration: 10000 }
  const idle: ModuleState = { status: 'idle', startedAt: 0, duration: 0 }
  const done: ModuleState = { status: 'done', startedAt: NOW - 10000, duration: 10000 }

  it('空闲不激活', () => {
    const pose = sampleLaminate(idle, null, false, NOW)
    expect(pose.active).toBe(false)
    expect(pose.progress).toBe(0)
    expect(pose.bookId).toBeNull()
  })

  it('运行中：进度按耗时推进，履带转动，覆膜逐步覆盖', () => {
    const pose = sampleLaminate(running, 12, false, NOW)
    expect(pose.running).toBe(true)
    expect(pose.progress).toBeCloseTo(0.5, 5)
    expect(pose.belt).toBe(1)
    expect(pose.sealed).toBeGreaterThan(0)
    expect(pose.bookId).toBe(12)
  })

  it('完成 + 已呈现：成品停在入口，覆膜完成', () => {
    const pose = sampleLaminate(done, 12, true, NOW)
    expect(pose.active).toBe(true)
    expect(pose.presenting).toBe(true)
    expect(pose.progress).toBe(1)
    expect(pose.sealed).toBe(1)
  })
})
