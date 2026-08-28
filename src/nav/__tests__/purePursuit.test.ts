import { describe, expect, it } from 'vitest'
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

describe('purePursuit', () => {
  it('drives straight with near-zero curvature on a straight path', () => {
    const path = line(0, 8, 0.1)
    const cmd = purePursuit(path, { x: 1, y: 0, theta: 0 }, 0.8)
    expect(cmd.done).toBe(false)
    expect(cmd.v).toBeGreaterThan(0.5)
    expect(Math.abs(cmd.w)).toBeLessThan(1e-6)
  })

  it('turns toward the path side (w sign follows local y of target)', () => {
    const path = line(0, 8, 0.1, 1.0) // 路径在 +y 侧
    const cmdLeft = purePursuit(path, { x: 1, y: 0, theta: 0 }, 0.5)
    expect(cmdLeft.w).toBeGreaterThan(0.1)

    const pathNeg = line(0, 8, 0.1, -1.0) // 路径在 -y 侧
    const cmdRight = purePursuit(pathNeg, { x: 1, y: 0, theta: 0 }, 0.5)
    expect(cmdRight.w).toBeLessThan(-0.1)
  })

  it('rotates in place when the target is behind', () => {
    const path = line(0, 4, 0.1)
    // 机器人在路径中点、朝向反向
    const cmd = purePursuit(path, { x: 2, y: 0, theta: Math.PI }, 0.6)
    expect(cmd.v).toBe(0)
    expect(Math.abs(cmd.w)).toBeCloseTo(DEFAULT_PURSUIT.maxW)
  })

  it('slows near the goal and reports done inside tolerance', () => {
    const path = line(0, 3, 0.1)
    const slowing = purePursuit(path, { x: 2.6, y: 0, theta: 0 }, 1.0)
    expect(slowing.done).toBe(false)
    expect(slowing.v).toBeLessThan(DEFAULT_PURSUIT.maxV * 0.6)

    const done = purePursuit(path, { x: 2.9, y: 0.05, theta: 0 }, 0.5)
    expect(done.done).toBe(true)
    expect(done.v).toBe(0)
    expect(done.w).toBe(0)
  })

  it('adapts lookahead with speed (faster → target farther)', () => {
    const path = line(0, 8, 0.1)
    const slow = purePursuit(path, { x: 1, y: 0, theta: 0 }, 0)
    const fast = purePursuit(path, { x: 1, y: 0, theta: 0 }, 1.0)
    expect(fast.target.x).toBeGreaterThan(slow.target.x + 0.2)
  })
})
