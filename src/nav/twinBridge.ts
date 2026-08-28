/* ============================================================
   孪生桥接：配送导航 2D 仿真 ↔ 3D 数字孪生 双向同步

   Nav → Twin：
   - 导航仿真运行且「孪生同步」开启时，每帧把小车位姿经
     twinFrame 映射后推给 twinEngine（位姿覆盖，机构动画不受影响）
   - 导航页离开 / 仿真停止后保留最后位姿（3D 总览小车停在导航
     最后到达的位置）；关闭同步开关才清除覆盖
   - 用户下达新导航目标时，向孪生事件流写一条联动事件

   Twin → Nav：
   - 孪生侧存 / 取书任务启动、阶段推进、完成时，把阶段标签写入
     导航日志；图书馆地图且小车空闲时自动派送联动演出
     （任务启动 → 前往藏书区取送；任务完成 → 返回充电桩）

   注意：本模块是唯一同时依赖 nav 与 twin 的文件，保证
   simulator.ts 可在 node 测试环境独立运行（twin 引擎依赖 window）
   ============================================================ */

import { PHASE_LABELS, twinEngine } from '../twin/engine'
import type { TaskPhase } from '../types'
import { getNavMap } from './maps'
import { navSimulator } from './simulator'
import { navToScene } from './twinFrame'

class TwinBridge {
  private inited = false
  private overrideActive = false
  private lastTaskId: string | null = null
  private lastPhase: TaskPhase | null = null
  private lastGoalLabel: string | null = null

  /** 幂等初始化（导航页首次挂载时调用，之后常驻） */
  init(): void {
    if (this.inited) return
    this.inited = true
    navSimulator.onFrame(this.pushPose)
    navSimulator.subscribe(this.onNavChange)
    twinEngine.subscribe(this.onTwinChange)
  }

  /* ---------- Nav → Twin ---------- */

  /** 每帧推送位姿（rAF 频率，仅导航页挂载期间触发） */
  private pushPose = (): void => {
    const ui = navSimulator.getUiSnapshot()
    if (!ui.twinSync || !ui.running) return
    const rs = navSimulator.getRenderState()
    const anchor = getNavMap(ui.mapId).twinAnchor
    const scene = navToScene(rs.pose, anchor)
    twinEngine.setNavCartOverride({ ...scene, moving: Math.abs(rs.twist.v) > 0.02 })
    this.overrideActive = true
  }

  /** 导航状态变化：处理同步开关与新目标联动事件 */
  private onNavChange = (): void => {
    const ui = navSimulator.getUiSnapshot()
    if (!ui.twinSync) {
      if (this.overrideActive) {
        // 关闭同步 → 3D 小车立即恢复任务驱动动画
        twinEngine.setNavCartOverride(null)
        this.overrideActive = false
        twinEngine.noteNavEvent('配送导航已断开孪生同步 · 小车恢复任务动画')
      }
      this.lastGoalLabel = null
      return
    }
    // 新目标下达 → 写入孪生事件流
    if (ui.phase === 'moving' && ui.goalLabel && ui.goalLabel !== this.lastGoalLabel) {
      this.lastGoalLabel = ui.goalLabel
      twinEngine.noteNavEvent(`配送导航联动 · 小车前往「${ui.goalLabel}」`)
    } else if (ui.phase === 'arrived' && this.lastGoalLabel) {
      twinEngine.noteNavEvent(`配送导航联动 · 已送达「${this.lastGoalLabel}」`, 'ok')
      this.lastGoalLabel = null
    } else if (ui.phase === 'idle') {
      this.lastGoalLabel = null
    }
  }

  /* ---------- Twin → Nav ---------- */

  /** 孪生快照变化：镜像存 / 取书任务状态到导航侧 */
  private onTwinChange = (): void => {
    const task = twinEngine.getSnapshot().task
    const ui = navSimulator.getUiSnapshot()
    if (!ui.twinSync) {
      this.lastTaskId = task?.id ?? null
      this.lastPhase = task?.phase ?? null
      return
    }
    if (!task) {
      this.lastTaskId = null
      this.lastPhase = null
      return
    }
    // 导航空闲时才自动联动派送，不打断用户手动下达的任务
    const navIdle = ui.phase === 'idle' || ui.phase === 'arrived'
    if (task.id !== this.lastTaskId) {
      this.lastTaskId = task.id
      this.lastPhase = task.phase
      navSimulator.noteExternal(
        `孪生任务 ${task.id} 启动 · ${task.action === 'store' ? '存书' : '取书'}《${task.title}》`,
        'info',
      )
      if (ui.running && navIdle && navSimulator.mapId === 'library') {
        navSimulator.dispatchTo('stacks')
      }
      return
    }
    if (task.phase !== this.lastPhase) {
      this.lastPhase = task.phase
      const label = PHASE_LABELS[task.phase] ?? task.phase
      navSimulator.noteExternal(
        `孪生任务 ${task.id} · ${label}`,
        task.phase === 'done' ? 'ok' : task.phase === 'fault' ? 'bad' : 'info',
      )
      if (
        task.phase === 'done' &&
        ui.running &&
        navIdle &&
        navSimulator.mapId === 'library'
      ) {
        navSimulator.dispatchTo('charge')
      }
    }
  }
}

const bridge = new TwinBridge()

/** 导航页挂载时调用；幂等，模块常驻后跨页保持同步 */
export function initTwinBridge(): void {
  bridge.init()
}
