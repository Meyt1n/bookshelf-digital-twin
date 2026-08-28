/* ============================================================
   A* 全局规划：8 连通 + Octile 启发
   - 禁止切角（斜向要求两侧正交格均可通行）
   - 软代价：贴墙格步进代价上浮，路径自然靠走廊中线
   - 二叉小顶堆 + 惰性重复入堆（无 decrease-key）
   ============================================================ */

import { cellIndex, inBounds, isBlocked } from './grid'
import type { Cell, OccupancyGrid } from './types'

const SQRT2 = Math.SQRT2
/** 软代价除数：near ∈ [0,40] → 步进代价至多 ×1.625 */
const SOFT_DIV = 64
/** 启发式微放大，倾向靠近目标的展开，减少平票 */
const H_TIEBREAK = 1.0005

export type AStarResult = {
  /** 起点到终点的格序列（含两端） */
  cells: Cell[]
  /** 路径代价（格单位，含软代价） */
  cost: number
  /** 展开（弹出并闭合）的节点数 */
  expanded: number
}

/** Octile 距离（格单位） */
export function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  return ax + ay + (SQRT2 - 2) * Math.min(ax, ay)
}

class MinHeap {
  private prio: number[] = []
  private val: number[] = []

  get size(): number {
    return this.val.length
  }

  push(value: number, priority: number): void {
    const prio = this.prio
    const val = this.val
    let i = val.length
    prio.push(priority)
    val.push(value)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (prio[parent] <= prio[i]) break
      ;[prio[parent], prio[i]] = [prio[i], prio[parent]]
      ;[val[parent], val[i]] = [val[i], val[parent]]
      i = parent
    }
  }

  pop(): number {
    const prio = this.prio
    const val = this.val
    const n = val.length
    if (n === 0) return -1
    const top = val[0]
    const lastP = prio.pop()!
    const lastV = val.pop()!
    if (n > 1) {
      prio[0] = lastP
      val[0] = lastV
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < prio.length && prio[l] < prio[m]) m = l
        if (r < prio.length && prio[r] < prio[m]) m = r
        if (m === i) break
        ;[prio[m], prio[i]] = [prio[i], prio[m]]
        ;[val[m], val[i]] = [val[i], val[m]]
        i = m
      }
    }
    return top
  }
}

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

/**
 * 在栅格上求 start→goal 的最短路。起终点被占/越界或不可达时返回 null。
 */
export function findPath(grid: OccupancyGrid, start: Cell, goal: Cell): AStarResult | null {
  if (!inBounds(grid, start.cx, start.cy) || !inBounds(grid, goal.cx, goal.cy)) return null
  if (isBlocked(grid, start.cx, start.cy) || isBlocked(grid, goal.cx, goal.cy)) return null

  const cols = grid.cols
  const n = cols * grid.rows
  const si = cellIndex(grid, start.cx, start.cy)
  const gi = cellIndex(grid, goal.cx, goal.cy)

  if (si === gi) return { cells: [{ ...start }], cost: 0, expanded: 0 }

  const g = new Float64Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const open = new MinHeap()

  g[si] = 0
  open.push(si, octile(goal.cx - start.cx, goal.cy - start.cy) * H_TIEBREAK)

  let expanded = 0
  while (open.size > 0) {
    const cur = open.pop()
    if (closed[cur] !== 0) continue
    closed[cur] = 1
    expanded++

    if (cur === gi) {
      const cells: Cell[] = []
      let i = cur
      while (i !== -1) {
        const cx = i % cols
        cells.push({ cx, cy: (i - cx) / cols })
        i = came[i]
      }
      cells.reverse()
      return { cells, cost: g[gi], expanded }
    }

    const cx = cur % cols
    const cy = (cur - cx) / cols

    for (const [dx, dy, base] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (!inBounds(grid, nx, ny) || isBlocked(grid, nx, ny)) continue
      // 斜向禁切角：两侧正交格须可通行
      if (dx !== 0 && dy !== 0 && (isBlocked(grid, cx + dx, cy) || isBlocked(grid, cx, cy + dy)))
        continue
      const ni = ny * cols + nx
      if (closed[ni] !== 0) continue
      const step = base * (1 + grid.near[ni] / SOFT_DIV)
      const ng = g[cur] + step
      if (ng < g[ni] - 1e-12) {
        g[ni] = ng
        came[ni] = cur
        open.push(ni, ng + octile(goal.cx - nx, goal.cy - ny) * H_TIEBREAK)
      }
    }
  }
  return null
}
