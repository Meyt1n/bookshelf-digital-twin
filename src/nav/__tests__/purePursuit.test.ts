import { describe, expect, it } from 'vitest'
import { MAX_STEER } from '../ackermann'
import {
  DEFAULT_PURSUIT,
  clamp,
  lookaheadPoint,
  nearestIndex,
  purePursuit,
  wrapAngle,
} from '../purePursuit'
import type { Vec2 } from '../types'

function line(x0: number, x1: number, step: number, y = 0): Vec2[] {
  const n = Math.round((x1 - x0) / step)
  const pts: Vec2[] = []
  for (let i = 0; i <= n; i++) pts.push({ x: x0 + i * step, y })
  return pts
}

describe('math helpers', () => {
  it('clamp bounds values', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-2, 0, 3)).toBe(0)
    expect(clamp(1.5, 0, 3)).toBe(1.5)
  })

  it('wrapAngle folds into (-π, π]', () => {
    expect(wrapAngle(0)).toBe(0)
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2)
    expect(wrapAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1)
  })
})

describe('nearestIndex / lookaheadPoint', () => {
  it('finds the closest path point ahead of fromIndex', () => {
    const path = line(0, 5, 0.1)
    expect(nearestIndex(path, { x: 2.04, y: 0.4 })).toBe(20)
    // 只向前搜索：fromIndex 之后的最近点
    expect(nearestIndex(path, { x: 1.0, y: 0 }, 30)).toBe(30)
  })

  it('returns a point at exactly the lookahead distance', () => {
    const path = line(0, 5, 0.1)
    const origin = { x: 1.0, y: 0 }
    const p = lookaheadPoint(path, nearestIndex(path, origin), origin, 0.75)
    expect(Math.hypot(p.x - origin.x, p.y - origin.y)).toBeCloseTo(0.75, 3)
    expect(p.y).toBeCloseTo(0)
  })

  it('clamps to the final point when the path runs out', () => {
    const path = line(0, 1, 0.1)
    const p = lookaheadPoint(path, 0, { x: 0.9, y: 0 }, 5)
    expect(p).toEqual({ x: 1, y: 0 })
  })
})

describe('purePursuit（阿克曼）', () => {
  it('drives straight with near-zero steering on a straight path', () => {
    const path = line(0, 8, 0.1)
    const cmd = purePursuit(path, { x: 1, y: 0, theta: 0 }, 0.8)
    expect(cmd.done).toBe(false)
    expect(cmd.reversing).toBe(false)
    expect(cmd.v).toBeGreaterThan(0.5)
    expect(Math.abs(cmd.delta)).toBeLessThan(1e-6)
  })

  it('steers toward the path side (δ sign follows local y of target)', () => {
    const path = line(0, 8, 0.1, 1.0) // 路径在 +y 侧
    const cmdLeft = purePursuit(path, { x: 1, y: 0, theta: 0 }, 0.5)
    expect(cmdLeft.delta).toBeGreaterThan(0.05)

    const pathNeg = line(0, 8, 0.1, -1.0) // 路径在 -y 侧
    const cmdRight = purePursuit(pathNeg, { x: 1, y: 0, theta: 0 }, 0.5)
    expect(cmdRight.delta).toBeLessThan(-0.05)
  })

  it('steering never exceeds the physical limit', () => {
    // 目标在正侧方（α = π/2）：需求曲率远超物理极限
    const path = line(0, 4, 0.1, 2.0)
    const cmd = purePursuit(path, { x: 0, y: 0, theta: 0 }, 0.3)
    expect(Math.abs(cmd.delta)).toBeLessThanOrEqual(MAX_STEER + 1e-9)
  })

  it('reverses with opposite full steer when the target is behind (K-turn)', () => {
    const path = line(0, 4, 0.1)
    // 机器人在路径中点、朝向反向：阿克曼无法原地转向 → 倒车反打
    const cmd = purePursuit(path, { x: 2, y: 0.2, theta: Math.PI }, 0.6)
    expect(cmd.reversing).toBe(true)
    expect(cmd.v).toBeCloseTo(-DEFAULT_PURSUIT.reverseV)
    expect(Math.abs(cmd.delta)).toBeCloseTo(DEFAULT_PURSUIT.maxSteer)
    // 目标偏角 α>0（沿 θ 增大方向调头更近）→ 倒车时 δ 反号为负
    expect(cmd.delta).toBeLessThan(0)
  })

  it('keeps reversing until the heading error shrinks (hysteresis)', () => {
    const path = line(0, 4, 0.1)
    // 偏角 ~0.5π：前进阈值内，但若正在倒车则继续倒（0.5π > 0.35π 退出阈值）
    const pose = { x: 2, y: 0, theta: Math.PI / 2 }
    const forward = purePursuit(path, pose, 0.4)
    expect(forward.reversing).toBe(false)
    const reversing = purePursuit(path, pose, -0.3)
    expect(reversing.reversing).toBe(true)
  })

  it('slows near the goal and reports done inside tolerance', () => {
    const path = line(0, 3, 0.1)
    const slowing = purePursuit(path, { x: 2.6, y: 0, theta: 0 }, 1.0)
    expect(slowing.done).toBe(false)
    expect(slowing.v).toBeLessThan(DEFAULT_PURSUIT.maxV * 0.6)

    const done = purePursuit(path, { x: 2.9, y: 0.05, theta: 0 }, 0.5)
    expect(done.done).toBe(true)
    expect(done.v).toBe(0)
    expect(done.delta).toBe(0)
  })

  it('adapts lookahead with speed (faster → target farther)', () => {
    const path = line(0, 8, 0.1)
    const slow = purePursuit(path, { x: 1, y: 0, theta: 0 }, 0)
    const fast = purePursuit(path, { x: 1, y: 0, theta: 0 }, 1.0)
    expect(fast.target.x).toBeGreaterThan(slow.target.x + 0.2)
  })
})
