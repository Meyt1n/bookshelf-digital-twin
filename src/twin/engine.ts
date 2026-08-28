import { BOOKS, MEMBERS } from '../catalog'
import type { Member } from '../catalog'
import { CELLS_PER_FLOOR, FLOORS, GANTRY_HOME, HEAD_REST } from '../scene/layout'
import { PHASE_MS, type GantrySeg, type NavCartOverride } from './kinematics'
import * as kin from './kinematics'
import { tickTask as tickTaskMachine, type TaskHost } from './taskMachine'
import type {
  BookInfo,
  BayPose,
  BookCarrier,
  BookFlight,
  CartPose,
  Compartment,
  EventKind,
  EventLevel,
  GantryPose,
  LaminatePose,
  LinkState,
  ModuleState,
  MotionTask,
  OcrJob,
  Registers,
  SelfCheck,
  StoredMeta,
  TaskAction,
  TelemetryPoint,
  TrendDay,
  TwinEvent,
  TwinSnapshot,
} from '../types'
import {
  isTaskAction,
  parseBorrowLogsEnvelope,
  parseClimateEnvelope,
  parseLiveCompartments,
  parseOkEnvelope,
  parseStreamPayload,
  type DeviceClimate,
  type StreamPayload,
} from './liveApi'

const TICK_MS = 250
const TELEMETRY_SAMPLE_MS = 2000
const HISTORY_CAP = 96
const EVENT_CAP = 80

/** 与 services/stm32_protocol.py 对应的指令与应答码 */
export const CMD_FETCH = 0x01
export const CMD_STORE = 0x02
export const ACK_OK = 0x00
export const ACK_FAULT = 0x03
export const ACK_PENDING = 0xff

export const ACK_LABELS: Record<number, string> = {
  [ACK_OK]: 'OK',
  0x01: 'BUSY',
  0x02: 'PARAM_ERR',
  [ACK_FAULT]: 'FAULT',
  0x04: 'UNKNOWN_CMD',
  0x05: 'I2C_ERR',
  [ACK_PENDING]: 'PENDING',
}

/** 相位常量与助手已抽取至 kinematics.ts；此处保持原公共 API 再导出 */
export { PHASE_LABELS, taskFlow, taskPhaseProgress } from './kinematics'

const UV_DURATION = 6000
const LAMINATE_DURATION = 10000
const MODULE_RESET_MS = 2400

