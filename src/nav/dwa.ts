/* ============================================================
   DWA-lite 动态窗口局部避障（阿克曼版）
   - 由线加速度极限与前轮打角速率得到 (v, δ) 动态窗口，网格采样；
     v 允许为负 → 死角处可自发倒车挪位（多点调头）
   - 每条候选恒定 (v, δ) 沿精确圆弧前向模拟 horizon 秒，
     碰撞（静态膨胀格 / 动态圆障 / 越界）即弃
   - 评分 = 朝向 + 贴合全局指令 + 速度 + 净空，取最优
   - 全部候选碰撞 → blocked，由上层决定等待或重规划
   ============================================================ */

import { MAX_STEER, WHEELBASE, integrateAckermann } from './ackermann'
import { isBlockedWorld } from './grid'
import { clamp, wrapAngle } from './purePursuit'
import type { AckermannCommand, OccupancyGrid, Pose, Vec2 } from './types'

export type DwaParams = {
  maxV: number
  /** 速度下限（负值 = 允许倒车） */
  minV: number
  /** 线加速度极限 m/s² */
  accV: number
  /** 前轮最大转角（弧度） */
  maxSteer: number
  /** 前轮打角速率极限 rad/s */
  steerRate: number
  /** 轴距（米） */
  wheelbase: number
  /** 前向模拟步长（秒） */
  simDt: number
  /** 前向模拟时域（秒） */
  horizon: number
  vSamples: number
  steerSamples: number
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
  minV: -0.35,
  accV: 1.8,
  maxSteer: MAX_STEER,
  steerRate: 3.4,
  wheelbase: WHEELBASE,
  simDt: 0.14,
  horizon: 1.15,
  vSamples: 5,
  steerSamples: 9,
  robotRadius: 0.27,
  headingWeight: 0.85,
  desiredWeight: 1.0,
  velocityWeight: 0.35,
  clearanceWeight: 1.2,
  clearanceCap: 0.35,
}

/** 圆形障碍（动态行人等），世界坐标 */
export type DwaObstacle = { x: number; y: number; radius: number }

export type DwaTrajectory = {
  v: number
  delta: number
  score: number
  collided: boolean
  endX: number
  endY: number
  endTheta: number
}

export type DwaDecision = {
  v: number
  delta: number
  /** 所有候选均碰撞 */
  blocked: boolean
  best: DwaTrajectory | null
  /** 全部候选（供可视化） */
  candidates: DwaTrajectory[]
}

/**
 * 选择当前控制周期的安全 (v, δ) 指令。
 * @param grid      占据栅格（膨胀层已含机器人半径，质点检查即可）
 * @param current   当前 (v, δ)（动态窗口中心）
 * @param desired   全局路径跟踪给出的期望指令（阿克曼纯追踪输出）
 * @param target    前视目标点（朝向评分参考）
 * @param controlDt 控制周期（秒），决定动态窗口宽度
 */
export function dwaSelect(
  grid: OccupancyGrid,
  pose: Pose,
  current: AckermannCommand,
  desired: AckermannCommand,
  target: Vec2,
  obstacles: DwaObstacle[],
  params: DwaParams = DEFAULT_DWA,
  controlDt = 0.1,
): DwaDecision {
  const vLo = Math.max(params.minV, current.v - params.accV * controlDt)
  const vHi = Math.min(params.maxV, current.v + params.accV * controlDt)
  const dLo = Math.max(-params.maxSteer, current.delta - params.steerRate * controlDt)
  const dHi = Math.min(params.maxSteer, current.delta + params.steerRate * controlDt)

  const steps = Math.max(2, Math.round(params.horizon / params.simDt))
  const candidates: DwaTrajectory[] = []
  let best: DwaTrajectory | null = null

  for (let iv = 0; iv < params.vSamples; iv++) {
    const v =
      params.vSamples === 1 ? vLo : vLo + ((vHi - vLo) * iv) / (params.vSamples - 1)
    for (let id = 0; id < params.steerSamples; id++) {
      const delta =
        params.steerSamples === 1
          ? dLo
          : dLo + ((dHi - dLo) * id) / (params.steerSamples - 1)

      let p: Pose = pose
      let collided = false
      let minClear = params.clearanceCap
      for (let s = 0; s < steps; s++) {
        p = integrateAckermann(p, v, delta, params.simDt, params.wheelbase)
        if (isBlockedWorld(grid, p.x, p.y)) {
          collided = true
          break
        }
        // 净空只统计动态障碍的真实距离；静态几何由禁行格碰撞判定 +
        // A* 软代价保证，若也计入评分会让“原地不动”永远最优（冻结问题）
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
        delta,
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
            Math.abs(delta - desired.delta) / Math.max(0.01, 2 * params.maxSteer)) /
            2
        // 倒车得负速度分：只有前进候选全部碰撞时才选择倒车挪位
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
    return { v: 0, delta: current.delta, blocked: true, best: null, candidates }
  }
  return { v: best.v, delta: best.delta, blocked: false, best, candidates }
}
