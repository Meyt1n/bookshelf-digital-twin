/* ============================================================
   路径平滑：string-pull 视线捷径 + 等距重采样
   A* 格序列 → 世界折线 → 拉直（保持可视）→ 均匀采样供纯追踪
   ============================================================ */

import { cellCenter, lineOfSight } from './grid'
import type { Cell, OccupancyGrid, Vec2 } from './types'

/** 格序列 → 格中心世界折线 */
export function cellsToWorld(grid: OccupancyGrid, cells: Cell[]): Vec2[] {
  return cells.map((c) => cellCenter(grid, c.cx, c.cy))
}

/**
 * string-pull：从锚点出发贪心跳到最远可视路点，删除中间冗余点。
 * 结果每段均满足 lineOfSight，端点保持不变。
 * marginNear > 0 时捷径额外避开贴近膨胀边界的格（保持安全余量）；
 * 相邻原始路点之间的回退步进不受约束，最坏退化为原始路径。
 */
export function stringPull(grid: OccupancyGrid, points: Vec2[], marginNear = 0): Vec2[] {
  if (points.length <= 2) return points.slice()
  const out: Vec2[] = [points[0]]
  let anchor = 0
  while (anchor < points.length - 1) {
    let next = anchor + 1
    for (let j = points.length - 1; j > anchor + 1; j--) {
      if (lineOfSight(grid, points[anchor], points[j], marginNear)) {
        next = j
        break
      }
    }
    out.push(points[next])
    anchor = next
  }
  return out
}

/** 折线总长（米） */
export function pathLength(points: Vec2[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return len
}

/**
 * 沿弧长等距重采样，保留首尾端点。
 * spacing ≤ 0 或点数不足时原样返回副本。
 */
export function resample(points: Vec2[], spacing: number): Vec2[] {
  if (points.length < 2 || spacing <= 0) return points.map((p) => ({ ...p }))
  const out: Vec2[] = [{ ...points[0] }]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1].x
    const ay = points[i - 1].y
    const dx = points[i].x - ax
    const dy = points[i].y - ay
    const seg = Math.hypot(dx, dy)
    if (seg < 1e-9) continue
    let along = spacing - carry
    while (along < seg) {
      const t = along / seg
      out.push({ x: ax + dx * t, y: ay + dy * t })
      along += spacing
    }
    carry = seg - (along - spacing)
  }
  const last = points[points.length - 1]
  const tail = out[out.length - 1]
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > spacing * 0.25) {
    out.push({ ...last })
  } else {
    tail.x = last.x
    tail.y = last.y
  }
  return out
}

/**
 * 贴边余量：软代价 ≥ 24 即距膨胀边界不足 1 格的区域，
 * string-pull 捷径不穿过，避免纯追踪切角时压上禁行边界
 */
export const SMOOTH_MARGIN_NEAR = 24

/** A* 格序列 → 平滑等距世界路径（一站式管线） */
export function smoothPath(grid: OccupancyGrid, cells: Cell[], spacing = 0.12): Vec2[] {
  return resample(stringPull(grid, cellsToWorld(grid, cells), SMOOTH_MARGIN_NEAR), spacing)
}
