/* ============================================================
   任务状态机（从 engine.tickTask 原样抽取，行为不变）

   相位推进与事件文案在此；引擎侧副作用（寄存器、库存、统计、
   龙门段位移、OCR 启动）通过 TaskHost 回调注入，保持模块无
   引擎依赖，可在 node 测试环境直接驱动相位推进。
   ============================================================ */

import { cellX, cellY, cellZ, GANTRY_HOME, HEAD_REST } from '../scene/layout'
import { PHASE_MS } from './kinematics'
import type { EventKind, EventLevel, MotionTask } from '../types'

/** 引擎注入的副作用回调 */
export interface TaskHost {
  pushEvent(kind: EventKind, level: EventLevel, text: string): void
  /** 龙门运动段：lift / traverse / retract / return 相位起点调用 */
  moveGantryTo(now: number, toX: number, toY: number, toZ: number, dur: number): void
  /** 存书 scan 相位：夹板夹紧后启动拍照识别 */
  beginBayScan(task: MotionTask): void
  /** operate 完成：格口占用 / 释放落库 */
  applyInventoryChange(task: MotionTask): void
  /** dispatch → ack：清 newCmdFlag、ACK 置 OK */
  acknowledge(): void
  /** 任务完成落账：存 / 取计数与成员 / 图书 / 格口活跃度 */
  noteCompleted(task: MotionTask): void
}

/**
 * 推进任务状态机一拍（当前相位时长未走完则原样返回）。
 * 返回 false 表示任务已终结（done / fault 走完），引擎应清空 task 引用。
 */
export function tickTask(task: MotionTask, host: TaskHost, now: number): boolean {
  const dur = PHASE_MS[task.phase]
  if (now - task.phaseStart < dur) return true

  const layer = task.floor === 1 ? '上层' : '下层'
  const slotY = cellY(task.floor)
  const slotX = cellX(task.cell)
  const slotZ = cellZ(task.floor)

  switch (task.phase) {
    case 'dispatch': {
      host.acknowledge()
      task.phase = 'ack'
      task.phaseStart = now
      host.pushEvent('motion', 'info', `STM32 应答 ACK=0x00 (OK) · 任务 ${task.id} 进入执行队列`)
      break
    }
    case 'ack': {
      if (task.action === 'store') {
        task.phase = 'deliver'
        task.phaseStart = now
        host.pushEvent('motion', 'info', `送书机器人从柜后将《${task.title}》直送第二层左侧大隔间 · 夹爪原地待命`)
      } else {
        task.phase = 'lift'
        task.phaseStart = now
        host.moveGantryTo(now, GANTRY_HOME.x, slotY, slotZ, PHASE_MS.lift)
        host.pushEvent('motion', 'info', `横梁竖直升降 → ${layer}底板`)
      }
      break
    }
    case 'deliver': {
      if (task.action === 'store') {
        task.phase = 'scan'
        task.phaseStart = now
        host.beginBayScan(task)
        host.pushEvent('motion', 'info', `夹板夹紧《${task.title}》· 顿住，大隔间上方摄像头拍照识别`)
      } else {
        task.phase = 'handoff'
        task.phaseStart = now
      }
      break
    }
    case 'scan': {
      task.phase = 'handoff'
      task.phaseStart = now
      host.pushEvent('motion', 'info', `识别完成 · 大隔间履带将《${task.title}》送到夹爪`)
      break
    }
    case 'handoff': {
      if (task.action === 'store') {
        task.phase = 'lift'
        task.phaseStart = now
        host.moveGantryTo(now, GANTRY_HOME.x, slotY, slotZ, PHASE_MS.lift)
        host.pushEvent('motion', 'info', `横梁竖直升降 → ${layer}底板`)
      } else {
        task.phase = 'done'
        task.phaseStart = now
        host.noteCompleted(task)
        host.pushEvent('take', 'ok', `取书完成 ·《${task.title}》已在第二层左侧大隔间交送书机器人（${task.actor}）`)
      }
      break
    }
    case 'lift': {
      task.phase = 'traverse'
      task.phaseStart = now
      host.moveGantryTo(now, slotX, slotY, slotZ, PHASE_MS.traverse)
      host.pushEvent('motion', 'info', `夹爪沿丝杆横移 → ${layer} ${task.cell} 号隔间`)
      break
    }
    case 'traverse': {
      task.phase = 'operate'
      task.phaseStart = now
      host.pushEvent(
        'motion',
        'info',
        task.action === 'store'
          ? `夹爪到位 · 内履带将《${task.title}》送到槽口，隔间履带送入深处`
          : `夹爪到位 · 隔间履带将《${task.title}》送到槽口，内履带卷入`,
      )
      break
    }
    case 'operate': {
      host.applyInventoryChange(task)
      task.phase = 'retract'
      task.phaseStart = now
      host.moveGantryTo(now, GANTRY_HOME.x, slotY, slotZ, PHASE_MS.retract)
      host.pushEvent('motion', 'info', `夹爪沿丝杆回到左侧大隔间`)
      break
    }
    case 'retract': {
      task.phase = 'return'
      task.phaseStart = now
      host.moveGantryTo(now, GANTRY_HOME.x, GANTRY_HOME.y, HEAD_REST.z, PHASE_MS.return)
      host.pushEvent('motion', 'info', `横梁回到第二层左侧大隔间`)
      break
    }
    case 'return': {
      if (task.action === 'take') {
        task.phase = 'handoff'
        task.phaseStart = now
        host.pushEvent('motion', 'info', `夹爪将《${task.title}》放回左侧大隔间 · 夹板固定后交送书机器人`)
      } else {
        task.phase = 'done'
        task.phaseStart = now
        host.noteCompleted(task)
        host.pushEvent('store', 'ok', `存书完成 ·《${task.title}》已入 ${task.floor} 层 ${task.cell} 号格（${task.actor}）`)
      }
      break
    }
    case 'done': {
      return false
    }
    case 'fault': {
      return false
    }
  }
  return true
}
