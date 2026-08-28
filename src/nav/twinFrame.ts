/* ============================================================
   2D 导航世界 ↔ 3D 孪生场景 坐标映射（纯函数，无副作用）

   坐标系约定：
   - 导航世界：米，x 向右，y 向下，theta = atan2(dy, dx)
   - 3D 场景：米，Y-up；小车位姿为 (x, z, yaw)，模型 +Z 为车头，
     yaw = atan2(dx, dz)（与 scene/layout.lerpPath 一致）

   映射为等比仿射（无旋转）：
   - x_nav → x_scene 同向；y_nav → z_scene 反向：
     导航“向上”（-y）= 场景“朝书柜”（+z）
   - 锚点：每张地图的 twinAnchor（默认充电桩）映射到 CART_HOME
     （送书车在柜后的出发位）。图书馆地图充电桩在左下角、
     藏书区在其“上方”，与 CART_HOME → CART_DOCK 的进柜方向一致
   - 比例 NAV_TO_SCENE_SCALE = 0.22：把 19.2m 楼层压缩到书柜
     周边 ~4.2m 的活动带（x ∈ [-0.75, 3.5]，z ∈ [-2.5, 0]），
     不驶出地面光环（半径 3.1m）也不穿越柜体正面
   - 朝向：由 (dx, dz) = (cosθ, -sinθ) 推得 yaw = θ + π/2；
     θ = -π/2（导航向上）↔ yaw = 0（场景朝书柜，即 dockYaw）
   ============================================================ */

import { CART_HOME } from '../scene/layout'
import { wrapAngle } from './purePursuit'
import type { Pose, Vec2 } from './types'

/** 导航米 → 场景米 的等比缩放 */
export const NAV_TO_SCENE_SCALE = 0.22

/** 3D 场景中的小车位姿 */
export type ScenePose = { x: number; z: number; yaw: number }

/** 导航位姿 → 3D 场景位姿。anchor 为当前地图的 twinAnchor */
export function navToScene(pose: Pose, anchor: Vec2): ScenePose {
  return {
    x: CART_HOME.x + NAV_TO_SCENE_SCALE * (pose.x - anchor.x),
    z: CART_HOME.z + NAV_TO_SCENE_SCALE * (anchor.y - pose.y),
    yaw: wrapAngle(pose.theta + Math.PI / 2),
  }
}

/** 3D 场景位姿 → 导航位姿（navToScene 的逆变换） */
export function sceneToNav(scene: ScenePose, anchor: Vec2): Pose {
  return {
    x: anchor.x + (scene.x - CART_HOME.x) / NAV_TO_SCENE_SCALE,
    y: anchor.y - (scene.z - CART_HOME.z) / NAV_TO_SCENE_SCALE,
    theta: wrapAngle(scene.yaw - Math.PI / 2),
  }
}
