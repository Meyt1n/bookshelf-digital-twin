/* ============================================================
   3D 运动学采样（从 engine.ts 原样抽取的纯函数，行为不变）

   每帧由 R3F useFrame 直接调用（绕过 React）。所有函数无副作用：
   引擎把所需状态（当前任务 / 龙门段 / 模块状态 / 导航覆盖）作为
   参数传入，因此可以在 node 测试环境独立验证相位边界与载体交接。
   ============================================================ */

import {
  BAY_ENTRY_FRONT_Z,
  BAY_ENTRY_REAR_Z,
  BAY_ENTRY_TILT,
  BAY_MOUTH_Z,
  BAY_PARK_Z,
  CART_DOCK,
  CART_HOME,
  CART_LANE_TO_DOCK,
  GANTRY_CARRY_SWING,
  GANTRY_HOME,
  GANTRY_SWING_GUIDE,
  GANTRY_SWING_IDLE,
  GANTRY_SWING_RECEIVE,
  GANTRY_TIP_CLAMP_SWING,
  GANTRY_TIP_SHIFT_Z,
  SLOT_MOUTH_LOCAL_Z,
  bayHeldBookWorld,
  cellX,
  cellY,
  clamp01,
  easeInOut,
  gantryHeldBookWorld,
  laminateBookWorld,
  lerpPath,
  lerpVec3,
  robotHeldBookWorld,
  slotHeldBookWorld,
} from '../scene/layout'
import type {
  BayPose,
  BookCarrier,
  BookFlight,
  CartPose,
  GantryPose,
  LaminatePose,
  ModuleState,
  MotionTask,
  TaskAction,
  TaskPhase,
} from '../types'

/* ---------------- 相位常量与助手 ---------------- */

export const PHASE_MS: Record<string, number> = {
  dispatch: 900,
  ack: 700,
  deliver: 3400,
  scan: 3200,
  handoff: 2800,
  lift: 1500,
  traverse: 1300,
  operate: 2800,
  retract: 1300,
  return: 1500,
  done: 500,
  fault: 1300,
}

export const PHASE_LABELS: Record<string, string> = {
  dispatch: '指令下发',
  ack: '控制器应答',
  deliver: '柜后直送大隔间',
  scan: '夹板拍照识别',
  handoff: '履带交夹爪',
  lift: '横梁升降',
  traverse: '夹爪横移',
  operate: '夹爪履带送入',
  retract: '夹爪回左侧',
  return: '回到二层起点',
  done: '完成',
  fault: '急停',
}

/** 存书：机器人把书放入大隔间 → 夹板夹紧顿住 → 摄像头拍照识别 → 履带交夹爪 → 再送入目标格。 */
export function taskFlow(action: TaskAction): TaskPhase[] {
  if (action === 'store') {
    return ['dispatch', 'ack', 'deliver', 'scan', 'handoff', 'lift', 'traverse', 'operate', 'retract', 'return']
  }
  return ['dispatch', 'ack', 'lift', 'traverse', 'operate', 'retract', 'return', 'handoff']
}

export function taskPhaseProgress(task: MotionTask, now = performance.now()): number {
  return clamp01((now - task.phaseStart) / (PHASE_MS[task.phase] ?? 1))
}

/** 龙门当前运动段：from → to 随 easeInOut 插值 */
export type GantrySeg = {
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  start: number
  dur: number
}

/** 2D 导航推送的底盘位姿覆盖：只接管 x/z/yaw/moving */
export type NavCartOverride = { x: number; z: number; yaw: number; moving: boolean }

/* ---------------- 3D 采样（每帧调用，不经过 React） ---------------- */

/** 当前书在哪个机构上；flight = 两个机构之间的过渡 */
export function sampleBookCarrier(task: MotionTask | null, now: number): BookCarrier | null {
  if (!task || task.phase === 'fault') return null
  const p = taskPhaseProgress(task, now)
  if (task.action === 'store') {
    if (task.phase === 'dispatch' || task.phase === 'ack') return 'cart'
    if (task.phase === 'deliver') {
      if (p < 0.36) return 'cart'
      if (p < 0.6) return 'flight'
      return 'bay'
    }
    if (task.phase === 'scan') return 'bay'
    if (task.phase === 'handoff') {
      if (p < 0.5) return 'bay'
      if (p < 0.64) return 'flight'
      return 'gantry'
    }
    if (task.phase === 'lift' || task.phase === 'traverse') return 'gantry'
    if (task.phase === 'operate') {
      if (p < 0.42) return 'gantry'
      if (p < 0.58) return 'flight'
      return 'slot'
    }
    if (task.phase === 'retract' || task.phase === 'return' || task.phase === 'done') return 'slot'
    return null
  }
  if (task.phase === 'dispatch' || task.phase === 'ack' || task.phase === 'lift' || task.phase === 'traverse') {
    return 'slot'
  }
  if (task.phase === 'operate') {
    if (p < 0.34) return 'slot'
    if (p < 0.48) return 'flight'
    return 'gantry'
  }
  if (task.phase === 'retract' || task.phase === 'return') return 'gantry'
  if (task.phase === 'handoff') {
    if (p < 0.12) return 'gantry'
    if (p < 0.32) return 'flight'
    if (p < 0.78) return 'bay'
    if (p < 0.94) return 'flight'
    return 'cart'
  }
  if (task.phase === 'done') return 'cart'
  return null
}

