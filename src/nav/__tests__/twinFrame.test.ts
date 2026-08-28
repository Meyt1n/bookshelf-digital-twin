import { describe, expect, it } from 'vitest'
import { CART_DOCK, CART_HOME } from '../../scene/layout'
import { getNavMap } from '../maps'
import { NAV_TO_SCENE_SCALE, navToScene, sceneToNav } from '../twinFrame'
import type { Pose } from '../types'

const LIB_ANCHOR = getNavMap('library').twinAnchor

describe('navToScene 坐标映射', () => {
  it('锚点（图书馆充电桩，θ=-π/2）精确落在 CART_HOME、yaw=0', () => {
    const s = navToScene({ x: LIB_ANCHOR.x, y: LIB_ANCHOR.y, theta: -Math.PI / 2 }, LIB_ANCHOR)
    expect(s.x).toBeCloseTo(CART_HOME.x)
    expect(s.z).toBeCloseTo(CART_HOME.z)
    expect(s.yaw).toBeCloseTo(0) // dockYaw：车头朝书柜
  })

  it('x 同向、y 反向（导航“向上”= 场景“朝书柜 +z”）等比缩放', () => {
    const a = navToScene({ x: LIB_ANCHOR.x, y: LIB_ANCHOR.y, theta: 0 }, LIB_ANCHOR)
    const right = navToScene({ x: LIB_ANCHOR.x + 1, y: LIB_ANCHOR.y, theta: 0 }, LIB_ANCHOR)
    const up = navToScene({ x: LIB_ANCHOR.x, y: LIB_ANCHOR.y - 1, theta: 0 }, LIB_ANCHOR)
    expect(right.x - a.x).toBeCloseTo(NAV_TO_SCENE_SCALE)
    expect(right.z - a.z).toBeCloseTo(0)
    expect(up.z - a.z).toBeCloseTo(NAV_TO_SCENE_SCALE)
    expect(up.x - a.x).toBeCloseTo(0)
  })

  it('朝向映射 yaw = θ + π/2（场景前向 (dx,dz) = (cosθ, -sinθ)）', () => {
    expect(navToScene({ x: 0, y: 0, theta: 0 }, LIB_ANCHOR).yaw).toBeCloseTo(Math.PI / 2)
    expect(navToScene({ x: 0, y: 0, theta: Math.PI / 2 }, LIB_ANCHOR).yaw).toBeCloseTo(Math.PI)
    expect(navToScene({ x: 0, y: 0, theta: -Math.PI / 2 }, LIB_ANCHOR).yaw).toBeCloseTo(0)
  })

  it('充电桩 → 藏书区方向与 CART_HOME → CART_DOCK 进柜方向一致', () => {
    const stacks = getNavMap('library').stations.find((s) => s.id === 'stacks')!
    const s = navToScene({ x: stacks.pos.x, y: stacks.pos.y, theta: 0 }, LIB_ANCHOR)
    // 藏书区在充电桩“上方”→ 场景 z 增大（朝 CART_DOCK 方向）
    expect(s.z).toBeGreaterThan(CART_HOME.z)
    expect(s.z).toBeLessThanOrEqual(CART_DOCK.z + 0.6)
  })

  it('整张图书馆地图映射后落在书柜周边活动带内（不出地面光环）', () => {
    const map = getNavMap('library')
    for (const [x, y] of [
      [0, 0],
      [map.worldW, 0],
      [0, map.worldH],
      [map.worldW, map.worldH],
    ]) {
      const s = navToScene({ x, y, theta: 0 }, map.twinAnchor)
      expect(Math.hypot(s.x, s.z)).toBeLessThan(4.5)
    }
  })

  it('sceneToNav 是精确逆变换（含角度环绕）', () => {
    const poses: Pose[] = [
      { x: 3.2, y: 7.7, theta: 0.4 },
      { x: 15.1, y: 1.2, theta: -2.9 },
      { x: 9.6, y: 5.5, theta: 3.0 },
    ]
    for (const p of poses) {
      const back = sceneToNav(navToScene(p, LIB_ANCHOR), LIB_ANCHOR)
      expect(back.x).toBeCloseTo(p.x, 9)
      expect(back.y).toBeCloseTo(p.y, 9)
      expect(back.theta).toBeCloseTo(p.theta, 9)
    }
  })

  it('每张地图的 twinAnchor 都映射到 CART_HOME', () => {
    for (const id of ['library', 'warehouse', 'exhibition'] as const) {
      const map = getNavMap(id)
      const s = navToScene(
        { x: map.twinAnchor.x, y: map.twinAnchor.y, theta: -Math.PI / 2 },
        map.twinAnchor,
      )
      expect(s.x).toBeCloseTo(CART_HOME.x)
      expect(s.z).toBeCloseTo(CART_HOME.z)
    }
  })
})
