/** 书柜布局标定：基于真实 STEP 模型（智能书柜.STEP）归一化后的坐标
 *
 * 立式书柜（Y-up，XZ 居中，地面 y=0，单位米，前端放大 MODEL_SCALE 倍）：
 * - 书槽区：上下两层 × 每层 6 个立插书槽（槽宽 5.3cm、深 40cm，槽底履带送书）
 * - 龙门：悬梁臂横梁组沿两根竖直导轨升降（Y），抓取头沿 X 轴丝杆横移，
 *   夹爪只沿丝杆左右横移，不前后探入；第二层最左侧大隔间是存取交接位
 * - 大隔间：蓝色弹簧夹板夹紧图书，底部履带把书送到夹爪
 * - 送书机器人：从柜后出现，对准大隔间沿 Z 把书放进去；夹爪送书时不动
 * - 塑封：柜座最左侧底层抽屉，书从正面入口沿 Z 走过加热片
 * - 数据库 floor 1/2 → 上层/下层，cell 1..4 → 中间 4 槽
 */

export const FLOORS = 2
export const CELLS_PER_FLOOR = 4

export const MODEL_SCALE = 2

/** 模型整体尺寸（已放大）：宽 × 高 × 深 */
export const MODEL_W = 1.03 * MODEL_SCALE
export const MODEL_H = 1.284 * MODEL_SCALE
export const MODEL_D = 0.926 * MODEL_SCALE

/** cell 1..4 → 书槽中心 X（6 槽中的第 2..5 槽） */
const SLOT_XS = [0.0055, 0.0885, 0.1715, 0.2545].map((v) => v * MODEL_SCALE)

/** floor → 层底 Y（1 = 上层，与格口矩阵 F1 在上一致；2 = 下层） */
const LAYER_BOTTOM_Y: Record<number, number> = {
  1: 0.8405 * MODEL_SCALE,
  2: 0.4405 * MODEL_SCALE,
}

/** 书槽几何（已放大） */
export const SLOT_W = 0.053 * MODEL_SCALE
export const SLOT_DEPTH = 0.4 * MODEL_SCALE
export const SLOT_Z = -0.012 * MODEL_SCALE
/** 层内净高（隔板层距 0.4） */
export const LAYER_CLEAR = 0.4 * MODEL_SCALE
/** 槽底履带厚度：书立在履带面上，置物板对齐该层底板 */
export const BELT_THICKNESS = 0.012 * MODEL_SCALE
/**
 * 立插书几何：X 为书厚（夹持方向）。
 * 送书机器人钳口内宽约 10.1mm，书厚与之对齐，避免穿模。
 * 龙门 CAD 闭合间隙约 20.6mm，持书时再收拢贴住封面。
 */
export const BOOK_THICK = 0.0101
export const BOOK_DEPTH = 0.088
export const BOOK_HEIGHT = 0.3

/** 夹持时爪面压入封面的过盈量（世界）：贴实、避免共面闪面 */
export const GRIP_SQUEEZE = 0.0008

/** 龙门 CAD 闭合时间隙（世界） */
export const GANTRY_CLOSED_GAP = 0.02062
/** 持书摆角下爪垫再平移压入封面的量（模型空间） */
export const GANTRY_GRIP_CLOSE = 0.0006
/** 书心相对 HEAD_REST：略降落入爪垫，Z 对准最窄钳口条 */
export const GANTRY_PAD_LIFT = 0.012
export const GANTRY_BOOK_Z = 0.015

/**
 * 夹取流程：书从履带滑到爪尖 → 尖端合拢 → 内履带把书往后送到持书位。
 * 爪尖朝柜体（喇叭口端），持书位在爪根窄钳口处。
 */
/** 爪尖停书点相对持书位的 Z 偏移（世界） */
export const GANTRY_TIP_SHIFT_Z = -0.147
/** 尖端合拢摆角（弧度）：书在爪尖时，爪尖间隙收到书厚 */
export const GANTRY_TIP_CLAMP_SWING = 0.21
/** 持书摆角（弧度）：书送到爪根后爪尖完全并拢，运输全程保持 */
export const GANTRY_CARRY_SWING = 0.23
/** 接书等待时喇叭口张角 */
export const GANTRY_SWING_RECEIVE = 0.14
/** 履带送书时的导向角 */
export const GANTRY_SWING_GUIDE = 0.05
/** 空载待机角 */
export const GANTRY_SWING_IDLE = 0.035

/** 大隔间夹板休息间隙（模型空间）约 8cm，合拢后压住书厚 */
export const BAY_CLAMP_REST_GAP = 0.08
export const BAY_CLAMP_STROKE = (BAY_CLAMP_REST_GAP - (BOOK_THICK - GRIP_SQUEEZE) / MODEL_SCALE) / 2

/** 抓取头 rest 位姿（head-core 标定中心，对齐上层底板） */
export const HEAD_REST = {
  x: -0.0296 * MODEL_SCALE,
  y: 0.8353 * MODEL_SCALE,
  z: 0.3083 * MODEL_SCALE,
}

export function cellX(cell: number): number {
  return SLOT_XS[cell - 1] ?? 0
}

