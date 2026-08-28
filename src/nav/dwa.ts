/* ============================================================
   DWA-lite 动态窗口局部避障
   - 由加速度极限得到 (v, w) 动态窗口，网格采样
   - 每条候选恒速前向模拟 horizon 秒，碰撞（静态膨胀格 /
     动态圆障 / 越界）即弃
   - 评分 = 朝向 + 贴合全局指令 + 速度 + 净空，取最优
   - 全部候选碰撞 → blocked，由上层决定等待或重规划
   ============================================================ */

import { isBlockedWorld, nearCost } from './grid'
import { clamp, wrapAngle } from './purePursuit'
import type { OccupancyGrid, Pose, Twist, Vec2 } from './types'

export type DwaParams = {
  maxV: number
  minV: number
  maxW: number
  /** 线加速度极限 m/s² */
  accV: number
  /** 角加速度极限 rad/s² */
  accW: number
  /** 前向模拟步长（秒） */
  simDt: number
  /** 前向模拟时域（秒） */
  horizon: number
  vSamples: number
  wSamples: number
  robotRadius: number
  headingWeight: number
  desiredWeight: number
  velocityWeight: number
  clearanceWeight: number
  /** 净空归一化上限（米） */
  clearanceCap: number
}

export const DEFAULT_DWA: DwaParams = {
  maxV: 1.1,
  minV: 0,
  maxW: 2.6,
  accV: 1.8,
  accW: 6.5,
  simDt: 0.14,
  horizon: 1.15,
  vSamples: 5,
  wSamples: 9,
  robotRadius: 0.27,
  headingWeight: 0.85,
  desiredWeight: 1.0,
  velocityWeight: 0.35,
  clearanceWeight: 1.2,
  clearanceCap: 0.9,
}

/** 圆形障碍（动态行人等），世界坐标 */
export type DwaObstacle = { x: number; y: number; radius: number }

export type DwaTrajectory = {
  v: number
  w: number
  score: number
  collided: boolean
  endX: number
  endY: number
  endTheta: number
}

export type DwaDecision = {
  v: number
  w: number
  /** 所有候选均碰撞 */
  blocked: boolean
  best: DwaTrajectory | null
  /** 全部候选（供可视化） */
  candidates: DwaTrajectory[]
}

/** 恒速 (v,w) 单步位姿积分（精确圆弧） */
export function integrateTwist(pose: Pose, v: number, w: number, dt: number): Pose {
  if (Math.abs(w) < 1e-6) {
    return {
      x: pose.x + v * Math.cos(pose.theta) * dt,
      y: pose.y + v * Math.sin(pose.theta) * dt,
      theta: pose.theta,
    }
  }
  const theta = pose.theta + w * dt
  const r = v / w
  return {
    x: pose.x + r * (Math.sin(theta) - Math.sin(pose.theta)),
    y: pose.y - r * (Math.cos(theta) - Math.cos(pose.theta)),
    theta,
  }
}

/**
 * 选择当前控制周期的安全速度指令。
 * @param grid      占据栅格（膨胀层已含机器人半径，质点检查即可）
 * @param desired   全局路径跟踪给出的期望速度（纯追踪输出）
 * @param target    前视目标点（朝向评分参考）
 * @param controlDt 控制周期（秒），决定动态窗口宽度
 */
export function dwaSelect(
  grid: OccupancyGrid,
  pose: Pose,
  current: Twist,
  desired: Twist,
  target: Vec2,
  obstacles: DwaObstacle[],
  params: DwaParams = DEFAULT_DWA,
  controlDt = 0.1,
): DwaDecision {
  const vLo = Math.max(params.minV, current.v - params.accV * controlDt)
  const vHi = Math.min(params.maxV, current.v + params.accV * controlDt)
  const wLo = Math.max(-params.maxW, current.w - params.accW * controlDt)
  const wHi = Math.min(params.maxW, current.w + params.accW * controlDt)

  const steps = Math.max(2, Math.round(params.horizon / params.simDt))
  const candidates: DwaTrajectory[] = []
  let best: DwaTrajectory | null = null

  for (let iv = 0; iv < params.vSamples; iv++) {
    const v =
      params.vSamples === 1 ? vLo : vLo + ((vHi - vLo) * iv) / (params.vSamples - 1)
    for (let iw = 0; iw < params.wSamples; iw++) {
      const w =
        params.wSamples === 1 ? wLo : wLo + ((wHi - wLo) * iw) / (params.wSamples - 1)

      let p: Pose = pose
      let collided = false
      let minClear = params.clearanceCap
      for (let s = 0; s < steps; s++) {
        p = integrateTwist(p, v, w, params.simDt)
        if (isBlockedWorld(grid, p.x, p.y)) {
          collided = true
          break
        }
        // 静态软代价折算为保守净空
        const near = nearCost(
          grid,
          Math.floor(p.x / grid.cellSize),
          Math.floor(p.y / grid.cellSize),
        )
        if (near > 0) {
          const staticClear = params.clearanceCap * (1 - near / 44)
          if (staticClear < minClear) minClear = staticClear
        }
        for (const o of obstacles) {
          const d = Math.hypot(o.x - p.x, o.y - p.y) - (o.radius + params.robotRadius)
          if (d <= 0) {
            collided = true
            break
          }
          if (d < minClear) minClear = d
        }
        if (collided) break
      }

      const traj: DwaTrajectory = {
        v,
        w,
        score: -Infinity,
        collided,
        endX: p.x,
        endY: p.y,
        endTheta: p.theta,
      }
      if (!collided) {
        const headingErr = Math.abs(
          wrapAngle(Math.atan2(target.y - p.y, target.x - p.x) - p.theta),
        )
        const heading = 1 - headingErr / Math.PI
        const desiredScore =
          1 -
          (Math.abs(v - desired.v) / Math.max(0.01, params.maxV) +
            Math.abs(w - desired.w) / Math.max(0.01, 2 * params.maxW)) /
            2
        const velocity = params.maxV > 0 ? v / params.maxV : 0
        const clearance = clamp(minClear / params.clearanceCap, 0, 1)
        traj.score =
          params.headingWeight * heading +
          params.desiredWeight * desiredScore +
          params.velocityWeight * velocity +
          params.clearanceWeight * clearance
        if (best === null || traj.score > best.score) best = traj
      }
      candidates.push(traj)
    }
  }

  if (best === null) {
    return { v: 0, w: 0, blocked: true, best: null, candidates }
  }
  return { v: best.v, w: best.w, blocked: false, best, candidates }
}
