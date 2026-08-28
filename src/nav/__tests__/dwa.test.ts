import { describe, expect, it } from 'vitest'
import { integrateAckermann } from '../ackermann'
import { DEFAULT_DWA, dwaSelect, type DwaParams } from '../dwa'
import { createGrid, inflate, isBlockedWorld, setRectWorld } from '../grid'

const OPEN = () => createGrid(96, 56, 0.2) // 19.2m × 11.2m 空场

const P: DwaParams = { ...DEFAULT_DWA }

describe('dwaSelect in open space', () => {
  it('tracks the desired (v, δ) closely', () => {
    const g = OPEN()
    const pose = { x: 9, y: 5, theta: 0 }
    const current = { v: 0.6, delta: 0 }
    const desired = { v: 0.7, delta: 0.15 }
    const d = dwaSelect(g, pose, current, desired, { x: 12, y: 5.6 }, [], P, 0.1)
    expect(d.blocked).toBe(false)
    expect(d.best).not.toBeNull()
    // 采样粒度内贴合期望
    expect(Math.abs(d.v - desired.v)).toBeLessThan(0.12)
    expect(Math.abs(d.delta - desired.delta)).toBeLessThan(0.2)
    expect(d.candidates.length).toBe(P.vSamples * P.steerSamples)
  })

  it('respects the dynamic window (accel and steer-rate limits)', () => {
    const g = OPEN()
    const current = { v: 0.2, delta: 0 }
    // 期望值远超窗口：v 与 δ 都只能推进一个窗口宽度
    const d = dwaSelect(
      g,
      { x: 9, y: 5, theta: 0 },
      current,
      { v: 1.1, delta: P.maxSteer },
      { x: 15, y: 8 },
      [],
      P,
      0.1,
    )
    expect(d.v).toBeLessThanOrEqual(current.v + P.accV * 0.1 + 1e-9)
    expect(d.v).toBeGreaterThan(current.v) // 但在窗口内尽量加速
    expect(d.delta).toBeLessThanOrEqual(current.delta + P.steerRate * 0.1 + 1e-9)
  })
})

describe('dwaSelect obstacle avoidance', () => {
  it('brakes or swerves for a pedestrian dead ahead', () => {
    const g = OPEN()
    const pose = { x: 6, y: 5, theta: 0 }
    const current = { v: 0.5, delta: 0 }
    const desired = { v: 0.55, delta: 0 }
    // 行人在正前方 1.1m，静止；保持当前速度直行必撞
    const ped = { x: 7.1, y: 5, radius: 0.25 }
    const d = dwaSelect(g, pose, current, desired, { x: 9, y: 5 }, [ped], P, 0.1)
    expect(d.blocked).toBe(false)
    expect(d.best!.collided).toBe(false)
    // 要么明显减速，要么打方向
    expect(d.v < current.v - 0.05 || Math.abs(d.delta) > 0.15).toBe(true)
    // 验证所选轨迹全程与行人保持安全距离
    let p = { ...pose }
    const steps = Math.round(P.horizon / P.simDt)
    for (let s = 0; s < steps; s++) {
      p = integrateAckermann(p, d.v, d.delta, P.simDt, P.wheelbase)
      expect(Math.hypot(p.x - ped.x, p.y - ped.y)).toBeGreaterThan(ped.radius + P.robotRadius)
    }
  })

  it('reverses out when forward arcs are all walled (K-turn support)', () => {
    const g = createGrid(30, 30, 0.2) // 6m × 6m
    // 正前方一堵墙；目标在正后方 → 前进候选全撞，倒车挪位最优
    setRectWorld(g, 3.6, 0, 3.8, 6, 1)
    inflate(g, 0.3)
    const pose = { x: 3.3, y: 3, theta: 0 }
    const d = dwaSelect(
      g,
      pose,
      { v: 0, delta: 0 },
      { v: -0.3, delta: -P.maxSteer }, // 纯追踪倒车调头指令
      { x: 1, y: 3 },
      [],
      P,
      0.1,
    )
    expect(d.blocked).toBe(false)
    expect(d.v).toBeLessThan(-0.01)
    // 所选倒车弧全程不撞墙
    let p = { ...pose }
    const steps = Math.round(P.horizon / P.simDt)
    for (let s = 0; s < steps; s++) {
      p = integrateAckermann(p, d.v, d.delta, P.simDt, P.wheelbase)
      expect(isBlockedWorld(g, p.x, p.y)).toBe(false)
    }
  })

  it('reports blocked when the robot is fully boxed in', () => {
    const g = createGrid(30, 30, 0.2)
    g.occ.fill(1) // 全场占据 → 任何位置都禁行
    const d = dwaSelect(
      g,
      { x: 3, y: 3, theta: 0 },
      { v: 0.5, delta: 0 },
      { v: 0.5, delta: 0 },
      { x: 5, y: 3 },
      [],
      P,
      0.1,
    )
    expect(d.blocked).toBe(true)
    expect(d.v).toBe(0)
    expect(d.best).toBeNull()
    expect(d.candidates.every((c) => c.collided)).toBe(true)
  })

  it('prefers steering away from a close pedestrian on one side', () => {
    const g = OPEN()
    // 右侧（+y）近距离有行人：应偏向远离行人的 δ ≤ 0
    const ped = { x: 7.0, y: 5.55, radius: 0.3 }
    const d = dwaSelect(
      g,
      { x: 6, y: 5, theta: 0 },
      { v: 0.7, delta: 0 },
      { v: 0.7, delta: 0 },
      { x: 10, y: 5 },
      [ped],
      P,
      0.1,
    )
    expect(d.blocked).toBe(false)
    expect(d.delta).toBeLessThan(0.01)
  })
})