type SimBackup = {
  compartments: Compartment[]
  stored: Record<number, StoredMeta>
  booksById: Record<number, BookInfo>
  weeklyTrend: TrendDay[]
  memberActivity: Record<string, number>
  bookActivity: Record<number, number>
  cellActivity: Record<number, number>
  storeCount: number
  takeCount: number
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function idleModule(): ModuleState {
  return { status: 'idle', startedAt: 0, duration: 0 }
}

/** 初始在架分布：与主项目 find_free_compartment 的顺位分配习惯一致 */
const INITIAL_STORED: Array<[number, number, string]> = [
  [2, 7, '周星禾'],
  [3, 19, '周知远'],
  [5, 12, '周妈妈'],
  [6, 1, '周爸爸'],
  [8, 14, '周知远'],
]

export class TwinEngine {
  private listeners = new Set<() => void>()
  private snapshot!: TwinSnapshot

  private mode: 'sim' | 'live' = 'sim'
  private liveHealthy = false
  private autonomous = false
  private compartments: Compartment[] = []
  private booksById: Record<number, BookInfo> = {}
  private stored: Record<number, StoredMeta> = {}
  private task: MotionTask | null = null
  private ocr: OcrJob | null = null
  private registers: Registers = { newCmdFlag: 0, cmd: 0, floorId: 0, cellId: 0, ack: ACK_OK }
  private temperature = 24.6
  private humidity = 52
  private motorCurrent = 0.07
  private history: TelemetryPoint[] = []
  private uv: ModuleState = idleModule()
  private laminate: ModuleState = idleModule()
  private laminateBookId: number | null = null
  private laminatePresented = false
  private camera: ModuleState = idleModule()
  private events: TwinEvent[] = []
  private stats = { storeCount: 0, takeCount: 0, uvCount: 0, laminateCount: 0 }
  private memberActivity: Record<string, number> = {}
  private bookActivity: Record<number, number> = {}
  private cellActivity: Record<number, number> = {}
  private weeklyTrend: TrendDay[] = []
  private selfCheck: SelfCheck | null = null
  private selectedCid: number | null = null
  private hoveredCid: number | null = null
  private bootAt = Date.now()

  private gantrySeg: GantrySeg = {
    fromX: GANTRY_HOME.x,
    fromY: GANTRY_HOME.y,
    fromZ: HEAD_REST.z,
    toX: GANTRY_HOME.x,
    toY: GANTRY_HOME.y,
    toZ: HEAD_REST.z,
    start: 0,
    dur: 1,
  }

  private evtSeq = 1
  private taskSeq = 1
  private nextAutoAt = 0
  private lastSampleAt = 0
  private tickTimer: number | null = null
  private moduleResetTimers: number[] = []
  private pollTimer: number | null = null
  private simBackup: SimBackup | null = null
  private apiBase: string
  private sse: EventSource | null = null
  private sseHealthy = false
  private climateTimer: number | null = null
  private liveClimate: DeviceClimate | null = null

  constructor() {
    this.apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
    this.resetSimWorld()
    this.seedHistory()
    this.pushEvent('system', 'ok', '数字孪生内核已启动 · 仿真时钟就绪')
    this.pushEvent('system', 'info', `已加载书架拓扑 ${FLOORS} 层 × ${CELLS_PER_FLOOR} 格 · 共 ${FLOORS * CELLS_PER_FLOOR} 个格口`)
    this.pushEvent('link', 'info', '遥测通道在线 · 环境采样 0.5 Hz')
    const now = performance.now()
    this.nextAutoAt = now + rand(7000, 12000)
    this.lastSampleAt = 0
    this.rebuildSnapshot()
  }

  /* ---------------- 基础设施 ---------------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): TwinSnapshot => this.snapshot

  start(): void {
    if (this.tickTimer !== null) return
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS)
  }

  dispose(): void {
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer)
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer)
    this.moduleResetTimers.forEach((t) => window.clearTimeout(t))
    this.tickTimer = null
    this.pollTimer = null
    this.disconnectStream()
    this.stopClimatePolling()
  }

  private emit(): void {
    this.rebuildSnapshot()
    this.listeners.forEach((fn) => fn())
  }

  private rebuildSnapshot(): void {
    const offShelf = Object.values(this.booksById)
      .map((b) => b.id)
      .filter((id) => !Object.values(this.stored).some((s) => s.bookId === id))
      .sort((a, b) => a - b)

    this.snapshot = {
      mode: this.mode,
      liveHealthy: this.liveHealthy,
      autonomous: this.autonomous,
      compartments: this.compartments.map((c) => ({ ...c })),
      booksById: { ...this.booksById },
      stored: { ...this.stored },
      offShelfBookIds: offShelf,
      task: this.task ? { ...this.task } : null,
      ocr: this.ocr ? { ...this.ocr, stages: this.ocr.stages.map((s) => ({ ...s })) } : null,
      registers: { ...this.registers },
      telemetry: {
        temperature: this.temperature,
        humidity: this.humidity,
        motorCurrent: this.motorCurrent,
        history: this.history.slice(),
        climateSource: this.mode === 'live' && this.liveClimate ? this.liveClimate.source : 'sim',
      },
      modules: { uv: { ...this.uv }, laminate: { ...this.laminate }, camera: { ...this.camera } },
      links: this.buildLinks(),
      events: this.events.slice(),
      stats: {
        ...this.stats,
        memberActivity: { ...this.memberActivity },
        bookActivity: { ...this.bookActivity },
        cellActivity: { ...this.cellActivity },
      },
      selectedCid: this.selectedCid,
      hoveredCid: this.hoveredCid,
      weeklyTrend: this.buildWeeklyTrend(),
      selfCheck: this.selfCheck
        ? { ...this.selfCheck, stages: this.selfCheck.stages.map((s) => ({ ...s })) }
        : null,
      bootAt: this.bootAt,
    }
  }

  /** 最近 7 天趋势：前 6 天为模拟历史，今天为实时统计 */
  private buildWeeklyTrend(): TrendDay[] {
    const trend = this.weeklyTrend.map((d) => ({ ...d }))
    trend.push({
      label: '今天',
      store: this.stats.storeCount,
      take: this.stats.takeCount,
    })
    return trend
  }

  private buildLinks(): LinkState[] {
    if (this.mode === 'live') {
      return [
        { id: 'ui', label: '孪生驾驶舱', status: 'online', latencyMs: 0 },
        { id: 'flask', label: 'Flask 服务', status: this.liveHealthy ? 'online' : 'offline', latencyMs: this.liveHealthy ? this.liveLatency : null },
        { id: 'pi', label: 'Pi 桥接', status: 'unknown', latencyMs: null },
        { id: 'stm32', label: 'STM32', status: 'unknown', latencyMs: null },
      ]
    }
    return [
      { id: 'ui', label: '孪生驾驶舱', status: 'online', latencyMs: 0 },
      { id: 'flask', label: 'Flask 服务', status: 'sim', latencyMs: Math.round(rand(2, 6)) },
      { id: 'pi', label: 'Pi 桥接', status: 'sim', latencyMs: Math.round(rand(1, 4)) },
      { id: 'stm32', label: 'STM32', status: 'sim', latencyMs: Math.round(rand(1, 3)) },
    ]
  }

  private pushEvent(kind: EventKind, level: EventLevel, text: string): void {
    this.events.unshift({ id: this.evtSeq++, at: Date.now(), kind, level, text })
    if (this.events.length > EVENT_CAP) this.events.length = EVENT_CAP
  }

  /* ---------------- 世界初始化 ---------------- */

  private resetSimWorld(): void {
    this.booksById = {}
    BOOKS.forEach((b) => {
      this.booksById[b.id] = b
    })
    this.compartments = []
    for (let floor = 1; floor <= FLOORS; floor++) {
      for (let cell = 1; cell <= CELLS_PER_FLOOR; cell++) {
        const cid = (floor - 1) * CELLS_PER_FLOOR + cell
        this.compartments.push({ cid, floor, cell, status: 'free', bookId: null })
      }
    }
    this.stored = {}
    const base = Date.now() - 1000 * 60 * 60 * 20
    INITIAL_STORED.forEach(([cid, bookId, by], i) => {
      const comp = this.compartments.find((c) => c.cid === cid)
      if (!comp) return
      comp.status = 'occupied'
      comp.bookId = bookId
      this.stored[cid] = { bookId, storedAt: base + i * 1000 * 60 * 137, storedBy: by }
    })
  }

  /** 植入模拟历史：过去 6 天趋势、格口与书籍的累计使用量 */
  private seedHistory(): void {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const today = new Date().getDay()
    this.weeklyTrend = []
    for (let i = 6; i >= 1; i--) {
      const idx = (today - i + 7) % 7
      this.weeklyTrend.push({
        label: dayNames[idx],
        store: Math.round(rand(2, 7)),
        take: Math.round(rand(3, 9)),
      })
    }
    for (const comp of this.compartments) {
      this.cellActivity[comp.cid] = Math.round(rand(2, 14))
    }
    for (const book of BOOKS) {
      this.bookActivity[book.id] = Math.round(rand(0, 9))
    }
    for (const member of MEMBERS) {
      this.memberActivity[member.name] = Math.round(rand(2, 9))
    }
  }

  /* ---------------- 主循环 ---------------- */

  private tick(): void {
    const now = performance.now()
    this.tickTelemetry(now)
    this.tickModules(now)
    this.tickTask(now)
    this.tickOcr(now)
    this.tickSelfCheck(now)
    this.tickAutonomous(now)
    this.emit()
  }

  private tickSelfCheck(now: number): void {
    const sc = this.selfCheck
    if (!sc) return
    for (const stage of sc.stages) {
      if (!stage.emitted && now - sc.startedAt >= stage.at) {
        stage.emitted = true
        this.pushEvent('diag', stage.level === 'ok' ? 'ok' : 'info', stage.text)
      }
    }
    const allDone = sc.stages.every((s) => s.emitted)
    if (allDone && sc.finishedAt === null) {
      sc.finishedAt = now
      const timer = window.setTimeout(() => {
        this.selfCheck = null
        this.emit()
      }, 3200)
      this.moduleResetTimers.push(timer)
    }
  }

  private tickTelemetry(now: number): void {
    if (this.mode === 'live' && this.liveClimate) {
      // 联机：温湿度向实体遥测值平滑收敛（不做随机游走）
      this.temperature += (this.liveClimate.temperature - this.temperature) * 0.2
      this.humidity += (this.liveClimate.humidity - this.humidity) * 0.2
    } else {
      this.temperature = Math.min(26.8, Math.max(22.5, this.temperature + rand(-0.06, 0.06)))
      this.humidity = Math.min(62, Math.max(45, this.humidity + rand(-0.3, 0.3)))
    }
    const busy =
      this.task &&
      ['deliver', 'handoff', 'lift', 'traverse', 'operate', 'retract', 'return'].includes(this.task.phase)
    const target = busy ? rand(0.78, 1.05) : this.ocr ? 0.16 : 0.07
    this.motorCurrent += (target - this.motorCurrent) * 0.35
    if (now - this.lastSampleAt >= TELEMETRY_SAMPLE_MS) {
      this.lastSampleAt = now
      this.history.push({ at: Date.now(), temperature: this.temperature, humidity: this.humidity })
      if (this.history.length > HISTORY_CAP) this.history.shift()
    }
  }

  private tickModules(now: number): void {
    for (const [key, mod] of [
      ['uv', this.uv],
      ['laminate', this.laminate],
    ] as Array<['uv' | 'laminate', ModuleState]>) {
      if (mod.status === 'running' && now - mod.startedAt >= mod.duration) {
        mod.status = 'done'
        if (key === 'uv') {
          this.stats.uvCount++
          this.pushEvent('uv', 'ok', '紫外线消毒流程已完成 · 柜内环境已更新')
        } else {
          this.stats.laminateCount++
          this.laminatePresented = true
          this.pushEvent('laminate', 'ok', '塑封完成 · 整本覆膜已封口，成品停在抽屉入口')
        }
        const timer = window.setTimeout(() => {
          if (mod.status === 'done') {
            mod.status = 'idle'
            this.emit()
          }
        }, MODULE_RESET_MS)
        this.moduleResetTimers.push(timer)
      }
    }
  }

  private tickOcr(now: number): void {
    if (!this.ocr) return
    for (const stage of this.ocr.stages) {
      if (!stage.emitted && now - this.ocr.startedAt >= stage.at) {
        stage.emitted = true
        this.pushEvent('ocr', 'info', stage.text)
      }
    }
    const last = this.ocr.stages[this.ocr.stages.length - 1]
    if (last.emitted && this.task?.phase !== 'scan') {
      this.ocr = null
      this.camera.status = 'idle'
    }
  }

  private moveGantryTo(now: number, toX: number, toY: number, toZ: number, dur: number): void {
    const pose = this.sampleGantry(now)
    this.gantrySeg = {
      fromX: pose.x,
      fromY: pose.y,
      fromZ: pose.z,
      toX,
      toY,
      toZ,
      start: now,
      dur,
    }
  }

  /** 引擎注入给任务状态机的副作用回调（taskMachine.ts 保持无引擎依赖） */
  private taskHost: TaskHost = {
    pushEvent: (kind, level, text) => this.pushEvent(kind, level, text),
    moveGantryTo: (now, toX, toY, toZ, dur) => this.moveGantryTo(now, toX, toY, toZ, dur),
    beginBayScan: (task) => this.beginBayScan(task),
    applyInventoryChange: (task) => this.applyInventoryChange(task),
    acknowledge: () => {
      this.registers.newCmdFlag = 0
      this.registers.ack = ACK_OK
    },
    noteCompleted: (task) => {
      if (task.action === 'store') this.stats.storeCount++
      else this.stats.takeCount++
      this.memberActivity[task.actor] = (this.memberActivity[task.actor] ?? 0) + 1
      this.bookActivity[task.bookId] = (this.bookActivity[task.bookId] ?? 0) + 1
      this.cellActivity[task.cid] = (this.cellActivity[task.cid] ?? 0) + 1
    },
  }

  /** 相位推进委托给 taskMachine；返回 false 表示任务终结 */
  private tickTask(now: number): void {
    if (!this.task) return
    if (!tickTaskMachine(this.task, this.taskHost, now)) {
      this.task = null
    }
  }

  private applyInventoryChange(task: MotionTask): void {
    const comp = this.compartments.find((c) => c.cid === task.cid)
    if (!comp) return
    if (task.action === 'store') {
      comp.status = 'occupied'
      comp.bookId = task.bookId
      this.stored[task.cid] = { bookId: task.bookId, storedAt: Date.now(), storedBy: task.actor }
    } else {
      comp.status = 'free'
      comp.bookId = null
      delete this.stored[task.cid]
    }
  }

  private tickAutonomous(now: number): void {
    if (!this.autonomous || this.mode !== 'sim') return
    if (this.task || this.ocr) return
    if (now < this.nextAutoAt) return
    this.nextAutoAt = now + rand(11000, 22000)

    const member = pick(MEMBERS)
    const storedCids = Object.keys(this.stored).map(Number)
    const offShelf = this.snapshot.offShelfBookIds
    const freeCids = this.compartments.filter((c) => c.status === 'free').map((c) => c.cid)

    const canTake = storedCids.length > 0
    const canStore = offShelf.length > 0 && freeCids.length > 0
    if (!canTake && !canStore) return

    const doTake = canTake && (!canStore || Math.random() < 0.55)
    if (doTake) {
      const cid = pick(storedCids)
      const book = this.booksById[this.stored[cid].bookId]
      this.emitVoiceIntent(member, book, cid)
      this.startTask('take', cid, book.id, `${member.name} · 语音`)
    } else {
      const bookId = pick(offShelf)
      const book = this.booksById[bookId]
      this.pushEvent('voice', 'info', `${member.avatar} ${member.name} 在实体端发起存书 ·《${book.title}》`)
      this.beginOcrStore(bookId, `${member.name} · 现场`)
    }
  }

  private emitVoiceIntent(member: Member, book: BookInfo, cid: number): void {
    const phrases = [
      `小燕，帮我取《${book.title}》`,
      `我想看《${book.title}》`,
      `把《${book.title}》拿出来`,
    ]
    this.pushEvent('voice', 'info', `${member.avatar} ${member.name}：「${pick(phrases)}」`)
    this.pushEvent('voice', 'info', `语音意图解析 take · 命中《${book.title}》 → 格口 ${cid}`)
  }

  /* ---------------- 指令入口 ---------------- */

  setSelected(cid: number | null): void {
    this.selectedCid = cid
    this.emit()
  }

  setHovered(cid: number | null): void {
    if (this.hoveredCid === cid) return
    this.hoveredCid = cid
    this.emit()
  }

  setAutonomous(on: boolean): void {
    this.autonomous = on
    this.pushEvent('system', 'info', on ? '自主活动仿真已开启 · 家庭成员行为将自动生成' : '自主活动仿真已暂停')
    this.emit()
  }

  /* ---------------- 导航联动（配送导航页经 twinBridge 桥接） ---------------- */

  /** 2D 导航推送的底盘位姿覆盖：只接管 x/z/yaw/moving，机构动画不受影响 */
  private navOverride: NavCartOverride | null = null

  /** 设置 / 清除导航位姿覆盖（null = 恢复任务驱动的小车动画） */
  setNavCartOverride(pose: NavCartOverride | null): void {
    this.navOverride = pose
  }

  isNavSyncActive(): boolean {
    return this.navOverride !== null
  }

  /** 导航侧事件写入孪生事件流（如「小车前往服务台」） */
  noteNavEvent(text: string, level: EventLevel = 'info'): void {
    this.pushEvent('motion', level, text)
    this.emit()
  }

  /** 演示剧本等编排层写入事件流（各幕进度对观众可见） */
  noteScriptEvent(text: string, level: EventLevel = 'info'): void {
    this.pushEvent('system', level, text)
    this.emit()
  }

  private startTask(action: TaskAction, cid: number, bookId: number, actor: string): void {
    const comp = this.compartments.find((c) => c.cid === cid)
    if (!comp || this.task) return
    const book = this.booksById[bookId]
    const now = performance.now()
    const cmd = action === 'store' ? CMD_STORE : CMD_FETCH
    this.registers = {
      newCmdFlag: 1,
      cmd,
      floorId: comp.floor,
      cellId: comp.cell - 1,
      ack: ACK_PENDING,
    }
    this.task = {
      id: `T${String(this.taskSeq++).padStart(3, '0')}`,
      action,
      cid,
      floor: comp.floor,
      cell: comp.cell,
      bookId,
      title: book?.title ?? '未知图书',
      actor,
      phase: 'dispatch',
      phaseStart: now,
      createdAt: Date.now(),
    }
    const cmdHex = `0x${cmd.toString(16).padStart(2, '0').toUpperCase()}`
    this.pushEvent(
      'motion',
      'info',
      `指令下发 CMD=${cmdHex} FLOOR=${comp.floor} CELL=${comp.cell - 1} · I2C 写入寄存器组`,
    )
    this.emit()
  }

  /** 指令台：模拟拍照存书（机器人送入大隔间，夹板夹紧后摄像头识别） */
  commandCaptureStore(): void {
    if (this.mode === 'live') {
      this.pushEvent('system', 'warn', '联机模式请在实体端拍照存书')
      this.emit()
      return
    }
    this.autonomous = false
    if (this.task || this.ocr) {
      this.pushEvent('system', 'warn', '当前已有任务在执行，请稍候')
      this.emit()
      return
    }
    const offShelf = this.snapshot.offShelfBookIds
    if (offShelf.length === 0) {
      this.pushEvent('system', 'warn', '书目中已没有可入库的图书')
      this.emit()
      return
    }
    const bookId = pick(offShelf)
    this.beginOcrStore(bookId, '控制台')
  }

  /** 指令台：将指定图书存入指定格口 */
  commandStoreTo(cid: number, bookId: number): void {
    if (this.mode === 'live') {
      this.pushEvent('system', 'warn', '联机模式请在实体端存书')
      this.emit()
      return
    }
    this.autonomous = false
    if (this.task || this.ocr) {
      this.pushEvent('system', 'warn', '当前已有任务在执行，请稍候')
      this.emit()
      return
    }
    const comp = this.compartments.find((c) => c.cid === cid)
    if (!comp || comp.status !== 'free') return
    this.beginOcrStore(bookId, '控制台', cid)
  }

  /** 图书资产页：指定图书入库（顺位分配格口） */
  commandStoreBook(bookId: number): void {
    if (this.mode === 'live') {
      this.pushEvent('system', 'warn', '联机模式请在实体端存书')
      this.emit()
      return
    }
    this.autonomous = false
    if (this.task || this.ocr) {
      this.pushEvent('system', 'warn', '当前已有任务在执行，请稍候')
      this.emit()
      return
    }
    if (!this.snapshot.offShelfBookIds.includes(bookId)) return
    this.beginOcrStore(bookId, '控制台')
  }

  /** 设备诊断页：模拟 pi_bridge 自检流程 */
  commandSelfCheck(): void {
    if (this.selfCheck) return
    this.selfCheck = {
      startedAt: performance.now(),
      finishedAt: null,
      stages: [
        { at: 0, text: '自检开始 · 扫描 I2C 总线…', emitted: false, level: 'info' },
        { at: 750, text: 'I2C 探测 0x30 应答正常 · 总线时钟 100kHz', emitted: false, level: 'ok' },
        { at: 1500, text: '寄存器读写回环测试通过（5/5）', emitted: false, level: 'ok' },
        { at: 2350, text: '横移 / 升降电机微动测试完成 · 编码器反馈一致', emitted: false, level: 'ok' },
        { at: 3150, text: '温湿度传感器采样正常 · 摄像头帧率 30fps', emitted: false, level: 'ok' },
        { at: 3900, text: 'UV 灯管 / 塑封热压辊通电检测通过', emitted: false, level: 'ok' },
        { at: 4600, text: '自检完成 · 全部 6 项通过，系统健康', emitted: false, level: 'ok' },
      ],
    }
    this.emit()
  }

  private beginOcrStore(bookId: number, actor: string, targetCid?: number): void {
    const free = this.compartments.find((c) => c.status === 'free' && (targetCid === undefined || c.cid === targetCid))
    if (!free) {
      this.pushEvent('system', 'warn', '没有空闲格口，无法存书')
      this.emit()
      return
    }
    const book = this.booksById[bookId]
    this.pushEvent('motion', 'info', `拍照存书 · 送书机器人将把《${book.title}》送入大隔间，夹紧后再拍照识别`)
    this.startTask('store', free.cid, bookId, actor)
  }

  /** 夹板夹紧后，大隔间上方摄像头对书封拍照识别 */
  private beginBayScan(task: MotionTask): void {
    const book = this.booksById[task.bookId]
    this.camera.status = 'running'
    this.camera.startedAt = performance.now()
    this.camera.duration = PHASE_MS.scan
    this.ocr = {
      bookId: task.bookId,
      targetCid: task.cid,
      actor: task.actor,
      startedAt: performance.now(),
      stages: [
        { at: 0, text: '夹板已夹紧 · 摄像头对准书封', emitted: false },
        { at: 450, text: '闪光灯触发 · 采集书封画面', emitted: false },
        { at: 1100, text: 'YOLO ROI 检测 · 命中书名 / 作者区域', emitted: false },
        { at: 1950, text: `PaddleOCR 识别 → 「${book.title}」「${book.author}」`, emitted: false },
        { at: 2800, text: `图书匹配成功 · 分配 ${task.floor} 层 ${task.cell} 号格`, emitted: false },
      ],
    }
  }

  /** 指令台 / 格口面板：取书 */
  commandTake(cid: number, actor = '控制台'): void {
    if (this.task || this.ocr) {
      this.pushEvent('system', 'warn', '当前已有任务在执行，请稍候')
      this.emit()
      return
    }
    const meta = this.stored[cid]
    if (!meta) return
    if (this.mode === 'live') {
      void this.liveTake(cid)
      return
    }
    this.startTask('take', cid, meta.bookId, actor)
  }

  /** 指令台：按书名模糊取书（对应 /api/take_by_text） */
  commandTakeByText(text: string): void {
    const kw = text.replace(/[《》\s]/g, '').toLowerCase()
    if (!kw) return
    let best: { cid: number; bookId: number; score: number } | null = null
    for (const [cidStr, meta] of Object.entries(this.stored)) {
      const book = this.booksById[meta.bookId]
      if (!book) continue
      const title = book.title.toLowerCase()
      let score = 0
      if (title === kw) score = 100
      else if (title.includes(kw) || kw.includes(title)) score = 80
      else {
        const hits = [...kw].filter((ch) => title.includes(ch)).length
        score = (hits / Math.max(kw.length, 1)) * 60
      }
      if (score > 40 && (!best || score > best.score)) {
        best = { cid: Number(cidStr), bookId: meta.bookId, score }
      }
    }
    if (!best) {
      this.pushEvent('take', 'warn', `未在书架上找到与「${text}」匹配的图书`)
      this.emit()
      return
    }
    const book = this.booksById[best.bookId]
    this.pushEvent('take', 'info', `模糊匹配「${text}」 → 《${book.title}》（格口 ${best.cid}）`)
    this.commandTake(best.cid)
  }

  commandUv(): void {
    if (this.uv.status === 'running') return
    this.uv = { status: 'running', startedAt: performance.now(), duration: UV_DURATION }
    this.pushEvent('uv', 'info', '紫外线消毒模块已启动 · 灯管功率 36W · 预计 6s')
    this.emit()
  }

  commandLaminate(): void {
    if (this.laminate.status === 'running') return
    this.laminatePresented = false
    this.laminateBookId = this.pickLaminateBook()
    this.laminate = { status: 'running', startedAt: performance.now(), duration: LAMINATE_DURATION }
    const book = this.laminateBookId !== null ? this.booksById[this.laminateBookId] : null
    this.pushEvent(
      'laminate',
      'info',
      book
        ? `柜底塑封抽屉启动 · 《${book.title}》从正面入口送入，沿加热片走完整本`
        : '柜底塑封抽屉启动 · 加热片升温中',
    )
    this.emit()
  }

  private pickLaminateBook(): number | null {
    const busyId =
      this.task && this.task.phase !== 'done' && this.task.phase !== 'fault' ? this.task.bookId : null
    const storedIds = new Set(Object.values(this.stored).map((s) => s.bookId))
    const offShelf = Object.values(this.booksById).filter((b) => !storedIds.has(b.id) && b.id !== busyId)
    if (offShelf.length > 0) return offShelf[0].id
    const onShelf = this.compartments
      .map((c) => c.bookId)
      .filter((id): id is number => id !== null && id !== busyId)
    return onShelf[0] ?? Object.values(this.booksById)[0]?.id ?? null
  }

  /** 急停：中断任务与 OCR，ACK 置 FAULT */
  commandEmergencyStop(): void {
    const hadWork = Boolean(this.task || this.ocr)
    if (this.ocr) {
      this.ocr = null
      this.camera.status = 'idle'
    }
    if (this.task && this.task.phase !== 'done' && this.task.phase !== 'fault') {
      const now = performance.now()
      this.task.phase = 'fault'
      this.task.phaseStart = now
      this.registers.ack = ACK_FAULT
      this.registers.newCmdFlag = 0
      const pose = this.sampleGantry(now)
      this.gantrySeg = {
        fromX: pose.x,
        fromY: pose.y,
        fromZ: pose.z,
        toX: GANTRY_HOME.x,
        toY: GANTRY_HOME.y,
        toZ: HEAD_REST.z,
        start: now,
        dur: PHASE_MS.fault,
      }
    }
    if (hadWork) {
        this.pushEvent('motion', 'warn', '急停触发 · ACK=0x03 (FAULT) · 机构返回第二层左侧大隔间')
    } else {
      this.pushEvent('system', 'info', '急停检查 · 当前无执行中任务')
    }
    this.emit()
  }

  /* ---------------- 联机模式 ---------------- */

  private liveLatency = 0

  async enterLive(): Promise<void> {
    if (this.mode === 'live') return
    this.pushEvent('link', 'info', `正在探测实体书架服务 ${this.apiBase || '(同源 /api)'} ...`)
    this.emit()
    // 先备份仿真世界：探测成功的 pollLive 会立刻套用实体快照，
    // 备份放在探测之后会把联机数据当成"仿真现场"，退出联机时无法还原
    const backup: SimBackup = {
      compartments: this.compartments.map((c) => ({ ...c })),
      stored: { ...this.stored },
      booksById: { ...this.booksById },
      weeklyTrend: this.weeklyTrend.map((d) => ({ ...d })),
      memberActivity: { ...this.memberActivity },
      bookActivity: { ...this.bookActivity },
      cellActivity: { ...this.cellActivity },
      storeCount: this.stats.storeCount,
      takeCount: this.stats.takeCount,
    }
    const ok = await this.pollLive(true)
    if (!ok) {
      this.pushEvent('link', 'warn', '联机失败 · Flask 服务不可达，保持仿真模式')
      this.emit()
      return
    }
    this.simBackup = backup
    this.mode = 'live'
    this.autonomous = false
    this.pushEvent('link', 'ok', '已联机 · 孪生体与实体书架数据同步中')
    this.restartPoll(3000)
    this.connectStream()
    void this.loadLiveStats()
    this.startClimatePolling()
    this.emit()
  }

  exitLive(): void {
    if (this.mode !== 'live') return
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.disconnectStream()
    this.stopClimatePolling()
    this.mode = 'sim'
    this.liveHealthy = false
    if (this.simBackup) {
      this.compartments = this.simBackup.compartments
      this.stored = this.simBackup.stored
      this.booksById = this.simBackup.booksById
      this.weeklyTrend = this.simBackup.weeklyTrend
      this.memberActivity = this.simBackup.memberActivity
      this.bookActivity = this.simBackup.bookActivity
      this.cellActivity = this.simBackup.cellActivity
      this.stats.storeCount = this.simBackup.storeCount
      this.stats.takeCount = this.simBackup.takeCount
      this.simBackup = null
    }
    this.clearSyntheticBooks()
    this.pushEvent('link', 'info', '已断开联机 · 回到仿真模式')
    this.emit()
  }

  /**
   * 清理联机期间为实体书目生成的合成条目（id ≥ 900）。
   * 快照回滚通常已把 booksById 还原，此处兜底防止合成书泄漏进仿真世界。
   */
  private clearSyntheticBooks(): void {
    for (const key of Object.keys(this.booksById)) {
      const id = Number(key)
      if (id >= 900) delete this.booksById[id]
    }
  }

  /* ---------------- 实体温湿度遥测 ---------------- */

  private startClimatePolling(): void {
    if (this.climateTimer !== null) return
    const fetchClimate = async () => {
      try {
        const res = await fetch(`${this.apiBase}/api/climate?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const climate = parseClimateEnvelope(await res.json())
        if (!climate) return
        const first = this.liveClimate === null
        this.liveClimate = climate
        if (first) {
          const sourceLabel =
            climate.source === 'sensor' ? '柜内传感器' : climate.source === 'estimated' ? '天气耦合估算' : '缓存'
          this.pushEvent('link', 'ok', `实体温湿度遥测已接入（${sourceLabel}）· ${climate.temperature}°C / ${climate.humidity}%`)
          this.emit()
        }
      } catch {
        // 拉取失败保持最近一次遥测值，tickTelemetry 继续平滑
      }
    }
    void fetchClimate()
    this.climateTimer = window.setInterval(() => void fetchClimate(), 30000)
  }

  private stopClimatePolling(): void {
    if (this.climateTimer !== null) {
      window.clearInterval(this.climateTimer)
      this.climateTimer = null
    }
    this.liveClimate = null
  }

  /** 联机时拉取实体 borrow_logs，把周趋势 / 成员活跃 / 格口热度换成真实数据 */
  private async loadLiveStats(): Promise<void> {
    try {
      const res = await fetch(`${this.apiBase}/api/borrow_logs?since_id=0&limit=500`)
      if (!res.ok) return
      const logs = parseBorrowLogsEnvelope(await res.json())
      if (this.mode !== 'live' || logs.length === 0) return

      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const now = new Date()
      const buckets = new Map<string, { label: string; store: number; take: number }>()
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        buckets.set(dayKey(day), { label: i === 0 ? '今天' : dayNames[day.getDay()], store: 0, take: 0 })
      }

      const memberActivity: Record<string, number> = {}
      const cellActivity: Record<number, number> = {}
      const bookActivity: Record<number, number> = {}
      const titleToId = new Map<string, number>()
      Object.values(this.booksById).forEach((b) => titleToId.set(b.title, b.id))

      for (const log of logs) {
        // SQLite CURRENT_TIMESTAMP 是 UTC，补 Z 转本地
        const at = log.action_time ? new Date(log.action_time.replace(' ', 'T') + 'Z') : null
        if (at && !Number.isNaN(at.getTime())) {
          const bucket = buckets.get(dayKey(at))
          if (bucket) {
            if (log.action === 'store') bucket.store++
            else bucket.take++
          }
        }
        if (log.user_name) memberActivity[log.user_name] = (memberActivity[log.user_name] ?? 0) + 1
        if (log.compartment_id != null) cellActivity[log.compartment_id] = (cellActivity[log.compartment_id] ?? 0) + 1
        const bookId = log.title ? titleToId.get(log.title) : undefined
        if (bookId !== undefined) bookActivity[bookId] = (bookActivity[bookId] ?? 0) + 1
      }

      const days = [...buckets.values()]
      const today = days[days.length - 1]
      this.weeklyTrend = days.slice(0, -1)
      this.stats.storeCount = today?.store ?? 0
      this.stats.takeCount = today?.take ?? 0
      this.memberActivity = memberActivity
      this.cellActivity = cellActivity
      this.bookActivity = bookActivity
      this.pushEvent('link', 'ok', `实体运行统计已接入 · ${logs.length} 条真实存取记录`)
      this.emit()
    } catch {
      // 拉取失败保留模拟统计
    }
  }

  /* ---------------- SSE 事件流（/api/voice_stream 直通） ---------------- */

  private restartPoll(intervalMs: number): void {
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer)
    this.pollTimer = window.setInterval(() => void this.pollLive(false), intervalMs)
  }

  private connectStream(): void {
    if (this.sse) return
    const source = new EventSource(`${this.apiBase}/api/voice_stream?since=now`)
    this.sse = source
    source.onmessage = (msg) => this.handleStreamEvent(String(msg.data ?? ''))
    source.onerror = () => {
      if (this.sseHealthy) {
        this.sseHealthy = false
        // SSE 断开时退回 3s 快轮询兜底，浏览器会自动重连 SSE
        if (this.mode === 'live') this.restartPoll(3000)
        this.pushEvent('link', 'warn', 'SSE 事件流中断 · 自动重连中，暂以快轮询兜底')
        this.emit()
      }
    }
  }

  private disconnectStream(): void {
    if (this.sse) {
      this.sse.close()
      this.sse = null
    }
    this.sseHealthy = false
  }

  private handleStreamEvent(raw: string): void {
    const data = parseStreamPayload(raw)
    if (!data) return

    if (data.type === 'connected') {
      this.sseHealthy = true
      // 事件改走 SSE 直通，轮询降为慢速对账通道
      if (this.mode === 'live') this.restartPoll(12000)
      this.pushEvent('link', 'ok', 'SSE 事件流已接通 · 实体语音/存取事件实时直通（轮询降为 12s 对账）')
      this.emit()
      return
    }

    if (data.source === 'shelf_watch' && (data.action === 'store' || data.action === 'take')) {
      this.handleShelfWatchEvent(data)
      return
    }

    if (data.role && data.text) {
      const speaker = data.role === 'user' ? '实体端用户' : '小燕'
      const text = data.text.length > 80 ? `${data.text.slice(0, 80)}…` : data.text
      this.pushEvent('voice', 'info', `${speaker}：「${text}」`)
      this.emit()
    }
  }

  /** 实体存取事件直通：写事件流 + 驱动机械臂动画，再拉快照对账 */
  private handleShelfWatchEvent(data: StreamPayload): void {
    if (!isTaskAction(data.action)) return
    const action = data.action
    const cid = Number(data.cid)
    const title = data.title || '未知图书'

    this.pushEvent(
      action,
      'ok',
      action === 'store'
        ? `实体书架存书 ·《${title}》 → 格口 ${Number.isFinite(cid) ? cid : '?'}`
        : `实体书架取书 ·《${title}》 ← 格口 ${Number.isFinite(cid) ? cid : '?'}`,
    )

    if (Number.isFinite(cid) && !this.task) {
      const comp = this.compartments.find((c) => c.cid === cid)
      if (comp) {
        let bookId: number | null = null
        if (action === 'take') {
          bookId = this.stored[cid]?.bookId ?? null
        }
        if (bookId === null) {
          const known = Object.values(this.booksById).find((b) => b.title === title)
          if (known) {
            bookId = known.id
          } else {
            bookId = 900 + cid
            this.booksById[bookId] = {
              id: bookId,
              title,
              author: '—',
              category: '未知',
              description: '来自实体书架的图书',
            }
          }
        }
        this.startTask(action, cid, bookId, '实体书架 · 直通')
      }
    }

    void this.pollLive(false)
    this.emit()
  }

  private async pollLive(probe: boolean): Promise<boolean> {
    const url = `${this.apiBase}/api/compartments`
    const started = performance.now()
    try {
      const ctrl = new AbortController()
      const timeout = window.setTimeout(() => ctrl.abort(), 2500)
      const res = await fetch(url, { signal: ctrl.signal })
      window.clearTimeout(timeout)
      if (!res.ok) throw new Error(String(res.status))
      const data = parseLiveCompartments(await res.json())
      if (!data) throw new Error('invalid compartments payload')
      this.liveLatency = Math.max(1, Math.round(performance.now() - started))
      const wasHealthy = this.liveHealthy
      this.liveHealthy = true
      this.applyLiveSnapshot(data)
      if (!probe && !wasHealthy) this.pushEvent('link', 'ok', '实体书架链路恢复')
      this.emit()
      return true
    } catch {
      if (this.liveHealthy) {
        this.pushEvent('link', 'warn', '实体书架轮询失败 · 显示最近一次快照')
      }
      this.liveHealthy = false
      if (!probe) this.emit()
      return false
    }
  }

  private applyLiveSnapshot(
    data: Array<{ cid: number; x: number; y: number; status: string; book: string | null }>,
  ): void {
    // 正在被任务动画操作的格口保持本地状态，动画结束后由下一次对账同步
    const animatingCid = this.task && this.task.phase !== 'done' && this.task.phase !== 'fault' ? this.task.cid : null
    const stored: Record<number, StoredMeta> = {}
    const comps: Compartment[] = []
    for (const item of data) {
      if (animatingCid !== null && item.cid === animatingCid) {
        const local = this.compartments.find((c) => c.cid === item.cid)
        if (local) {
          comps.push({ ...local })
          if (this.stored[item.cid]) stored[item.cid] = { ...this.stored[item.cid] }
          continue
        }
      }
      const occupied = item.status === 'occupied'
      let bookId: number | null = null
      if (occupied && item.book) {
        const known = Object.values(this.booksById).find((b) => b.title === item.book)
        if (known) {
          bookId = known.id
        } else {
          bookId = 900 + item.cid
          this.booksById[bookId] = {
            id: bookId,
            title: item.book,
            author: '—',
            category: '未知',
            description: '来自实体书架的图书',
          }
        }
        stored[item.cid] = { bookId, storedAt: null, storedBy: '实体书架' }
      }
      comps.push({
        cid: item.cid,
        floor: item.x,
        cell: item.y,
        status: occupied ? 'occupied' : 'free',
        bookId,
      })
    }
    comps.sort((a, b) => a.cid - b.cid)
    this.compartments = comps
    this.stored = stored
  }

  private async liveTake(cid: number): Promise<void> {
    const meta = this.stored[cid]
    const book = meta ? this.booksById[meta.bookId] : null
    this.pushEvent('take', 'info', `联机取书 · POST /api/take {cid: ${cid}}`)
    this.startTask('take', cid, meta?.bookId ?? 0, '控制台 · 联机')
    try {
      // 两段式：先 /api/take 准备动作，拿到 commit_request 再 /api/motion/commit 落库
      const prepareRes = await fetch(`${this.apiBase}/api/take`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, title: book?.title ?? '' }),
      })
      const prepareEnvelope = parseOkEnvelope(await prepareRes.json())
      const commitRequest = prepareEnvelope?.data?.commit_request
      if (!prepareEnvelope?.ok || !commitRequest || typeof commitRequest !== 'object') {
        const msg =
          prepareEnvelope?.message ??
          (typeof prepareEnvelope?.data?.msg === 'string' ? prepareEnvelope.data.msg : undefined)
        this.pushEvent('take', 'warn', `实体书架拒绝取书：${msg ?? '未知原因'}`)
        void this.pollLive(false)
        return
      }
      const commitRes = await fetch(`${this.apiBase}/api/motion/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commitRequest),
      })
      const commitEnvelope = parseOkEnvelope(await commitRes.json())
      if (commitEnvelope?.ok) {
        const okMsg = typeof commitEnvelope.data?.msg === 'string' ? commitEnvelope.data.msg : 'ok'
        this.pushEvent('take', 'ok', `实体书架已完成取书：${okMsg}`)
      } else {
        const failMsg =
          commitEnvelope?.message ??
          (typeof commitEnvelope?.data?.msg === 'string' ? commitEnvelope.data.msg : undefined)
        this.pushEvent('take', 'warn', `实体书架取书提交失败：${failMsg ?? '未知原因'}`)
      }
    } catch {
      this.pushEvent('take', 'warn', '联机取书请求失败 · 请检查 Flask 服务')
    }
    void this.pollLive(false)
  }

  /* ---------------- 3D 采样（每帧调用，不经过 React）：薄委托到 kinematics.ts ---------------- */

  /** 当前书在哪个机构上；flight = 两个机构之间的过渡 */
  sampleBookCarrier(now: number): BookCarrier | null {
    return kin.sampleBookCarrier(this.task, now)
  }

  sampleBookFlight(now: number): BookFlight {
    return kin.sampleBookFlight(this.task, now)
  }

  sampleLaminate(now: number): LaminatePose {
    return kin.sampleLaminate(this.laminate, this.laminateBookId, this.laminatePresented, now)
  }

  sampleGantry(now: number): GantryPose {
    return kin.sampleGantry(this.gantrySeg, this.task, now)
  }

  sampleBay(now: number): BayPose {
    return kin.sampleBay(this.task, now)
  }

  sampleCart(now: number): CartPose {
    return kin.sampleCart(this.task, this.navOverride, now)
  }
}

export const twinEngine = new TwinEngine()
twinEngine.start()

if (import.meta.hot) {
  import.meta.hot.dispose(() => twinEngine.dispose())
}
