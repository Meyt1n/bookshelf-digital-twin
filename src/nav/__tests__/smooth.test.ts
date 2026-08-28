import { describe, expect, it } from 'vitest'
import { createGrid, inflate, lineOfSight, setRectWorld } from '../grid'
import { findPath } from '../astar'
import { cellsToWorld, pathLength, resample, smoothPath, stringPull } from '../smooth'
import type { Vec2 } from '../types'

describe('cellsToWorld / pathLength', () => {
  it('maps cells to centers and measures length', () => {
    const g = createGrid(10, 10, 0.5)
    const pts = cellsToWorld(g, [
      { cx: 0, cy: 0 },
      { cx: 2, cy: 0 },
      { cx: 2, cy: 2 },
    ])
    expect(pts[0]).toEqual({ x: 0.25, y: 0.25 })
    expect(pts[1]).toEqual({ x: 1.25, y: 0.25 })
    expect(pathLength(pts)).toBeCloseTo(2.0)
    expect(pathLength([pts[0]])).toBe(0)
  })
})

describe('stringPull', () => {
  it('collapses an open-grid staircase to its two endpoints', () => {
    const g = createGrid(40, 40, 0.2)
    const res = findPath(g, { cx: 2, cy: 2 }, { cx: 30, cy: 20 })
    expect(res).not.toBeNull()
    const pulled = stringPull(g, cellsToWorld(g, res!.cells))
    expect(pulled.length).toBe(2)
    expect(pulled[0].x).toBeCloseTo(0.5)
    expect(pulled[pulled.length - 1].x).toBeCloseTo(6.1)
  })

  it('keeps corners around obstacles and every segment stays visible', () => {
    const g = createGrid(40, 30, 0.2)
    setRectWorld(g, 3.6, 0, 4.0, 4.4, 1)
    inflate(g, 0.3)
    const res = findPath(g, { cx: 4, cy: 8 }, { cx: 34, cy: 8 })
    expect(res).not.toBeNull()
    const pts = cellsToWorld(g, res!.cells)
    const pulled = stringPull(g, pts)
    expect(pulled.length).toBeGreaterThan(2) // 必须留拐点
    expect(pulled.length).toBeLessThan(pts.length) // 且确实精简了
    for (let i = 1; i < pulled.length; i++) {
      expect(lineOfSight(g, pulled[i - 1], pulled[i])).toBe(true)
    }
    // 端点不变
    expect(pulled[0]).toEqual(pts[0])
    expect(pulled[pulled.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('passes short paths through untouched', () => {
    const g = createGrid(10, 10, 0.2)
    const two: Vec2[] = [
      { x: 0.5, y: 0.5 },
      { x: 1.5, y: 0.5 },
    ]
    expect(stringPull(g, two)).toEqual(two)
  })
})

describe('resample', () => {
  it('spaces points evenly and keeps endpoints', () => {
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]
    const rs = resample(pts, 0.25)
    expect(rs[0]).toEqual({ x: 0, y: 0 })
    expect(rs[rs.length - 1]).toEqual({ x: 1, y: 1 })
    for (let i = 1; i < rs.length; i++) {
      const d = Math.hypot(rs[i].x - rs[i - 1].x, rs[i].y - rs[i - 1].y)
      expect(d).toBeGreaterThan(0.1)
      expect(d).toBeLessThan(0.36)
    }
    // 总长不变
    expect(pathLength(rs)).toBeCloseTo(2.0, 1)
  })

  it('handles degenerate inputs', () => {
    expect(resample([], 0.2)).toEqual([])
    const single: Vec2[] = [{ x: 1, y: 1 }]
    expect(resample(single, 0.2)).toEqual(single)
    expect(resample(single, 0.2)[0]).not.toBe(single[0]) // 深拷贝
  })
})

describe('smoothPath pipeline', () => {
  it('produces a dense collision-free polyline from A* cells', () => {
    const g = createGrid(40, 30, 0.2)
    setRectWorld(g, 3.6, 0, 4.0, 4.4, 1)
    inflate(g, 0.3)
    const res = findPath(g, { cx: 4, cy: 8 }, { cx: 34, cy: 8 })
    const path = smoothPath(g, res!.cells, 0.12)
    expect(path.length).toBeGreaterThan(20)
    for (let i = 1; i < path.length; i++) {
      expect(lineOfSight(g, path[i - 1], path[i])).toBe(true)
    }
    // 平滑后不应长于原始格路径
    expect(pathLength(path)).toBeLessThanOrEqual(pathLength(cellsToWorld(g, res!.cells)) + 1e-9)
  })
})
