/* ============================================================
   NavSimulator：配送导航仿真引擎（模块级单例，rAF 循环在 React 之外）
   - 图书馆配送楼层 19.2m × 11.2m，96×56 占据栅格
   - 全局：A* + string-pull；局部：纯追踪 + DWA-lite
   - UI 通过 subscribe/getUiSnapshot 低频订阅；画布每帧读取渲染态
   注意：本模块不依赖 src/twin/，可独立运行与测试
   ============================================================ */

import { WHEELBASE, integrateAckermann, steerToOmega } from './ackermann'
import { findPath } from './astar'
import type { DwaDecision, DwaObstacle } from './dwa'
import { DEFAULT_DWA, dwaSelect, type DwaParams } from './dwa'
import {
  CELL_SIZE,
  WORLD_H,
  WORLD_W,
  cellCenter,
  createGrid,
  inflate,
  isOccupied,
  nearestFreeCell,
  setCell,
  setRectWorld,
  worldToCell,
} from './grid'
import { DEFAULT_PURSUIT, clamp, purePursuit, type PursuitParams } from './purePursuit'
import { cellsToWorld, pathLength, smoothPath } from './smooth'
import type {
  DynamicObstacle,
  MissionPhase,
  NavEvent,
  OccupancyGrid,
  Pose,
  Station,
  Twist,
  Vec2,
} from './types'

export const ROBOT_RADIUS = 0.27
const INFLATE_RADIUS = 0.3
const PATH_SPACING = 0.12
const MAX_EVENTS = 36
const TRACE_INTERVAL = 0.12
const MAX_TRACE = 700
/** 受阻超过该时长（秒）触发首次重规划 */
const BLOCKED_REPLAN_AFTER = 1.1
/** 每次自动重规划之间的冷却（秒） */
const REPLAN_COOLDOWN = 1.2
/** 持续受阻超过该时长（秒）宣告任务受阻 */
const BLOCKED_GIVE_UP_AFTER = 6

export type NavUiSnapshot = {
  version: number
  running: boolean
  paused: boolean
  phase: MissionPhase
  goalLabel: string | null
  planMs: number
  expanded: number
  pathLen: number
  traveled: number
  speed: number
  /** 当前前轮转角（弧度） */
  steering: number
  replans: number
  simTime: number
  dynEnabled: boolean
  speedScale: number
  events: NavEvent[]
}

/** 渲染帧所需的全部状态（画布层直接引用，避免复制） */
export type NavRenderState = {
  grid: OccupancyGrid
  pose: Pose
  twist: Twist
  /** 当前前轮转角（弧度），画布用于绘制前轮朝向 */
  steering: number
  robotRadius: number
  stations: Station[]
  goal: Vec2 | null
  goalStationId: string | null
  rawPath: Vec2[]
  path: Vec2[]
  lookahead: Vec2 | null
  dwa: DwaDecision | null
  obstacles: DynamicObstacle[]
  dynEnabled: boolean
  trace: Vec2[]
  phase: MissionPhase
  simTime: number
}

const STATION_DEFS: Station[] = [
  { id: 'charge', label: '充电桩', icon: '⚡', pos: { x: 1.0, y: 10.2 } },
  { id: 'desk', label: '服务台', icon: '◈', pos: { x: 10.5, y: 3.6 } },
  { id: 'returns', label: '还书口', icon: '↩', pos: { x: 1.0, y: 1.0 } },
  { id: 'stacks', label: '藏书区', icon: '❒', pos: { x: 4.6, y: 5.5 } },
  { id: 'reading', label: '阅览区', icon: '☰', pos: { x: 15.4, y: 5.0 } },
  { id: 'elevator', label: '电梯厅', icon: '▤', pos: { x: 18.1, y: 10.1 } },
]

const PHASE_TEXT: Record<MissionPhase, string> = {
  idle: '待命',
  planning: '规划中',
  moving: '配送中',
  arrived: '已送达',
  blocked: '受阻',
  unreachable: '不可达',
}

export function phaseLabel(phase: MissionPhase): string {
  return PHASE_TEXT[phase]
}

