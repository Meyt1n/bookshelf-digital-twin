import { describe, expect, it } from 'vitest'
import {
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
  WORLD_H,
  WORLD_W,
  cellCenter,
  createGrid,
  inBounds,
  inflate,
  isBlocked,
  isBlockedWorld,
  isOccupied,
  lineOfSight,
  nearCost,
  nearestFreeCell,
  setCell,
  setRectWorld,
  worldToCell,
} from '../grid'

describe('grid basics', () => {
  it('default dims are 96×56 at 0.2m', () => {
    const g = createGrid()
    expect(g.cols).toBe(96)
    expect(g.rows).toBe(56)
    expect(g.cellSize).toBeCloseTo(0.2)
    expect(GRID_COLS).toBe(96)
    expect(GRID_ROWS).toBe(56)
    expect(WORLD_W).toBeCloseTo(96 * CELL_SIZE)
    expect(WORLD_H).toBeCloseTo(56 * CELL_SIZE)
    expect(g.occ.length).toBe(96 * 56)
  })

  it('world/cell transforms round-trip via cell center', () => {
    const g = createGrid()
    const c = worldToCell(g, 3.05, 7.99)
    expect(c).toEqual({ cx: 15, cy: 39 })
    const p = cellCenter(g, c.cx, c.cy)
    expect(worldToCell(g, p.x, p.y)).toEqual(c)
    expect(p.x).toBeCloseTo(3.1)
    expect(p.y).toBeCloseTo(7.9)
  })

  it('inBounds / out-of-bounds treated as blocked', () => {
    const g = createGrid(10, 8, 0.5)
    expect(inBounds(g, 0, 0)).toBe(true)
    expect(inBounds(g, 9, 7)).toBe(true)
    expect(inBounds(g, 10, 0)).toBe(false)
    expect(isBlocked(g, -1, 3)).toBe(true)
    expect(isBlocked(g, 3, 3)).toBe(false)
  })
})

describe('obstacle painting + inflation', () => {
  it('setRectWorld rasterizes overlapping cells', () => {
    const g = createGrid(20, 20, 0.2)
    setRectWorld(g, 1.0, 1.0, 1.4, 1.2, 1)
    expect(isOccupied(g, 5, 5)).toBe(true)
    expect(isOccupied(g, 6, 5)).toBe(true)
    expect(isOccupied(g, 7, 5)).toBe(false)
    expect(isOccupied(g, 5, 6)).toBe(false)
  })

  it('inflate blocks a ring around obstacles and adds soft cost beyond', () => {
    const g = createGrid(30, 30, 0.2)
    setCell(g, 15, 15, 1)
    inflate(g, 0.3) // 1.5 格硬膨胀
    expect(isBlocked(g, 15, 15)).toBe(true)
    expect(isBlocked(g, 16, 15)).toBe(true)
    expect(isBlocked(g, 15, 14)).toBe(true)
    expect(isBlocked(g, 16, 16)).toBe(true) // 对角 √2≈1.41 ≤ 1.5
    expect(isBlocked(g, 18, 15)).toBe(false) // 距 3 格，超出硬膨胀
    expect(nearCost(g, 18, 15)).toBeGreaterThan(0) // 但有软代价
    expect(nearCost(g, 25, 15)).toBe(0)
  })

  it('inflate is recomputed from scratch (erase works)', () => {
    const g = createGrid(20, 20, 0.2)
    setCell(g, 10, 10, 1)
    inflate(g, 0.3)
    expect(isBlocked(g, 11, 10)).toBe(true)
    setCell(g, 10, 10, 0)
    inflate(g, 0.3)
    expect(isBlocked(g, 11, 10)).toBe(false)
    expect(nearCost(g, 12, 10)).toBe(0)
  })

  it('isBlockedWorld honors inflation', () => {
    const g = createGrid(20, 20, 0.2)
    setCell(g, 10, 10, 1)
    inflate(g, 0.3)
    expect(isBlockedWorld(g, 2.3, 2.1)).toBe(true) // 邻格 (11,10)
    expect(isBlockedWorld(g, 3.5, 2.1)).toBe(false)
  })
})

describe('lineOfSight', () => {
  it('sees across an empty grid', () => {
    const g = createGrid(40, 40, 0.2)
    expect(lineOfSight(g, { x: 0.5, y: 0.5 }, { x: 7.5, y: 6.5 })).toBe(true)
    expect(lineOfSight(g, { x: 1.1, y: 1.1 }, { x: 1.1, y: 1.1 })).toBe(true)
  })

  it('is blocked by a wall between the points', () => {
    const g = createGrid(40, 40, 0.2)
    setRectWorld(g, 3.0, 0, 3.2, 8, 1) // 竖墙
    expect(lineOfSight(g, { x: 1, y: 4 }, { x: 6, y: 4 })).toBe(false)
    expect(lineOfSight(g, { x: 1, y: 4 }, { x: 2.5, y: 4 })).toBe(true)
  })

  it('does not slip through a diagonal corner gap', () => {
    const g = createGrid(10, 10, 1)
    // 两个对角相触的障碍格 (4,4) 与 (5,5)：对角缝不可穿
    setCell(g, 4, 4, 1)
    setCell(g, 5, 5, 1)
    expect(lineOfSight(g, { x: 4.5, y: 5.5 }, { x: 5.5, y: 4.5 })).toBe(false)
  })

  it('fails if an endpoint sits inside an obstacle', () => {
    const g = createGrid(10, 10, 1)
    setCell(g, 2, 2, 1)
    expect(lineOfSight(g, { x: 2.5, y: 2.5 }, { x: 8, y: 8 })).toBe(false)
  })
})

describe('nearestFreeCell', () => {
  it('returns the cell itself when free', () => {
    const g = createGrid(20, 20, 0.2)
    expect(nearestFreeCell(g, { cx: 5, cy: 5 })).toEqual({ cx: 5, cy: 5 })
  })

  it('nudges out of an inflated blob to the closest free cell', () => {
    const g = createGrid(20, 20, 0.2)
    setCell(g, 10, 10, 1)
    inflate(g, 0.3)
    const c = nearestFreeCell(g, { cx: 10, cy: 10 })
    expect(c).not.toBeNull()
    expect(isBlocked(g, c!.cx, c!.cy)).toBe(false)
    expect(Math.hypot(c!.cx - 10, c!.cy - 10)).toBeLessThanOrEqual(3)
  })

  it('returns null when everything is blocked', () => {
    const g = createGrid(6, 6, 0.2)
    g.occ.fill(1)
    expect(nearestFreeCell(g, { cx: 3, cy: 3 }, 6)).toBeNull()
  })
})
