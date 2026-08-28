import { describe, expect, it } from 'vitest'
import {
  MAX_STEER,
  WHEELBASE,
  clampSteer,
  curvatureToSteer,
  integrateAckermann,
  integrateArc,
  minTurnRadius,
  omegaToSteer,
  steerToCurvature,
  steerToOmega,
} from '../ackermann'

describe('steering conversions', () => {
  it('clampSteer bounds to ±maxSteer', () => {
    expect(clampSteer(1.2)).toBeCloseTo(MAX_STEER)
    expect(clampSteer(-1.2)).toBeCloseTo(-MAX_STEER)
    expect(clampSteer(0.1)).toBeCloseTo(0.1)
  })

  it('steerToCurvature / curvatureToSteer round-trip', () => {
    for (const d of [-0.5, -0.2, 0, 0.2, 0.5]) {
      expect(curvatureToSteer(steerToCurvature(d))).toBeCloseTo(d, 9)
    }
    // 超出物理极限的曲率夹紧到最大转角
    expect(curvatureToSteer(100)).toBeCloseTo(MAX_STEER)
    expect(curvatureToSteer(-100)).toBeCloseTo(-MAX_STEER)
  })

  it('steerToOmega / omegaToSteer round-trip（含倒车）', () => {
    for (const v of [0.8, -0.3]) {
      for (const d of [-0.4, 0.15, 0.4]) {
        expect(omegaToSteer(v, steerToOmega(v, d))).toBeCloseTo(d, 9)
      }
    }
    // 静止时转角方向无定义 → 0
    expect(omegaToSteer(0, 1.5)).toBe(0)
  })

  it('minTurnRadius matches L/tan(δmax)', () => {
    expect(minTurnRadius()).toBeCloseTo(WHEELBASE / Math.tan(MAX_STEER))
    expect(minTurnRadius()).toBeGreaterThan(0.7)
    expect(minTurnRadius()).toBeLessThan(0.9)
  })
})

describe('integrateArc（v, w 精确圆弧）', () => {
  it('moves straight when w ≈ 0', () => {
    const p = integrateArc({ x: 1, y: 2, theta: 0 }, 1, 0, 0.5)
    expect(p.x).toBeCloseTo(1.5)
    expect(p.y).toBeCloseTo(2)
    expect(p.theta).toBe(0)
  })

  it('follows an exact arc: quarter turn ends offset by radius', () => {
    // v=1, w=π/2 → 半径 r=2/π；1 秒后转过 90°
    const p = integrateArc({ x: 0, y: 0, theta: 0 }, 1, Math.PI / 2, 1)
    const r = 1 / (Math.PI / 2)
    expect(p.theta).toBeCloseTo(Math.PI / 2)
    expect(p.x).toBeCloseTo(r)
    expect(p.y).toBeCloseTo(r)
  })
})

describe('integrateAckermann（v, δ 自行车模型）', () => {
  it('δ=0 走直线', () => {
    const p = integrateAckermann({ x: 0, y: 0, theta: Math.PI / 2 }, 0.8, 0, 1)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0.8)
    expect(p.theta).toBeCloseTo(Math.PI / 2)
  })

  it('恒定 δ 沿半径 L/tan(δ) 的圆弧行驶', () => {
    const delta = 0.3
    const R = WHEELBASE / Math.tan(delta)
    // 走 1/4 圆弧：弧长 = R·π/2
    const p = integrateAckermann({ x: 0, y: 0, theta: 0 }, 1, delta, (R * Math.PI) / 2)
    expect(p.theta).toBeCloseTo(Math.PI / 2)
    expect(p.x).toBeCloseTo(R)
    expect(p.y).toBeCloseTo(R)
  })

  it('倒车反打：v<0、δ<0 时航向角增大（K-turn 基础）', () => {
    const p = integrateAckermann({ x: 0, y: 0, theta: 0 }, -0.3, -MAX_STEER, 0.5)
    expect(p.theta).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(0) // 位置向后退
  })

  it('全打方向盘绕最小转弯半径整圈回到原点', () => {
    const R = minTurnRadius()
    const circumference = 2 * Math.PI * R
    let p = { x: 0, y: 0, theta: 0 }
    const steps = 100
    for (let i = 0; i < steps; i++) {
      p = integrateAckermann(p, 1, MAX_STEER, circumference / steps)
    }
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
  })
})
