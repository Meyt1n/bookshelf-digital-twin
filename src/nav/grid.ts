/* ============================================================
   占据栅格：96×56 · 0.2m 分辨率
   世界 19.2m × 11.2m；提供栅格/世界互换、障碍写入、
   机器人半径膨胀（含软代价环）、精确视线检测（DDA 穿越所有格）
   ============================================================ */

import type { Cell, OccupancyGrid, Vec2 } from './types'

export const GRID_COLS = 96
export const GRID_ROWS = 56
export const CELL_SIZE = 0.2
export const WORLD_W = GRID_COLS * CELL_SIZE
export const WORLD_H = GRID_ROWS * CELL_SIZE

export function createGrid(
  cols = GRID_COLS,
  rows = GRID_ROWS,
  cellSize = CELL_SIZE,
): OccupancyGrid {
  const n = cols * rows
  return {
    cols,
    rows,
    cellSize,
    occ: new Uint8Array(n),
    inflated: new Uint8Array(n),
    near: new Uint8Array(n),
  }
}

export function cellIndex(grid: OccupancyGrid, cx: number, cy: number): number {
  return cy * grid.cols + cx
}

export function inBounds(grid: OccupancyGrid, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows
}

/** 仅静态占据 */
export function isOccupied(grid: OccupancyGrid, cx: number, cy: number): boolean {
  return inBounds(grid, cx, cy) && grid.occ[cellIndex(grid, cx, cy)] !== 0
}

/** 占据或膨胀禁行（越界视为禁行） */
export function isBlocked(grid: OccupancyGrid, cx: number, cy: number): boolean {
  if (!inBounds(grid, cx, cy)) return true
  const i = cellIndex(grid, cx, cy)
  return grid.occ[i] !== 0 || grid.inflated[i] !== 0
}

export function isBlockedWorld(grid: OccupancyGrid, x: number, y: number): boolean {
  return isBlocked(grid, Math.floor(x / grid.cellSize), Math.floor(y / grid.cellSize))
}

/** 软代价（0~40），越界返回 0 */
export function nearCost(grid: OccupancyGrid, cx: number, cy: number): number {
  return inBounds(grid, cx, cy) ? grid.near[cellIndex(grid, cx, cy)] : 0
}

export function worldToCell(grid: OccupancyGrid, x: number, y: number): Cell {
  return { cx: Math.floor(x / grid.cellSize), cy: Math.floor(y / grid.cellSize) }
}

/** 格中心的世界坐标 */
export function cellCenter(grid: OccupancyGrid, cx: number, cy: number): Vec2 {
  return { x: (cx + 0.5) * grid.cellSize, y: (cy + 0.5) * grid.cellSize }
}

export function setCell(grid: OccupancyGrid, cx: number, cy: number, value: 0 | 1): void {
  if (inBounds(grid, cx, cy)) grid.occ[cellIndex(grid, cx, cy)] = value
}

/** 世界坐标矩形（半开区间语义，任意重叠即写入） */
export function setRectWorld(
  grid: OccupancyGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: 0 | 1,
): void {
  const c0 = Math.max(0, Math.floor(x0 / grid.cellSize))
  const c1 = Math.min(grid.cols - 1, Math.ceil(x1 / grid.cellSize) - 1)
  const r0 = Math.max(0, Math.floor(y0 / grid.cellSize))
  const r1 = Math.min(grid.rows - 1, Math.ceil(y1 / grid.cellSize) - 1)
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      grid.occ[cellIndex(grid, cx, cy)] = value
    }
  }
}

/** 软代价环比膨胀半径再外扩的格数 */
const SOFT_RING_CELLS = 2.5
/** 软代价强度系数 */
const SOFT_COST_GAIN = 16

/**
 * 依据静态占据重算膨胀层与软代价层。
 * radiusM 通常取机器人半径 + 安全余量；规划时机器人即可视为质点。
 */
export function inflate(grid: OccupancyGrid, radiusM: number): void {
  const hardR = radiusM / grid.cellSize
  const softR = hardR + SOFT_RING_CELLS
  const reach = Math.ceil(softR)
  grid.inflated.fill(0)
  grid.near.fill(0)

  const offsets: Array<{ dx: number; dy: number; d: number }> = []
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.hypot(dx, dy)
      if (d <= softR) offsets.push({ dx, dy, d })
    }
  }

  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      if (grid.occ[cellIndex(grid, cx, cy)] === 0) continue
      for (const o of offsets) {
        const nx = cx + o.dx
        const ny = cy + o.dy
        if (!inBounds(grid, nx, ny)) continue
        const i = cellIndex(grid, nx, ny)
        if (o.d <= hardR) {
          grid.inflated[i] = 1
        } else {
          const v = Math.round((softR - o.d) * SOFT_COST_GAIN)
          if (v > grid.near[i]) grid.near[i] = v
        }
      }
    }
  }
}

/**
 * 视线检测：Amanatides-Woo 体素遍历，命中任一禁行格即不可视。
 * 恰好穿过格角时同时检查两侧邻格，避免斜穿缝隙。
 */
export function lineOfSight(grid: OccupancyGrid, a: Vec2, b: Vec2): boolean {
  const inv = 1 / grid.cellSize
  const ax = a.x * inv
  const ay = a.y * inv
  const bx = b.x * inv
  const by = b.y * inv
  let cx = Math.floor(ax)
  let cy = Math.floor(ay)
  const ex = Math.floor(bx)
  const ey = Math.floor(by)
  if (isBlocked(grid, cx, cy)) return false

  const dx = bx - ax
  const dy = by - ay
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity
  let tMaxX =
    stepX > 0 ? (cx + 1 - ax) * tDeltaX : stepX < 0 ? (ax - cx) * tDeltaX : Infinity
  let tMaxY =
    stepY > 0 ? (cy + 1 - ay) * tDeltaY : stepY < 0 ? (ay - cy) * tDeltaY : Infinity

  let guard = grid.cols + grid.rows + 4
  while ((cx !== ex || cy !== ey) && guard-- > 0) {
    if (tMaxX < tMaxY) {
      cx += stepX
      tMaxX += tDeltaX
    } else if (tMaxY < tMaxX) {
      cy += stepY
      tMaxY += tDeltaY
    } else {
      // 恰好过角：两侧正交邻格任一被占则视为遮挡
      if (isBlocked(grid, cx + stepX, cy) || isBlocked(grid, cx, cy + stepY)) return false
      cx += stepX
      cy += stepY
      tMaxX += tDeltaX
      tMaxY += tDeltaY
    }
    if (isBlocked(grid, cx, cy)) return false
  }
  return guard > 0
}

/** 以 cell 为中心螺旋外扩，寻找最近的非禁行格 */
export function nearestFreeCell(
  grid: OccupancyGrid,
  cell: Cell,
  maxRadius = 10,
): Cell | null {
  if (!isBlocked(grid, cell.cx, cell.cy)) return cell
  for (let r = 1; r <= maxRadius; r++) {
    let best: Cell | null = null
    let bestD = Infinity
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const cx = cell.cx + dx
        const cy = cell.cy + dy
        if (isBlocked(grid, cx, cy)) continue
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = { cx, cy }
        }
      }
    }
    if (best) return best
  }
  return null
}
