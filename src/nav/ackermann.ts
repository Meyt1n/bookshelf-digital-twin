/* ============================================================
   阿克曼转向（自行车模型）运动学
   - 以后轴中心为参考点：θ' = v/L·tan(δ)，x' = v·cosθ，y' = v·sinθ
   - δ 为前轮等效转角（弧度），与 θ 增大方向同号；v 允许为负（倒车）
   - 恒定 (v, δ) 的轨迹是圆弧：曲率 κ = tan(δ)/L，与 (v, w)
     差速接口通过 w = v·κ 精确互换
   本模块是运动学叶子模块：只依赖 types，供纯追踪 / DWA / 仿真器共用
   ============================================================ */

import type { Pose } from './types'

/** 配送小车轴距（米）：底盘约 0.55m 长，前后轴近满长布置 */
export const WHEELBASE = 0.55

/** 前轮最大转角（弧度）≈ 35° */
export const MAX_STEER = (35 * Math.PI) / 180

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** 前轮转角夹紧到物理极限 */
export function clampSteer(delta: number, maxSteer = MAX_STEER): number {
  return clampNum(delta, -maxSteer, maxSteer)
}

/** 前轮转角 → 轨迹曲率 κ = tan(δ)/L（1/米） */
export function steerToCurvature(delta: number, wheelbase = WHEELBASE): number {
  return Math.tan(delta) / wheelbase
}

/** 期望曲率 → 前轮转角 δ = atan(κ·L)，夹紧到最大转角 */
export function curvatureToSteer(
  kappa: number,
  wheelbase = WHEELBASE,
  maxSteer = MAX_STEER,
): number {
  return clampSteer(Math.atan(kappa * wheelbase), maxSteer)
}

/** (v, δ) → 等效角速度 w = v·tan(δ)/L（rad/s） */
export function steerToOmega(v: number, delta: number, wheelbase = WHEELBASE): number {
  return (v * Math.tan(delta)) / wheelbase
}

/**
 * (v, w) → 前轮转角 δ = atan(w·L/v)。
 * v ≈ 0 时转角方向无定义，返回 0（阿克曼车静止时打轮不产生旋转）。
 */
export function omegaToSteer(
  v: number,
  w: number,
  wheelbase = WHEELBASE,
  maxSteer = MAX_STEER,
): number {
  if (Math.abs(v) < 1e-4) return 0
  return clampSteer(Math.atan((w * wheelbase) / v), maxSteer)
}

/** 最小转弯半径 R = L/tan(δmax)（米），L=0.55、δmax=35° 时约 0.785m */
export function minTurnRadius(wheelbase = WHEELBASE, maxSteer = MAX_STEER): number {
  return wheelbase / Math.tan(maxSteer)
}

/** 恒定 (v, w) 单步位姿积分（精确圆弧，w≈0 退化为直线） */
export function integrateArc(pose: Pose, v: number, w: number, dt: number): Pose {
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

/** 恒定 (v, δ) 单步阿克曼积分：等价于沿曲率 tan(δ)/L 的精确圆弧 */
export function integrateAckermann(
  pose: Pose,
  v: number,
  delta: number,
  dt: number,
  wheelbase = WHEELBASE,
): Pose {
  return integrateArc(pose, v, steerToOmega(v, delta, wheelbase), dt)
}
