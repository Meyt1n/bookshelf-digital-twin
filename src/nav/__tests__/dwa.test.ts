import { describe, expect, it } from 'vitest'
import { DEFAULT_DWA, dwaSelect, integrateTwist, type DwaParams } from '../dwa'
import { createGrid, inflate, isBlockedWorld, setRectWorld } from '../grid'

const OPEN = () => createGrid(96, 56, 0.2) // 19.2m × 11.2m 空场

const P: DwaParams = { ...DEFAULT_DWA }

describe('integrateTwist', () => {
  it('moves straight when w ≈ 0', () => {
    const p = integrateTwist({ x: 1, y: 2, theta: 0 }, 1, 0, 0.5)
    expect(p.x).toBeCloseTo(1.5)
    expect(p.y).toBeCloseTo(2)
    expect(p.theta).toBe(0)
  })

  it('follows an exact arc: quarter turn ends offset by radius', () => {
    // v=1, w=π/2 → 半径 r=2/π；1 秒后转过 90°
    const p = integrateTwist({ x: 0, y: 0, theta: 0 }, 1, Math.PI / 2, 1)
    const r = 1 / (Math.PI / 2)
    expect(p.theta).toBeCloseTo(Math.PI / 2)
    expect(p.x).toBeCloseTo(r)
    expect(p.y).toBeCloseTo(r)
  })
})

describe('dwaSelect in open space', () => {
  it('tracks the desired twist closely', () => {
    const g = OPEN()
    const pose = { x: 9, y: 5, theta: 0 }
    const current = { v: 0.6, w: 0 }
    const desired = { v: 0.7, w: 0.2 }
    const d = dwaSelect(g, pose, current, desired, { x: 12, y: 5.6 }, [], P, 0.1)
    expect(d.blocked).toBe(false)
    expect(d.best).not.toBeNull()
    // 采样粒度内贴合期望
    expect(Math.abs(d.v - desired.v)).toBeLessThan(0.12)
    expect(Math.abs(d.w - desired.w)).toBeLessThan(0.35)
    expect(d.candidates.length).toBe(P.vSamples * P.wSamples)
  })

  it('respects the dynamic window (cannot jump past accel limits)', () => {
    const g = OPEN()
    const current = { v: 0.2, w: 0 }
    // 期望值远超窗口
    const d = dwaSelect(g, { x: 9, y: 5, theta: 0 }, current, { v: 1.1, w: 0 }, { x: 15, y: 5 }, [], P, 0.1)
    expect(d.v).toBeLessThanOrEqual(current.v + P.accV * 0.1 + 1e-9)
    expect(d.v).toBeGreaterThan(current.v) // 但在窗口内尽量加速
  })
})

describe('dwaSelect obstacle avoidance', () => {
  it('swerves or brakes for a pedestrian dead ahead', () => {
    const g = OPEN()
    const pose = { x: 6, y: 5, theta: 0 }
    const current = { v: 0.8, w: 0 }
    const desired = { v: 0.9, w: 0 }
    // 行人在正前方 1.3m，静止；保持当前速度直行必撞
    const ped = { x: 7.3, y: 5, radius: 0.25 }
    const d = dwaSelect(g, pose, current, desired, { x: 9, y: 5 }, [ped], P, 0.1)
    expect(d.blocked).toBe(false)
    expect(d.best!.collided).toBe(false)
    // 要么打方向，要么明显减速
    expect(Math.abs(d.w) > 0.15 || d.v < current.v - 0.05).toBe(true)
    // 验证所选轨迹全程与行人保持安全距离
    let p = { ...pose }
    const steps = Math.round(P.horizon / P.simDt)
    for (let s = 0; s < steps; s++) {
      p = integrateTwist(p, d.v, d.w, P.simDt)
      expect(Math.hypot(p.x - ped.x, p.y - ped.y)).toBeGreaterThan(ped.radius + P.robotRadius)
    }
  })

  it('steers around a static pillar when braking alone cannot clear it', () => {
    const g = OPEN()
    // 正前方 1m 处一根 0.2m 立柱（膨胀后直行走廊被堵）
    setRectWorld(g, 7.0, 5.0, 7.2, 5.2, 1)
    inflate(g, 0.3)
    const pose = { x: 6, y: 5.1, theta: 0 }
    // 窗口内最低速度直行仍会撞：必须转向
    const d = dwaSelect(g, pose, { v: 0.9, w: 0 }, { v: 0.9, w: 0 }, { x: 9, y: 5.1 }, [], P, 0.1)
    expect(d.blocked).toBe(false)
    expect(Math.abs(d.w)).toBeGreaterThan(0.15)
    // 所选轨迹全程不进入禁行格
    let p = { ...pose }
    const steps = Math.round(P.horizon / P.simDt)
    for (let s = 0; s < steps; s++) {
      p = integrateTwist(p, d.v, d.w, P.simDt)
      expect(isBlockedWorld(g, p.x, p.y)).toBe(false)
    }
  })

  it('reports blocked when the robot is fully boxed in', () => {
    const g = createGrid(30, 30, 0.2)
    g.occ.fill(1) // 全场占据 → 任何位置都禁行
    const d = dwaSelect(
      g,
      { x: 3, y: 3, theta: 0 },
      { v: 0.5, w: 0 },
      { v: 0.5, w: 0 },
      { x: 5, y: 3 },
      [],
      P,
      0.1,
    )
    expect(d.blocked).toBe(true)
    expect(d.v).toBe(0)
    expect(d.w).toBe(0)
    expect(d.best).toBeNull()
    expect(d.candidates.every((c) => c.collided)).toBe(true)
  })

  it('prefers wider clearance among safe options', () => {
    const g = OPEN()
    // 右侧（+y）近距离有行人：应偏向远离行人的负 w
    const ped = { x: 7.0, y: 5.55, radius: 0.3 }
    const d = dwaSelect(
      g,
      { x: 6, y: 5, theta: 0 },
      { v: 0.7, w: 0 },
      { v: 0.7, w: 0 },
      { x: 10, y: 5 },
      [ped],
      P,
      0.1,
    )
    expect(d.blocked).toBe(false)
    expect(d.w).toBeLessThan(0.01)
  })
})