export function sampleBookFlight(task: MotionTask | null, now: number): BookFlight {
  const idle: BookFlight = { active: false, bookId: null, x: 0, y: 0, z: 0, t: 0 }
  if (!task || task.phase === 'fault') return idle
  if (sampleBookCarrier(task, now) !== 'flight') return idle
  const p = taskPhaseProgress(task, now)
  const slotX = cellX(task.cell)
  const slotY = cellY(task.floor)

  let from = { x: 0, y: 0, z: 0 }
  let to = { x: 0, y: 0, z: 0 }
  let t = 0

  if (task.action === 'store' && task.phase === 'deliver') {
    t = clamp01((p - 0.36) / 0.24)
    from = robotHeldBookWorld(1)
    // 落到柜后入口，不要一次塞太深；后续履带再送
    to = bayHeldBookWorld(BAY_ENTRY_REAR_Z)
  } else if (task.action === 'store' && task.phase === 'handoff') {
    t = clamp01((p - 0.5) / 0.14)
    from = bayHeldBookWorld(BAY_MOUTH_Z)
    to = gantryHeldBookWorld(GANTRY_HOME.x, GANTRY_HOME.y, GANTRY_TIP_SHIFT_Z)
  } else if (task.action === 'store' && task.phase === 'operate') {
    t = clamp01((p - 0.42) / 0.16)
    from = gantryHeldBookWorld(slotX, slotY, GANTRY_TIP_SHIFT_Z)
    to = slotHeldBookWorld(task.floor, task.cell, SLOT_MOUTH_LOCAL_Z)
  } else if (task.action === 'take' && task.phase === 'operate') {
    t = clamp01((p - 0.34) / 0.14)
    from = slotHeldBookWorld(task.floor, task.cell, SLOT_MOUTH_LOCAL_Z)
    to = gantryHeldBookWorld(slotX, slotY, GANTRY_TIP_SHIFT_Z)
  } else if (task.action === 'take' && task.phase === 'handoff' && p < 0.32) {
    t = clamp01((p - 0.12) / 0.2)
    from = gantryHeldBookWorld(GANTRY_HOME.x, GANTRY_HOME.y, GANTRY_TIP_SHIFT_Z)
    // 落到柜前入口
    to = bayHeldBookWorld(BAY_ENTRY_FRONT_Z)
  } else if (task.action === 'take' && task.phase === 'handoff') {
    t = clamp01((p - 0.78) / 0.16)
    from = bayHeldBookWorld(BAY_ENTRY_REAR_Z)
    to = robotHeldBookWorld(1)
  } else {
    return idle
  }

  const pos = lerpVec3(from, to, t)
  return { active: true, bookId: task.bookId, x: pos.x, y: pos.y, z: pos.z, t }
}

export function sampleLaminate(
  mod: ModuleState,
  laminateBookId: number | null,
  laminatePresented: boolean,
  now: number,
): LaminatePose {
  const running = mod.status === 'running'
  const done = mod.status === 'done'
  const presenting = laminatePresented && laminateBookId !== null && !running
  const progress = running ? clamp01((now - mod.startedAt) / Math.max(mod.duration, 1)) : presenting || done ? 1 : 0
  const sealed = running ? clamp01((progress - 0.05) / 0.6) : presenting || done ? 1 : 0
  const book = laminateBookWorld(progress)
  const heat = running ? 0.28 + 0.72 * Math.sin(Math.min(progress, 0.7) / 0.7 * Math.PI) : 0.06
  return {
    progress,
    running,
    active: running || done || presenting,
    presenting,
    bookId: running || done || presenting ? laminateBookId : null,
    x: book.x,
    y: book.y,
    z: book.z,
    belt: running && progress < 0.98 ? 1 : 0,
    heat,
    sealed,
  }
}