function paintDefaultWorld(grid: OccupancyGrid): void {
  grid.occ.fill(0)
  // 四周外墙
  setRectWorld(grid, 0, 0, WORLD_W, 0.2, 1)
  setRectWorld(grid, 0, WORLD_H - 0.2, WORLD_W, WORLD_H, 1)
  setRectWorld(grid, 0, 0, 0.2, WORLD_H, 1)
  setRectWorld(grid, WORLD_W - 0.2, 0, WORLD_W, WORLD_H, 1)
  // 藏书区：四排书架
  for (let i = 0; i < 4; i++) {
    const y = 1.9 + i * 2.2
    setRectWorld(grid, 1.8, y, 7.6, y + 0.6, 1)
  }
  // 中央服务台
  setRectWorld(grid, 9.5, 4.6, 11.7, 7.0, 1)
  // 立柱
  setRectWorld(grid, 12.7, 2.2, 13.15, 2.65, 1)
  setRectWorld(grid, 12.7, 8.6, 13.15, 9.05, 1)
  // 阅览区桌椅
  setRectWorld(grid, 14.2, 1.4, 15.4, 2.2, 1)
  setRectWorld(grid, 16.6, 2.6, 17.8, 3.4, 1)
  setRectWorld(grid, 14.0, 6.6, 15.2, 7.4, 1)
  setRectWorld(grid, 16.4, 7.6, 17.6, 8.4, 1)
  // 自助借还机
  setRectWorld(grid, 5.4, 10.0, 7.0, 10.6, 1)
}

function makeDynObstacles(): DynamicObstacle[] {
  return [
    {
      id: 1,
      label: '读者',
      radius: 0.24,
      from: { x: 8.6, y: 1.2 },
      to: { x: 8.6, y: 10.0 },
      speed: 0.5,
      t: 0.15,
      dir: 1,
      pos: { x: 8.6, y: 2.52 },
    },
    {
      id: 2,
      label: '读者',
      radius: 0.24,
      from: { x: 12.4, y: 5.6 },
      to: { x: 18.0, y: 5.6 },
      speed: 0.42,
      t: 0.6,
      dir: -1,
      pos: { x: 15.76, y: 5.6 },
    },
    {
      id: 3,
      label: '推车',
      radius: 0.3,
      from: { x: 1.2, y: 3.1 },
      to: { x: 8.2, y: 3.1 },
      speed: 0.34,
      t: 0.35,
      dir: 1,
      pos: { x: 3.65, y: 3.1 },
    },
  ]
}

export class NavSimulator {
  readonly grid: OccupancyGrid
  readonly stations: Station[]

  private pose: Pose
  private twist: Twist = { v: 0, w: 0 }
  /** 当前前轮转角（弧度） */
  private steering = 0
  private phase: MissionPhase = 'idle'
  private goal: Vec2 | null = null
  private goalStationId: string | null = null
  private goalLabel: string | null = null

  private rawPath: Vec2[] = []
  private path: Vec2[] = []
  private pursuitIndex = 0
  private lookahead: Vec2 | null = null
  private lastDwa: DwaDecision | null = null

  private obstacles: DynamicObstacle[] = makeDynObstacles()
  private dynEnabled = true

  private trace: Vec2[] = []
  private traceTimer = 0

  private events: NavEvent[] = []
  private eventSeq = 0

  private simTime = 0
  private traveled = 0
  private planMs = 0
  private expanded = 0
  private pathLen = 0
  private replans = 0
  private blockedFor = 0
  private replanCooldown = 0
  private speedScale = 1
  private mapDirty = false
  private mapDirtyTimer = 0

  private pursuitParams: PursuitParams = { ...DEFAULT_PURSUIT }
  private dwaParams: DwaParams = { ...DEFAULT_DWA, robotRadius: ROBOT_RADIUS }

  private rafId: number | null = null
  private lastFrameMs: number | null = null
  private running = false
  private paused = false

  private listeners = new Set<() => void>()
  private frameListeners = new Set<() => void>()
  private version = 0
  private uiCache: NavUiSnapshot | null = null
  private uiTimer = 0

  constructor() {
    this.grid = createGrid()
    paintDefaultWorld(this.grid)
    inflate(this.grid, INFLATE_RADIUS)
    // 站点吸附到最近可通行格中心
    this.stations = STATION_DEFS.map((s) => {
      const cell = nearestFreeCell(this.grid, worldToCell(this.grid, s.pos.x, s.pos.y))
      const pos = cell ? cellCenter(this.grid, cell.cx, cell.cy) : { ...s.pos }
      return { ...s, pos }
    })
    const home = this.stations[0].pos
    this.pose = { x: home.x, y: home.y, theta: -Math.PI / 2 }
    this.pushEvent('导航仿真就绪：点击地图任意可达点，或一键派送至站点', 'info')
  }