export function layerBottomY(floor: number): number {
  return LAYER_BOTTOM_Y[floor] ?? 0
}

/**
 * 置物板 / 夹爪工作高度 = 目标层底板。
 * 待机位 HEAD_REST 已标定在上层底板，下层用同一偏置，避免板子停到书腰穿模。
 */
export function cellY(floor: number): number {
  return layerBottomY(floor) + (HEAD_REST.y - layerBottomY(1))
}

/** 在架 / 大隔间书心高度（与夹爪交接高度对齐） */
export function bookCenterY(floor: number): number {
  return cellY(floor) + BOOK_HEIGHT / 2
}

/** 龙门持书时书心的本地 Y（相对未平移的 head 模型） */
export function gantryHoldBookY(): number {
  return HEAD_REST.y + BOOK_HEIGHT / 2 - GANTRY_PAD_LIFT
}

/** 移动阶段停在柜前；夹爪只左右横移，不沿 Z 探入 */
export function cellZ(_floor: number): number {
  return HEAD_REST.z
}

/** 书槽正面前沿（隔间履带在此接书） */
export const SLOT_FRONT_Z = SLOT_Z + SLOT_DEPTH / 2

/** 第二层最左侧大隔间（比 5.3cm 书槽宽：小车送书 / 夹板固定 / 履带交给夹爪） */
export const HOME_FLOOR = 2
export const BAY_X = -0.265 * MODEL_SCALE
export const BAY_W = 0.22 * MODEL_SCALE
export const GRIPPER_HOME_X = BAY_X
export const GANTRY_HOME = { x: GRIPPER_HOME_X, y: cellY(HOME_FLOOR) }

export const BAY_PARK_Z = -SLOT_DEPTH * 0.28
export const BAY_MOUTH_Z = SLOT_DEPTH / 2
/** 大隔间后沿：小车从柜后直着送入 */
export const BAY_REAR_Z = -SLOT_DEPTH * 0.48
/**
 * 交接落点：刚进隔间口即可，不要一次送太深。
 * 后续由履带在夹板夹住后把书送到对面夹爪。
 */
export const BAY_ENTRY_REAR_Z = -SLOT_DEPTH * 0.4
export const BAY_ENTRY_FRONT_Z = SLOT_DEPTH * 0.38
/** 刚入隔间时书的倾角（绕 X，正=向柜后仰倒一点） */
export const BAY_ENTRY_TILT = 0.42

/** 大隔间上方识别摄像头（下层隔间顶板下沿，朝下拍书） */
export const BAY_CAM = {
  x: BAY_X,
  y: layerBottomY(1) - 0.055,
  z: SLOT_Z + 0.04,
}

/** 夹板在模型空间的后沿（世界坐标 = 值 × MODEL_SCALE） */
export const CLAMP_REAR_Z = -0.347 * MODEL_SCALE

/**
 * 送书机器人（机器人.STEP → delivery-robot.glb）。
 * CAD 已是米制 Y-up，夹爪朝 +Z；底盘 30cm 方、高 10cm，整机休息高度 62cm。
 * 不乘 MODEL_SCALE，才能钻进掏空后的底层左格，避免和夹板穿模。
 */
export const ROBOT_CHASSIS = { w: 0.3, h: 0.1, d: 0.3 }
/** CAD 顶部夹爪（夹住书的下部，避免书贯穿立柱） */
export const ROBOT_GRIPPER_JAW_Y = 0.593
/** 书心相对机器人原点：下缘落在钳口内，厚度贴住 10.1mm 内侧面 */
export const ROBOT_BOOK_LOCAL_Y = 0.472 + BOOK_HEIGHT / 2
/** 书心在钳口内靠外（+Z 朝柜体），避免缩在立柱旁 */
export const ROBOT_GRIPPER_HOLD_Z = 0.028
export const ROBOT_GRIPPER_STROKE = 0.035
/** CAD 钳口内宽与书厚一致；书在钳口内略缩，避免共面闪面 */
export const ROBOT_BOOK_FIT = 0.94
/** 立柱顶 / 升降段底（模型空间），用来补中间空档 */
export const ROBOT_COL_TOP_Y = 0.428
export const ROBOT_LIFT_CAD_BOTTOM_Y = 0.378
export const ROBOT_MAST_Z = -0.072
/**
 * 夹爪固定在交接高度：书心对准大隔间里的书，书的下部落在钳口里。
 */
export const ROBOT_GRIPPER_RAISE_Y = bookCenterY(HOME_FLOOR) - ROBOT_BOOK_LOCAL_Y

/** 与引擎停靠计算共用的车体包络（底盘） */
export const CART_BODY = ROBOT_CHASSIS

/**
 * 停在掏空后的底层左格里、夹板下方。
 * 书夹在顶部夹爪里；夹爪只前伸数厘米，不挤进蓝色夹板间隙。
 */
export const CART_DOCK = {
  x: BAY_X,
  z: -0.88,
}

/** 夹爪内履带：负=送向隔间槽口，正=从槽口卷入 */
export const FEED_TO_SLOT_Z = SLOT_FRONT_Z - HEAD_REST.z

