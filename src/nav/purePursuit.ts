/* ============================================================
   纯追踪（Pure Pursuit）路径跟踪
   - 自适应前视距离 Ld = min + gain·v，夹紧到 [min, max]
   - 曲率 κ = 2·y_local / d²，w = κ·v
   - 目标点在侧后方时原地转向；接近终点线性减速
   坐标系无关：与世界 y 轴方向无耦合
   ============================================================ */

import type { Pose, Vec2 } from './types'

export type PursuitParams = {
  /** 最小前视距离（米） */
  minLookahead: number
  /** 最大前视距离（米） */
  maxLookahead: number
  /** 前视随速度增益：Ld = min + gain·v */
  lookaheadGain: number
  /** 最大线速度 m/s */
  maxV: number
  /** 最大角速度 rad/s */
  maxW: number
  /** 到点容差（米） */
  goalTolerance: number
  /** 终点减速半径（米） */
  slowRadius: number
}

export const DEFAULT_PURSUIT: PursuitParams = {
  minLookahead: 0.45,
  maxLookahead: 1.15,
  lookaheadGain: 0.85,
  maxV: 1.1,
  maxW: 2.6,
  goalTolerance: 0.16,
  slowRadius: 0.95,
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** 归一化角到 (-π, π] */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2)
  if (r > Math.PI) r -= Math.PI * 2
  else if (r <= -Math.PI) r += Math.PI * 2
  return r
}

/**
 * 从 fromIndex 起在窗口内找路径上离 p 最近的点索引（只向前搜索，防回跳）。
 */
export function nearestIndex(path: Vec2[], p: Vec2, fromIndex = 0, windowSize = 60): number {
  const start = clamp(fromIndex, 0, path.length - 1)
  const end = Math.min(path.length - 1, start + windowSize)
  let best = start
  let bestD = Infinity
  for (let i = start; i <= end; i++) {
    const d = (path[i].x - p.x) ** 2 + (path[i].y - p.y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/**
 * 沿路径从 fromIndex 向前找与 origin 距离首次 ≥ dist 的点（线性插值精确化）。
 * 路径剩余不足时返回终点。
 */
export function lookaheadPoint(
  path: Vec2[],
  fromIndex: number,
  origin: Vec2,
  dist: number,
): Vec2 {
  const d2 = dist * dist
  for (let i = Math.max(1, fromIndex); i < path.length; i++) {
    const dx = path[i].x - origin.x
    const dy = path[i].y - origin.y
    if (dx * dx + dy * dy >= d2) {
      // 在 (i-1, i] 段内插值到恰好 dist
      const a = path[i - 1]
      const b = path[i]
      let lo = 0
      let hi = 1
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2
        const mx = a.x + (b.x - a.x) * mid - origin.x
        const my = a.y + (b.y - a.y) * mid - origin.y
        if (mx * mx + my * my >= d2) hi = mid
        else lo = mid
      }
      return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi }
    }
  }
  return { ...path[path.length - 1] }
}

export type PursuitCommand = {
  /** 期望线速度 m/s */
  v: number
  /** 期望角速度 rad/s */
  w: number
  /** 前视目标点 */
  target: Vec2
  /** 本次最近点索引（下次作为 fromIndex 传入） */
  nearest: number
  /** 已到达终点容差内 */
  done: boolean
  /** 距终点距离 */
  goalDist: number
}

/**
 * 单步纯追踪。currentV 用于自适应前视，fromIndex 为上次最近点索引。
 */
export function purePursuit(
  path: Vec2[],
  pose: Pose,
  currentV: number,
  params: PursuitParams = DEFAULT_PURSUIT,
  fromIndex = 0,
): PursuitCommand {
  const goal = path[path.length - 1]
  const goalDist = Math.hypot(goal.x - pose.x, goal.y - pose.y)
  if (path.length < 2 || goalDist <= params.goalTolerance) {
    return { v: 0, w: 0, target: { ...goal }, nearest: path.length - 1, done: true, goalDist }
  }

  const nearest = nearestIndex(path, pose, fromIndex)
  const ld = clamp(
    params.minLookahead + params.lookaheadGain * Math.max(0, currentV),
    params.minLookahead,
    params.maxLookahead,
  )
  const target = lookaheadPoint(path, nearest, pose, Math.min(ld, goalDist))

  const dx = target.x - pose.x
  const dy = target.y - pose.y
  const d = Math.hypot(dx, dy)
  if (d < 1e-6) {
    return { v: 0, w: 0, target, nearest, done: goalDist <= params.goalTolerance, goalDist }
  }

  const alpha = wrapAngle(Math.atan2(dy, dx) - pose.theta)

  // 目标在侧后方：原地转向对准
  if (Math.abs(alpha) > Math.PI * 0.6) {
    return {
      v: 0,
      w: Math.sign(alpha) * params.maxW,
      target,
      nearest,
      done: false,
      goalDist,
    }
  }

  const yLocal = Math.sin(alpha) * d
  const curvature = (2 * yLocal) / (d * d)

  // 终点减速 + 急弯降速
  let v = params.maxV * clamp(goalDist / params.slowRadius, 0.22, 1)
  v = Math.min(v, params.maxV / (1 + 1.7 * Math.abs(curvature)))
  const w = clamp(curvature * v, -params.maxW, params.maxW)

  return { v, w, target, nearest, done: false, goalDist }
}