  /* ---------- 订阅（React useSyncExternalStore） ---------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getUiSnapshot = (): NavUiSnapshot => {
    if (this.uiCache && this.uiCache.version === this.version) return this.uiCache
    this.uiCache = {
      version: this.version,
      running: this.running,
      paused: this.paused,
      phase: this.phase,
      goalLabel: this.goalLabel,
      planMs: this.planMs,
      expanded: this.expanded,
      pathLen: this.pathLen,
      traveled: this.traveled,
      speed: this.twist.v,
      steering: this.steering,
      replans: this.replans,
      simTime: this.simTime,
      dynEnabled: this.dynEnabled,
      speedScale: this.speedScale,
      events: this.events,
    }
    return this.uiCache
  }

  /** 画布每帧回调（渲染层注册，与 React 状态无关） */
  onFrame = (fn: () => void): (() => void) => {
    this.frameListeners.add(fn)
    return () => this.frameListeners.delete(fn)
  }

  getRenderState(): NavRenderState {
    return {
      grid: this.grid,
      pose: this.pose,
      twist: this.twist,
      steering: this.steering,
      robotRadius: ROBOT_RADIUS,
      stations: this.stations,
      goal: this.goal,
      goalStationId: this.goalStationId,
      rawPath: this.rawPath,
      path: this.path,
      lookahead: this.lookahead,
      dwa: this.lastDwa,
      obstacles: this.obstacles,
      dynEnabled: this.dynEnabled,
      trace: this.trace,
      phase: this.phase,
      simTime: this.simTime,
    }
  }

