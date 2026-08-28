/** 领域类型：与 bookshelf 主项目的数据结构一一对应，并扩展孪生运行时状态 */

export type TwinMode = 'sim' | 'live'

export type CompartmentStatus = 'free' | 'occupied'

export type BookInfo = {
  id: number
  title: string
  author: string
  category: string
  description?: string
}

export type Compartment = {
  cid: number
  /** 层号，1 = 上层（与主项目 compartments.x 一致） */
  floor: number
  /** 格号 1..4（与主项目 compartments.y 一致） */
  cell: number
  status: CompartmentStatus
  bookId: number | null
}

export type StoredMeta = {
  bookId: number
  storedAt: number | null
  storedBy: string
}

export type TaskAction = 'store' | 'take'

/** 任务阶段：下发 → 应答 →（存书：机器人放入大隔间 → 夹板夹紧拍照识别 → 履带交夹爪）→ 横梁升降 → 夹爪横移 → 送入目标格 → 回到大隔间 →（取书：交车） */
export type TaskPhase =
  | 'dispatch'
  | 'ack'
  | 'deliver'
  | 'scan'
  | 'handoff'
  | 'lift'
  | 'traverse'
  | 'operate'
  | 'retract'
  | 'return'
  | 'done'
  | 'fault'

export type MotionTask = {
  id: string
  action: TaskAction
  cid: number
  floor: number
  cell: number
  bookId: number
  title: string
  actor: string
  phase: TaskPhase
  phaseStart: number
  createdAt: number
}

export type EventKind =
  | 'system'
  | 'store'
  | 'take'
  | 'ocr'
  | 'voice'
  | 'uv'
  | 'laminate'
  | 'link'
  | 'motion'
  | 'diag'

export type EventLevel = 'info' | 'ok' | 'warn'

export type TwinEvent = {
  id: number
  at: number
  kind: EventKind
  level: EventLevel
  text: string
}

export type LinkId = 'ui' | 'flask' | 'pi' | 'stm32'

export type LinkStatus = 'sim' | 'online' | 'offline' | 'unknown'

export type LinkState = {
  id: LinkId
  label: string
  status: LinkStatus
  latencyMs: number | null
}

export type ModuleStatus = 'idle' | 'running' | 'done'

export type ModuleState = {
  status: ModuleStatus
  startedAt: number
  duration: number
}

export type TelemetryPoint = {
  at: number
  temperature: number
  humidity: number
}

export type Telemetry = {
  temperature: number
  humidity: number
  motorCurrent: number
  history: TelemetryPoint[]
  /** 温湿度数据来源：sim / sensor / estimated / cache */
  climateSource: string
}

/** STM32 I2C 寄存器组（services/stm32_protocol.py 的镜像） */
export type Registers = {
  newCmdFlag: number
  cmd: number
  floorId: number
  cellId: number
  ack: number
}

export type OcrStage = {
  at: number
  text: string
  emitted: boolean
}

export type OcrJob = {
  bookId: number
  targetCid: number
  actor: string
  startedAt: number
  stages: OcrStage[]
}

export type TwinStats = {
  storeCount: number
  takeCount: number
  uvCount: number
  laminateCount: number
  memberActivity: Record<string, number>
  /** 每本书的累计流转次数（含模拟历史） */
  bookActivity: Record<number, number>
  /** 每个格口的累计使用次数（含模拟历史） */
  cellActivity: Record<number, number>
}

export type TrendDay = {
  label: string
  store: number
  take: number
}

export type SelfCheckStage = {
  at: number
  text: string
  emitted: boolean
  level: 'ok' | 'info'
}

export type SelfCheck = {
  startedAt: number
  stages: SelfCheckStage[]
  finishedAt: number | null
}

export type TwinSnapshot = {
  mode: TwinMode
  liveHealthy: boolean
  autonomous: boolean
  compartments: Compartment[]
  booksById: Record<number, BookInfo>
  stored: Record<number, StoredMeta>
  offShelfBookIds: number[]
  task: MotionTask | null
  ocr: OcrJob | null
  registers: Registers
  telemetry: Telemetry
  modules: {
    uv: ModuleState
    laminate: ModuleState
    camera: ModuleState
  }
  links: LinkState[]
  events: TwinEvent[]
  stats: TwinStats
  selectedCid: number | null
  hoveredCid: number | null
  weeklyTrend: TrendDay[]
  selfCheck: SelfCheck | null
  bootAt: number
}

export type GantryPose = {
  x: number
  y: number
  z: number
  /** 抓取头上是否载书（书是否跟随爪心） */
  carrying: boolean
  /** 目标摆角：正=喇叭口张开，负=尖端合拢夹书 */
  swing: number
  /** 持书位平行收拢压住封面 */
  squeeze: boolean
  carryBookId: number | null
  moving: boolean
  /** 书相对爪心的 Z：负=送向槽口，正=从槽口卷入 */
  bookShiftZ: number
  /** 夹爪内履带：-1 送入隔间，+1 从槽口卷入 */
  belt: number
}

/** 第二层最左侧大隔间：弹簧夹板夹紧 + 底部履带交书 */
export type BayPose = {
  /** 0…1：夹板合拢量（1=夹紧直立） */
  clamp: number
  bookVisible: boolean
  bookId: number | null
  bookLocalZ: number
  belt: number
  /** 识别闪光 0…1 */
  scanFlash: number
  /** 书绕 X 倾角（弧度）：入隔间时略倾，夹板合拢扶正为 0 */
  bookTilt: number
}

export type CartPose = {
  x: number
  z: number
  yaw: number
  /** 举升 0 行驶高度 … 1 对齐隔间口 */
  mast: number
  /** 货叉伸出 0 收在车头 … 1 沿柜后直送进隔间 */
  reach: number
  carrying: boolean
  /** 两爪是否夹紧：松爪先于书滑出，书到位后再合爪 */
  clamped: boolean
  carryBookId: number | null
  moving: boolean
}

/** 书在两个机构之间的世界坐标过渡 */
export type LaminatePose = {
  progress: number
  running: boolean
  active: boolean
  presenting: boolean
  bookId: number | null
  x: number
  y: number
  z: number
  belt: number
  heat: number
  /** 覆膜覆盖 0…1，随加热行程增长，完成态为 1 */
  sealed: number
}

export type BookCarrier = 'cart' | 'bay' | 'gantry' | 'slot' | 'flight'

export type BookFlight = {
  active: boolean
  bookId: number | null
  x: number
  y: number
  z: number
  t: number
}