export function sampleGantry(seg: GantrySeg, task: MotionTask | null, now: number): GantryPose {
  const t = seg.dur <= 0 ? 1 : clamp01((now - seg.start) / seg.dur)
  const k = easeInOut(t)
  const x = seg.fromX + (seg.toX - seg.fromX) * k
  const y = seg.fromY + (seg.toY - seg.fromY) * k
  const z = seg.fromZ + (seg.toZ - seg.fromZ) * k

  let carrying = false
  let swing = GANTRY_SWING_IDLE
  let squeeze = false
  let carryBookId: number | null = null
  let bookShiftZ = 0
  let belt = 0
  if (task && task.phase !== 'fault') {
    carryBookId = task.bookId
    const p = taskPhaseProgress(task, now)
    const onGantry = sampleBookCarrier(task, now) === 'gantry'
    carrying = onGantry
    if (task.action === 'store') {
      if (task.phase === 'deliver' || task.phase === 'scan') {
        swing = GANTRY_SWING_RECEIVE
      } else if (task.phase === 'handoff') {
        if (!onGantry) {
          swing = GANTRY_SWING_RECEIVE
        } else if (p < 0.74) {
          // 书停在爪尖，尖端先合拢夹住
          swing = -GANTRY_TIP_CLAMP_SWING
          bookShiftZ = GANTRY_TIP_SHIFT_Z
        } else if (p < 0.94) {
          // 内履带把书往后送，两爪保持合拢贴着书
          const u = easeInOut((p - 0.74) / 0.2)
          swing = -GANTRY_TIP_CLAMP_SWING
          bookShiftZ = GANTRY_TIP_SHIFT_Z * (1 - u)
          belt = 1
        } else {
          // 书到爪根，爪尖完全并拢 + 爪垫压紧，夹取完成
          swing = -GANTRY_CARRY_SWING
          squeeze = true
        }
      } else if (task.phase === 'lift' || task.phase === 'traverse') {
        swing = onGantry ? -GANTRY_CARRY_SWING : GANTRY_SWING_IDLE
        squeeze = onGantry
      } else if (task.phase === 'operate' && onGantry) {
        if (p < 0.06) {
          swing = -GANTRY_CARRY_SWING
          squeeze = true
        } else {
          // 放书：张开，内履带把书送向爪尖，惯性滑出
          swing = GANTRY_SWING_GUIDE
          bookShiftZ = GANTRY_TIP_SHIFT_Z * easeInOut(clamp01((p - 0.06) / 0.34))
          belt = -1
        }
      }
    } else if (task.action === 'take') {
      if (task.phase === 'operate') {
        if (!onGantry) {
          swing = GANTRY_SWING_RECEIVE
        } else if (p < 0.56) {
          swing = -GANTRY_TIP_CLAMP_SWING
          bookShiftZ = GANTRY_TIP_SHIFT_Z
        } else if (p < 0.8) {
          const u = easeInOut((p - 0.56) / 0.24)
          swing = -GANTRY_TIP_CLAMP_SWING
          bookShiftZ = GANTRY_TIP_SHIFT_Z * (1 - u)
          belt = 1
        } else {
          swing = -GANTRY_CARRY_SWING
          squeeze = true
        }
      } else if (task.phase === 'retract' || task.phase === 'return') {
        swing = onGantry ? -GANTRY_CARRY_SWING : GANTRY_SWING_IDLE
        squeeze = onGantry
      } else if (task.phase === 'handoff') {
        if (onGantry) {
          if (p < 0.02) {
            swing = -GANTRY_CARRY_SWING
            squeeze = true
          } else {
            swing = GANTRY_SWING_GUIDE
            bookShiftZ = GANTRY_TIP_SHIFT_Z * easeInOut(clamp01((p - 0.02) / 0.1))
            belt = -1
          }
        } else {
          swing = GANTRY_SWING_RECEIVE
        }
      }
    }
  }
  return { x, y, z, carrying, swing, squeeze, carryBookId, moving: t < 1, bookShiftZ, belt }
}