  private notify(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  private pushEvent(text: string, kind: NavEvent['kind']): void {
    this.events = [
      { id: ++this.eventSeq, time: this.simTime, text, kind },
      ...this.events,
    ].slice(0, MAX_EVENTS)
  }

  /* ---------- 生命周期：rAF 循环（React 之外） ---------- */

  /** 页面挂载时启动帧循环（暂停时仍渲染画布，只冻结物理） */
  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrameMs = null
    const tick = (nowMs: number) => {
      if (!this.running) return
      if (this.lastFrameMs !== null && !this.paused) {
        // 帧间隔夹紧最长 0.1s；按 33ms 子步推进保证数值稳定
        let dt = Math.min(0.1, (nowMs - this.lastFrameMs) / 1000)
        while (dt > 1e-6) {
          const sub = Math.min(dt, 0.033)
          this.step(sub)
          dt -= sub
        }
      }
      this.lastFrameMs = nowMs
      for (const fn of this.frameListeners) fn()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
    this.notify()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    this.lastFrameMs = null
    this.notify()
  }

  togglePaused(): void {
    this.paused = !this.paused
    this.pushEvent(this.paused ? '仿真已暂停' : '仿真继续', 'info')
    this.notify()
  }

  /* ---------- 指令 API ---------- */

  dispatchTo(stationId: string): void {
    const st = this.stations.find((s) => s.id === stationId)
    if (!st) return
    this.setGoal(st.pos, st.id, st.label)
  }

  setGoalWorld(x: number, y: number): void {
    this.setGoal(
      { x: clamp(x, 0, WORLD_W), y: clamp(y, 0, WORLD_H) },
      null,
      `坐标 (${x.toFixed(1)}, ${y.toFixed(1)})`,
    )
  }

  /** 放置小车（瞬移，清空当前任务） */
  teleportRobot(x: number, y: number): void {
    const cell = nearestFreeCell(this.grid, worldToCell(this.grid, x, y))
    if (!cell) {
      this.pushEvent('该位置附近没有可通行空间，无法放置小车', 'warn')
      this.notify()
      return
    }
    const p = cellCenter(this.grid, cell.cx, cell.cy)
    this.pose = { x: p.x, y: p.y, theta: this.pose.theta }
    this.twist = { v: 0, w: 0 }
    this.steering = 0
    this.clearMission('idle')
    this.trace = []
    this.pushEvent(`小车已放置到 (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`, 'info')
    this.notify()
  }

  /** 绘制 / 擦除静态障碍（世界坐标）。返回是否发生变化 */
  paintObstacle(x: number, y: number, add: boolean): boolean {
    const { cx, cy } = worldToCell(this.grid, x, y)
    // 外墙不可编辑
    if (cx <= 0 || cy <= 0 || cx >= this.grid.cols - 1 || cy >= this.grid.rows - 1) return false
    if (isOccupied(this.grid, cx, cy) === add) return false
    if (add) {
      // 不允许压住小车
      const c = cellCenter(this.grid, cx, cy)
      if (Math.hypot(c.x - this.pose.x, c.y - this.pose.y) < ROBOT_RADIUS + CELL_SIZE) return false
    }
    setCell(this.grid, cx, cy, add ? 1 : 0)
    inflate(this.grid, INFLATE_RADIUS)
    this.mapDirty = true
    return true
  }

  toggleDynamic(): void {
    this.dynEnabled = !this.dynEnabled
    this.pushEvent(this.dynEnabled ? '行人模拟已开启' : '行人模拟已关闭', 'info')
    this.notify()
  }

  setSpeedScale(scale: number): void {
    this.speedScale = clamp(scale, 0.3, 1.6)
    this.notify()
  }

  resetWorld(): void {
    paintDefaultWorld(this.grid)
    inflate(this.grid, INFLATE_RADIUS)
    this.obstacles = makeDynObstacles()
    const home = this.stations[0].pos
    this.pose = { x: home.x, y: home.y, theta: -Math.PI / 2 }
    this.twist = { v: 0, w: 0 }
    this.steering = 0
    this.clearMission('idle')
    this.trace = []
    this.traveled = 0
    this.replans = 0
    this.mapDirty = false
    this.pushEvent('地图与小车已重置', 'info')
    this.notify()
  }

  /* ---------- 内部：任务与规划 ---------- */

  private clearMission(phase: MissionPhase): void {
    this.phase = phase
    this.goal = null
    this.goalStationId = null
    this.goalLabel = null
    this.rawPath = []
    this.path = []
    this.pursuitIndex = 0
    this.lookahead = null
    this.lastDwa = null
    this.blockedFor = 0
    this.replanCooldown = 0
  }

  private setGoal(pos: Vec2, stationId: string | null, label: string): void {
    const cell = nearestFreeCell(this.grid, worldToCell(this.grid, pos.x, pos.y))
    if (!cell) {
      this.phase = 'unreachable'
      this.pushEvent(`目标「${label}」附近没有可达空间`, 'bad')
      this.notify()
      return
    }
    this.goal = cellCenter(this.grid, cell.cx, cell.cy)
    this.goalStationId = stationId
    this.goalLabel = label
    this.trace = []
    this.blockedFor = 0
    this.replanCooldown = 0
    if (this.plan(true)) {
      this.pushEvent(
        `开始配送 → ${label}（路径 ${this.pathLen.toFixed(1)}m · 规划 ${this.planMs.toFixed(1)}ms · 展开 ${this.expanded} 节点）`,
        'ok',
      )
    }
    this.notify()
  }

  /** A* + string-pull 重建全局路径。fresh 为 true 表示新任务 */
  private plan(fresh: boolean): boolean {
    if (!this.goal) return false
    const startCell = nearestFreeCell(
      this.grid,
      worldToCell(this.grid, this.pose.x, this.pose.y),
    )
    const goalCell = nearestFreeCell(this.grid, worldToCell(this.grid, this.goal.x, this.goal.y))
    if (!startCell || !goalCell) {
      this.phase = 'unreachable'
      this.pushEvent('起点或终点被障碍围困，无法规划', 'bad')
      return false
    }
    const t0 = performance.now()
    const res = findPath(this.grid, startCell, goalCell)
    this.planMs = performance.now() - t0
    if (!res) {
      this.phase = 'unreachable'
      this.pathLen = 0
      this.rawPath = []
      this.path = []
      this.lookahead = null
      this.pushEvent(`无法抵达「${this.goalLabel ?? '目标'}」：路径被完全阻断`, 'bad')
      return false
    }
    this.expanded = res.expanded
    this.rawPath = cellsToWorld(this.grid, res.cells)
    // 以真实位姿为路径起点，衔接更平顺
    const smoothed = smoothPath(this.grid, res.cells, PATH_SPACING)
    smoothed[0] = { x: this.pose.x, y: this.pose.y }
    this.path = smoothed
    this.pathLen = pathLength(smoothed)
    this.pursuitIndex = 0
    this.phase = 'moving'
    if (fresh) this.traveled = 0
    return true
  }

  private replan(reason: string): void {
    this.replans++
    if (this.plan(false)) {
      this.pushEvent(`${reason}，已重新规划（第 ${this.replans} 次）`, 'warn')
    }
  }

  /* ---------- 内部：单步仿真 ---------- */

  private step(dt: number): void {
    this.simTime += dt

    if (this.dynEnabled) {
      for (const o of this.obstacles) {
        const len = Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y)
        if (len > 1e-6) {
          o.t += (o.dir * o.speed * dt) / len
          if (o.t >= 1) {
            o.t = 1
            o.dir = -1
          } else if (o.t <= 0) {
            o.t = 0
            o.dir = 1
          }
          o.pos = {
            x: o.from.x + (o.to.x - o.from.x) * o.t,
            y: o.from.y + (o.to.y - o.from.y) * o.t,
          }
        }
      }
    }

    // 地图编辑后节流重规划（拖拽绘制时避免每格都触发）
    if (this.mapDirty) {
      this.mapDirtyTimer += dt
      if (this.mapDirtyTimer > 0.25) {
        this.mapDirty = false
        this.mapDirtyTimer = 0
        if (
          this.goal &&
          (this.phase === 'moving' || this.phase === 'blocked' || this.phase === 'unreachable')
        ) {
          this.blockedFor = 0
          this.replan('地图已变更')
        }
        this.notify()
      }
    } else {
      this.mapDirtyTimer = 0
    }

    if (this.phase === 'moving' && this.path.length > 0) {
      const maxV = this.pursuitParams.maxV * this.speedScale
      const pursuit = purePursuit(
        this.path,
        this.pose,
        this.twist.v,
        { ...this.pursuitParams, maxV },
        this.pursuitIndex,
      )
      this.pursuitIndex = pursuit.nearest
      this.lookahead = pursuit.target

      if (pursuit.done) {
        this.twist = { v: 0, w: 0 }
        this.phase = 'arrived'
        this.lastDwa = null
        this.pushEvent(
          `已送达「${this.goalLabel ?? '目标'}」（行驶 ${this.traveled.toFixed(1)}m）`,
          'ok',
        )
        this.notify()
        return
      }

      const dwaObstacles: DwaObstacle[] = this.dynEnabled
        ? this.obstacles.map((o) => ({ x: o.pos.x, y: o.pos.y, radius: o.radius }))
        : []
      const decision = dwaSelect(
        this.grid,
        this.pose,
        { v: this.twist.v, delta: this.steering },
        { v: pursuit.v, delta: pursuit.delta },
        pursuit.target,
        dwaObstacles,
        { ...this.dwaParams, maxV },
        Math.max(dt, 0.05),
      )
      this.lastDwa = decision

      if (decision.blocked) {
        this.twist = { v: 0, w: 0 }
        this.blockedFor += dt
        this.replanCooldown -= dt
        if (this.blockedFor > BLOCKED_GIVE_UP_AFTER) {
          this.blockedFor = 0
          this.phase = 'blocked'
          this.pushEvent('持续受阻，任务暂停：请清理障碍或重新下达目标', 'bad')
          this.notify()
        } else if (this.blockedFor > BLOCKED_REPLAN_AFTER && this.replanCooldown <= 0) {
          this.replanCooldown = REPLAN_COOLDOWN
          this.replan('前方受阻')
          this.notify()
        }
      } else {
        this.steering = decision.delta
        this.twist = { v: decision.v, w: steerToOmega(decision.v, decision.delta, WHEELBASE) }
        this.pose = integrateAckermann(this.pose, decision.v, decision.delta, dt)
        this.traveled += Math.abs(decision.v) * dt

        // 停滞看门狗：期望移动但选出的速度趋零（贴着膨胀边界“冻结”，
        // 阿克曼车速度趋零即无进展），按受阻同等处理 → 重规划离开边界
        const stalled = Math.abs(decision.v) < 0.02 && Math.abs(pursuit.v) > 0.08
        if (stalled) {
          this.blockedFor += dt
          this.replanCooldown -= dt
          if (this.blockedFor > BLOCKED_GIVE_UP_AFTER) {
            this.blockedFor = 0
            this.phase = 'blocked'
            this.twist = { v: 0, w: 0 }
            this.pushEvent('持续受限无法前进，任务暂停：请清理障碍或重新下达目标', 'bad')
            this.notify()
            return
          }
          if (this.blockedFor > BLOCKED_REPLAN_AFTER && this.replanCooldown <= 0) {
            this.replanCooldown = REPLAN_COOLDOWN
            this.replan('前方受限')
            this.notify()
          }
        } else {
          this.blockedFor = 0
          this.replanCooldown = 0
        }

        this.traceTimer += dt
        if (this.traceTimer >= TRACE_INTERVAL) {
          this.traceTimer = 0
          this.trace.push({ x: this.pose.x, y: this.pose.y })
          if (this.trace.length > MAX_TRACE) this.trace.splice(0, this.trace.length - MAX_TRACE)
        }
      }
    }

    // UI 低频刷新（数字滚动约 4Hz）
    this.uiTimer += dt
    if (this.uiTimer >= 0.25) {
      this.uiTimer = 0
      this.notify()
    }
  }
}

/** 模块级单例：整个应用共享一份仿真状态（切页不丢失） */
export const navSimulator = new NavSimulator()
