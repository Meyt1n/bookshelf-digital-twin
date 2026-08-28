import { describe, expect, it } from 'vitest'
import { findPath, octile } from '../astar'
import { createGrid, inflate, isBlocked, setCell, setRectWorld } from '../grid'
import type { Cell } from '../types'

function stepsAreConnected(cells: Cell[]): boolean {
  for (let i = 1; i < cells.length; i++) {
    const dx = Math.abs(cells[i].cx - cells[i - 1].cx)
    const dy = Math.abs(cells[i].cy - cells[i - 1].cy)
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false
  }
  return true
}

describe('octile heuristic', () => {
  it('matches straight and diagonal distances', () => {
    expect(octile(5, 0)).toBeCloseTo(5)
    expect(octile(0, -3)).toBeCloseTo(3)
    expect(octile(4, 4)).toBeCloseTo(4 * Math.SQRT2)
    expect(octile(5, 2)).toBeCloseTo(3 + 2 * Math.SQRT2)
  })
})

describe('findPath', () => {
  it('finds an optimal path on an open grid', () => {
    const g = createGrid(30, 20, 0.2)
    const res = findPath(g, { cx: 2, cy: 2 }, { cx: 12, cy: 9 })
    expect(res).not.toBeNull()
    const { cells, cost } = res!
    expect(cells[0]).toEqual({ cx: 2, cy: 2 })
    expect(cells[cells.length - 1]).toEqual({ cx: 12, cy: 9 })
    expect(stepsAreConnected(cells)).toBe(true)
    // 空场无软代价：代价应等于 octile 距离
    expect(cost).toBeCloseTo(octile(10, 7), 5)
  })

  it('handles start === goal', () => {
    const g = createGrid(10, 10, 0.2)
    const res = findPath(g, { cx: 4, cy: 4 }, { cx: 4, cy: 4 })
    expect(res).not.toBeNull()
    expect(res!.cells).toEqual([{ cx: 4, cy: 4 }])
    expect(res!.cost).toBe(0)
  })

  it('routes around a wall and never enters blocked cells', () => {
    const g = createGrid(40, 30, 0.2)
    // 竖墙留一个下方缺口
    setRectWorld(g, 4.0, 0, 4.2, 5.0, 1)
    inflate(g, 0.3)
    const res = findPath(g, { cx: 5, cy: 10 }, { cx: 35, cy: 10 })
    expect(res).not.toBeNull()
    for (const c of res!.cells) {
      expect(isBlocked(g, c.cx, c.cy)).toBe(false)
    }
    // 必须绕到缺口（y 超过 5m/0.2=25 行附近）
    expect(Math.max(...res!.cells.map((c) => c.cy))).toBeGreaterThan(25)
  })

  it('returns null when the goal is sealed off', () => {
    const g = createGrid(20, 20, 0.2)
    // 围一圈把 (10,10) 封死
    for (let d = -2; d <= 2; d++) {
      setCell(g, 10 + d, 8, 1)
      setCell(g, 10 + d, 12, 1)
      setCell(g, 8, 10 + d, 1)
      setCell(g, 12, 10 + d, 1)
    }
    expect(findPath(g, { cx: 2, cy: 2 }, { cx: 10, cy: 10 })).toBeNull()
  })

  it('returns null for blocked endpoints or out of bounds', () => {
    const g = createGrid(10, 10, 0.2)
    setCell(g, 5, 5, 1)
    expect(findPath(g, { cx: 5, cy: 5 }, { cx: 8, cy: 8 })).toBeNull()
    expect(findPath(g, { cx: 1, cy: 1 }, { cx: 5, cy: 5 })).toBeNull()
    expect(findPath(g, { cx: -1, cy: 0 }, { cx: 3, cy: 3 })).toBeNull()
  })

  it('never cuts corners diagonally', () => {
    const g = createGrid(12, 12, 0.2)
    // 对角缝：(5,5) 与 (6,6) 占据，(6,5)/(5,6) 空
    setCell(g, 5, 5, 1)
    setCell(g, 6, 6, 1)
    const res = findPath(g, { cx: 6, cy: 4 }, { cx: 4, cy: 6 })
    expect(res).not.toBeNull()
    // 不允许出现从 (6,5)→(5,6) 或反向的斜穿
    for (let i = 1; i < res!.cells.length; i++) {
      const a = res!.cells[i - 1]
      const b = res!.cells[i]
      const diagonal = a.cx !== b.cx && a.cy !== b.cy
      if (diagonal) {
        expect(isBlocked(g, a.cx, b.cy)).toBe(false)
        expect(isBlocked(g, b.cx, a.cy)).toBe(false)
      }
    }
  })

  it('soft cost pushes the path away from walls', () => {
    const g = createGrid(40, 20, 0.2)
    // 上边一条横墙，走廊在下方
    setRectWorld(g, 0, 0, 8, 0.4, 1)
    inflate(g, 0.3)
    // 起终点位于软代价环内（距墙 3 格，near=16）
    const res = findPath(g, { cx: 2, cy: 4 }, { cx: 37, cy: 4 })
    expect(res).not.toBeNull()
    // 中段应下沉离墙，避开贴墙的软代价
    const midCy = res!.cells[Math.floor(res!.cells.length / 2)].cy
    expect(midCy).toBeGreaterThan(4)
  })

  it('plans across the full 96×56 grid quickly', () => {
    const g = createGrid()
    const t0 = performance.now()
    const res = findPath(g, { cx: 1, cy: 1 }, { cx: 94, cy: 54 })
    const ms = performance.now() - t0
    expect(res).not.toBeNull()
    expect(res!.cells.length).toBeGreaterThan(90)
    expect(ms).toBeLessThan(200)
  })
})