export function sampleBay(task: MotionTask | null, now: number): BayPose {
  const idle = {
    clamp: 0.08,
    bookVisible: false,
    bookId: null,
    bookLocalZ: BAY_PARK_Z,
    belt: 0,
    scanFlash: 0,
    bookTilt: 0,
  }
  if (!task || task.phase === 'fault') return idle
  const p = taskPhaseProgress(task, now)
  const bookId = task.bookId
  const visible = sampleBookCarrier(task, now) === 'bay'

  if (task.action === 'store') {
    if (task.phase === 'deliver') {
      // 书刚落到柜后入口：先倾斜，夹板合拢扶正；此阶段不深送
      const clamp = p < 0.62 ? 0.08 : easeInOut(clamp01((p - 0.62) / 0.32))
      const bookTilt = BAY_ENTRY_TILT * (1 - clamp)
      return {
        clamp,
        bookVisible: visible,
        bookId,
        bookLocalZ: BAY_ENTRY_REAR_Z,
        belt: 0,
        scanFlash: 0,
        bookTilt,
      }
    }
    if (task.phase === 'scan') {
      // 保持夹紧直立，履带微微送到识别位
      const inward = easeInOut(clamp01(p / 0.35))
      const flash = p > 0.12 && p < 0.28 ? Math.sin(((p - 0.12) / 0.16) * Math.PI) : 0
      return {
        clamp: 1,
        bookVisible: true,
        bookId,
        bookLocalZ: BAY_ENTRY_REAR_Z + (BAY_PARK_Z - BAY_ENTRY_REAR_Z) * inward,
        belt: inward < 1 ? 1 : 0,
        scanFlash: flash,
        bookTilt: 0,
      }
    }
    if (task.phase === 'handoff') {
      // 夹住送书到柜前口，交给龙门夹爪时才松开
      const out = easeInOut(clamp01(p / 0.48))
      const handing = p >= 0.5
      const clamp = handing ? 1 - easeInOut(clamp01((p - 0.5) / 0.12)) : 1
      return {
        clamp: Math.max(clamp, 0.08),
        bookVisible: visible,
        bookId,
        bookLocalZ: BAY_PARK_Z + (BAY_MOUTH_Z - BAY_PARK_Z) * out,
        belt: visible && !handing && out < 1 ? 1 : 0,
        scanFlash: 0,
        bookTilt: 0,
      }
    }
  } else if (task.action === 'take' && task.phase === 'handoff') {
    // 柜前刚入口 → 倾斜扶正夹住 → 夹住送柜后 → 交机器人夹爪才松开
    if (p < 0.32) {
      return {
        clamp: 0.08,
        bookVisible: false,
        bookId,
        bookLocalZ: BAY_ENTRY_FRONT_Z,
        belt: 0,
        scanFlash: 0,
        bookTilt: BAY_ENTRY_TILT,
      }
    }
    if (p < 0.5) {
      const clamp = easeInOut(clamp01((p - 0.32) / 0.16))
      return {
        clamp: Math.max(clamp, 0.08),
        bookVisible: visible,
        bookId,
        bookLocalZ: BAY_ENTRY_FRONT_Z,
        belt: 0,
        scanFlash: 0,
        bookTilt: BAY_ENTRY_TILT * (1 - clamp),
      }
    }
    if (p < 0.78) {
      const out = easeInOut(clamp01((p - 0.5) / 0.26))
      return {
        clamp: 1,
        bookVisible: visible,
        bookId,
        bookLocalZ: BAY_ENTRY_FRONT_Z + (BAY_ENTRY_REAR_Z - BAY_ENTRY_FRONT_Z) * out,
        belt: visible ? -1 : 0,
        scanFlash: 0,
        bookTilt: 0,
      }
    }
    // 交机器人：松开夹板，书飞向车爪
    const clamp = 1 - easeInOut(clamp01((p - 0.78) / 0.1))
    return {
      clamp: Math.max(clamp, 0.08),
      bookVisible: visible,
      bookId,
      bookLocalZ: BAY_ENTRY_REAR_Z,
      belt: 0,
      scanFlash: 0,
      bookTilt: 0,
    }
  }
  return idle
}

/** 导航同步开启时底盘位姿以 2D 导航为准；机构状态仍由任务逻辑给出 */
export function sampleCart(
  task: MotionTask | null,
  navOverride: NavCartOverride | null,
  now: number,
): CartPose {
  const base = sampleCartFromTask(task, now)
  if (!navOverride) return base
  return { ...base, x: navOverride.x, z: navOverride.z, yaw: navOverride.yaw, moving: navOverride.moving }
}