/** 送书机器人从柜后出现 */
export const CART_HOME = { x: BAY_X, z: -2.25 }

export type PathPoint = { x: number; z: number }

export const CART_LANE_TO_DOCK: PathPoint[] = [
  CART_HOME,
  { x: BAY_X, z: -1.55 },
  CART_DOCK,
]

export const SLOT_PARK_LOCAL_Z = -SLOT_DEPTH * 0.32
export const SLOT_MOUTH_LOCAL_Z = SLOT_DEPTH / 2

/**
 * 柜底左侧抽屉式塑封通道（对照 STEP shelf 底层左凸包，世界坐标）。
 * 入口朝柜体正面（+Z），书立着沿 −Z 从头走到尾；后沿收在送书机器人停靠位之前。
 */
export const LAMINATE_X = BAY_X
export const LAMINATE_W = 0.2 * MODEL_SCALE
export const LAMINATE_Y0 = 0.04 * MODEL_SCALE
export const LAMINATE_H = 0.178 * MODEL_SCALE
export const LAMINATE_Z_FRONT = 0.172 * MODEL_SCALE
export const LAMINATE_Z_REAR = -0.335 * MODEL_SCALE
export const LAMINATE_BELT = 0.012
export const LAMINATE_HEATER_N = 6

export function laminateChannelLength(): number {
  return LAMINATE_Z_FRONT - LAMINATE_Z_REAR
}

export function laminateBookY(): number {
  return LAMINATE_Y0 + LAMINATE_BELT + BOOK_HEIGHT / 2
}

export function laminateBookZ(progress: number): number {
  const zEnter = LAMINATE_Z_FRONT + BOOK_DEPTH / 2 + 0.06
  const zRear = LAMINATE_Z_REAR + BOOK_DEPTH / 2 + 0.05
  const zShow = LAMINATE_Z_FRONT + BOOK_DEPTH / 2 + 0.14
  if (progress < 0.7) {
    return zEnter + (zRear - zEnter) * easeInOut(progress / 0.7)
  }
  return zRear + (zShow - zRear) * easeInOut((progress - 0.7) / 0.3)
}

export function laminateBookWorld(progress: number): Vec3 {
  return { x: LAMINATE_X, y: laminateBookY(), z: laminateBookZ(progress) }
}

/** CAD 夹爪本地 Z：只伸到夹板后方 */
export function robotGripperLocalZ(reach: number): number {
  return ROBOT_GRIPPER_STROKE * clamp01(reach)
}

export type Vec3 = { x: number; y: number; z: number }

export function robotHeldBookWorld(reach = 1): Vec3 {
  return {
    x: CART_DOCK.x,
    y: bookCenterY(HOME_FLOOR),
    z: CART_DOCK.z + robotGripperLocalZ(reach) + ROBOT_GRIPPER_HOLD_Z,
  }
}

export function bayHeldBookWorld(localZ: number): Vec3 {
  return {
    x: BAY_X,
    y: bookCenterY(HOME_FLOOR),
    z: SLOT_Z + localZ,
  }
}

export function gantryHeldBookWorld(headX: number, headY: number, shiftZ = 0): Vec3 {
  return {
    x: headX,
    y: headY + BOOK_HEIGHT / 2 - GANTRY_PAD_LIFT,
    z: HEAD_REST.z + GANTRY_BOOK_Z + shiftZ,
  }
}

export function slotHeldBookWorld(floor: number, cell: number, localZ: number): Vec3 {
  return {
    x: cellX(cell),
    y: bookCenterY(floor),
    z: SLOT_Z + localZ,
  }
}

/** 交接过渡：夹爪松手后书凭惯性滑出（快出缓收），Y 只缓缓沉入接位，不上抛 */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  const u = clamp01(t)
  const k = 1 - Math.pow(1 - u, 3)
  const ky = easeInOut(u)
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * ky,
    z: a.z + (b.z - a.z) * k,
  }
}

export function easeInOut(t: number): number {
  const k = Math.min(1, Math.max(0, t))
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
}

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

export function lerpYaw(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

/** 沿折线按弧长插值，yaw 朝向下一段前进方向（模型 +Z 为前方） */
export function lerpPath(points: PathPoint[], t: number): PathPoint & { yaw: number } {
  if (points.length === 0) return { x: 0, z: 0, yaw: 0 }
  if (points.length === 1) return { x: points[0].x, z: points[0].z, yaw: 0 }
  const segs = points.length - 1
  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < segs; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z)
    lengths.push(Math.max(len, 1e-6))
    total += lengths[i]
  }
  let dist = clamp01(t) * total
  for (let i = 0; i < segs; i++) {
    if (dist <= lengths[i] || i === segs - 1) {
      const u = dist / lengths[i]
      const x = points[i].x + (points[i + 1].x - points[i].x) * u
      const z = points[i].z + (points[i + 1].z - points[i].z) * u
      const yaw = Math.atan2(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z)
      return { x, z, yaw }
    }
    dist -= lengths[i]
  }
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  return {
    x: last.x,
    z: last.z,
    yaw: Math.atan2(last.x - prev.x, last.z - prev.z),
  }
}