/** 任务驱动的小车位姿（未开导航同步时的原始行为） */
export function sampleCartFromTask(task: MotionTask | null, now: number): CartPose {
  const dockYaw = 0
  const leaveLane = [...CART_LANE_TO_DOCK].reverse()

  const patrol = (): CartPose => {
    const t = now / 7800
    return {
      x: CART_HOME.x + Math.sin(t) * 0.22,
      z: CART_HOME.z + Math.cos(t) * 0.16,
      yaw: t,
      mast: 0.08,
      reach: 0,
      carrying: false,
      clamped: false,
      carryBookId: null,
      moving: true,
    }
  }

  if (!task || task.phase === 'fault') return patrol()

  const p = taskPhaseProgress(task, now)
  const bookId = task.bookId

  if (task.action === 'store') {
    if (task.phase === 'done') return patrol()
    if (task.phase === 'dispatch' || task.phase === 'ack') {
      const k = task.phase === 'dispatch' ? 0.5 * p : 0.5 + 0.5 * p
      const pos = lerpPath(CART_LANE_TO_DOCK, easeInOut(k))
      const arrived = k > 0.97
      return {
        x: arrived ? CART_DOCK.x : pos.x,
        z: arrived ? CART_DOCK.z : pos.z,
        yaw: arrived ? dockYaw : pos.yaw,
        mast: 0.2 + 0.35 * k,
        reach: 0,
        carrying: true,
        clamped: true,
        carryBookId: bookId,
        moving: !arrived,
      }
    }
    if (task.phase === 'deliver') {
      const reach =
        p < 0.12
          ? 0
          : p < 0.36
            ? easeInOut((p - 0.12) / 0.24)
            : p < 0.42
              ? 1
              : p < 0.64
                ? 1 - easeInOut((p - 0.42) / 0.22)
                : 0
      return {
        x: CART_DOCK.x,
        z: CART_DOCK.z,
        yaw: dockYaw,
        mast: 1,
        reach,
        carrying: sampleBookCarrier(task, now) === 'cart',
        // 臂到位后先松爪，书再凭惯性滑进隔间
        clamped: p < 0.3,
        carryBookId: bookId,
        moving: false,
      }
    }
    if (task.phase === 'scan' || task.phase === 'handoff') {
      return {
        x: CART_DOCK.x,
        z: CART_DOCK.z,
        yaw: dockYaw,
        mast: 0.18,
        reach: 0,
        carrying: false,
        clamped: false,
        carryBookId: null,
        moving: false,
      }
    }
    const leaveT = task.phase === 'lift' ? easeInOut(p) : 1
    const pos = lerpPath(leaveLane, leaveT)
    return {
      x: pos.x,
      z: pos.z,
      yaw: pos.yaw,
      mast: 0.08,
      reach: 0,
      carrying: false,
      clamped: false,
      carryBookId: null,
      moving: leaveT < 1,
    }
  }

  if (['dispatch', 'ack', 'lift', 'traverse', 'operate', 'retract', 'return'].includes(task.phase)) {
    const order = ['dispatch', 'ack', 'lift', 'traverse', 'operate', 'retract', 'return']
    const idx = Math.max(0, order.indexOf(task.phase))
    const k = clamp01((idx + p) / 6.2)
    const pos = lerpPath(CART_LANE_TO_DOCK, easeInOut(k))
    const atDock = k > 0.88
    return {
      x: atDock ? CART_DOCK.x : pos.x,
      z: atDock ? CART_DOCK.z : pos.z,
      yaw: atDock ? dockYaw : pos.yaw,
      mast: atDock ? 0.45 + 0.55 * clamp01((k - 0.88) / 0.12) : 0.1,
      reach: 0,
      carrying: false,
      clamped: false,
      carryBookId: null,
      moving: k < 1,
    }
  }
  if (task.phase === 'handoff') {
    const onCart = sampleBookCarrier(task, now) === 'cart'
    const leaveT = p < 0.94 ? 0 : easeInOut((p - 0.94) / 0.06)
    const pos = lerpPath(leaveLane, leaveT)
    const reach =
      p < 0.7
        ? 0
        : p < 0.78
          ? easeInOut((p - 0.7) / 0.08)
          : p < 0.94
            ? 1
            : Math.max(0, 1 - easeInOut((p - 0.94) / 0.06))
    return {
      x: p < 0.94 ? CART_DOCK.x : pos.x,
      z: p < 0.94 ? CART_DOCK.z : pos.z,
      yaw: p < 0.94 ? dockYaw : pos.yaw,
      mast: p < 0.94 ? 1 : 0.12,
      reach,
      carrying: onCart,
      // 书滑进钳口落稳后再合爪
      clamped: p >= 0.96,
      carryBookId: bookId,
      moving: p >= 0.94,
    }
  }
  if (task.phase === 'done') {
    const pos = lerpPath(leaveLane, 1)
    return {
      x: pos.x,
      z: pos.z,
      yaw: pos.yaw,
      mast: 0.08,
      reach: 0,
      carrying: true,
      clamped: true,
      carryBookId: bookId,
      moving: false,
    }
  }
  return patrol()
}
