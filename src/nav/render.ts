/* ============================================================
   Canvas 2D 渲染：极光晶体主题配色
   世界（米）→ 画布（px）等比缩放居中；每帧全量重绘
   ============================================================ */

import type { NavRenderState } from './simulator'
import type { OccupancyGrid, Vec2 } from './types'

/** 与 00-base.css 极光主题一致的画布配色 */
const C = {
  floor: 'rgba(12, 15, 30, 0.92)',
  floorEdge: 'rgba(150, 168, 245, 0.30)',
  gridLine: 'rgba(139, 155, 224, 0.07)',
  gridLineMajor: 'rgba(139, 155, 224, 0.13)',
  wall: 'rgba(124, 140, 248, 0.42)',
  wallEdge: 'rgba(165, 180, 255, 0.55)',
  inflated: 'rgba(251, 113, 133, 0.10)',
  near: 'rgba(251, 191, 36, 0.05)',
  rawPath: 'rgba(139, 155, 224, 0.4)',
  path: '#22d3ee',
  pathGlow: 'rgba(34, 211, 238, 0.25)',
  trace: 'rgba(167, 139, 250, 0.55)',
  robot: '#a5b4ff',
  robotBody: 'rgba(124, 140, 248, 0.85)',
  heading: '#7ae7f7',
  lookahead: '#fcd34d',
  goal: '#34d399',
  station: 'rgba(139, 147, 184, 0.9)',
  stationActive: '#6ee7b7',
  pedestrian: 'rgba(244, 114, 182, 0.85)',
  pedestrianHalo: 'rgba(244, 114, 182, 0.16)',
  dwaSample: 'rgba(139, 155, 224, 0.22)',
  dwaCollided: 'rgba(251, 113, 133, 0.20)',
  dwaBest: 'rgba(110, 231, 183, 0.85)',
  text: '#8b93b8',
}

export type RenderLayers = {
  showGrid: boolean
  showInflation: boolean
  showDwa: boolean
  showTrace: boolean
  showRawPath: boolean
}

export const DEFAULT_LAYERS: RenderLayers = {
  showGrid: true,
  showInflation: true,
  showDwa: true,
  showTrace: true,
  showRawPath: false,
}

export type ViewTransform = {
  /** px / 米 */
  scale: number
  offsetX: number
  offsetY: number
}

/** 世界等比缩放并在画布内居中（含内边距） */
export function computeView(
  cssWidth: number,
  cssHeight: number,
  grid: OccupancyGrid,
  padding = 14,
): ViewTransform {
  const worldW = grid.cols * grid.cellSize
  const worldH = grid.rows * grid.cellSize
  const availW = Math.max(40, cssWidth - padding * 2)
  const availH = Math.max(40, cssHeight - padding * 2)
  const scale = Math.min(availW / worldW, availH / worldH)
  return {
    scale,
    offsetX: (cssWidth - worldW * scale) / 2,
    offsetY: (cssHeight - worldH * scale) / 2,
  }
}

export function canvasToWorld(view: ViewTransform, px: number, py: number): Vec2 {
  return { x: (px - view.offsetX) / view.scale, y: (py - view.offsetY) / view.scale }
}

function poly(ctx: CanvasRenderingContext2D, view: ViewTransform, pts: Vec2[]): void {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const x = view.offsetX + pts[i].x * view.scale
    const y = view.offsetY + pts[i].y * view.scale
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
}

/**
 * 全量重绘一帧。ctx 需已按 devicePixelRatio 缩放，cssWidth/cssHeight 为 CSS 像素。
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  state: NavRenderState,
  layers: RenderLayers,
  cssWidth: number,
  cssHeight: number,
): void {
  const { grid } = state
  const view = computeView(cssWidth, cssHeight, grid)
  const s = view.scale
  const cell = grid.cellSize * s
  const wx = (x: number) => view.offsetX + x * s
  const wy = (y: number) => view.offsetY + y * s
  const worldW = grid.cols * grid.cellSize
  const worldH = grid.rows * grid.cellSize

  ctx.clearRect(0, 0, cssWidth, cssHeight)

  // 地板
  ctx.fillStyle = C.floor
  ctx.fillRect(wx(0), wy(0), worldW * s, worldH * s)

  // 米网格
  if (layers.showGrid) {
    ctx.lineWidth = 1
    for (let gx = 0; gx <= Math.round(worldW); gx++) {
      ctx.strokeStyle = gx % 5 === 0 ? C.gridLineMajor : C.gridLine
      ctx.beginPath()
      ctx.moveTo(wx(gx), wy(0))
      ctx.lineTo(wx(gx), wy(worldH))
      ctx.stroke()
    }
    for (let gy = 0; gy <= Math.round(worldH); gy++) {
      ctx.strokeStyle = gy % 5 === 0 ? C.gridLineMajor : C.gridLine
      ctx.beginPath()
      ctx.moveTo(wx(0), wy(gy))
      ctx.lineTo(wx(worldW), wy(gy))
      ctx.stroke()
    }
  }

  // 膨胀 / 软代价层
  if (layers.showInflation) {
    for (let cy = 0; cy < grid.rows; cy++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        const i = cy * grid.cols + cx
        if (grid.occ[i] !== 0) continue
        if (grid.inflated[i] !== 0) {
          ctx.fillStyle = C.inflated
          ctx.fillRect(wx(cx * grid.cellSize), wy(cy * grid.cellSize), cell + 0.5, cell + 0.5)
        } else if (grid.near[i] > 12) {
          ctx.fillStyle = C.near
          ctx.fillRect(wx(cx * grid.cellSize), wy(cy * grid.cellSize), cell + 0.5, cell + 0.5)
        }
      }
    }
  }

  // 静态障碍
  ctx.fillStyle = C.wall
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      if (grid.occ[cy * grid.cols + cx] !== 0) {
        ctx.fillRect(wx(cx * grid.cellSize), wy(cy * grid.cellSize), cell + 0.5, cell + 0.5)
      }
    }
  }

  // 场地描边
  ctx.strokeStyle = C.floorEdge
  ctx.lineWidth = 1.5
  ctx.strokeRect(wx(0), wy(0), worldW * s, worldH * s)

  // A* 原始路径（调试层）
  if (layers.showRawPath && state.rawPath.length > 1) {
    ctx.strokeStyle = C.rawPath
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    poly(ctx, view, state.rawPath)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 行驶轨迹
  if (layers.showTrace && state.trace.length > 1) {
    ctx.strokeStyle = C.trace
    ctx.lineWidth = 1.6
    ctx.setLineDash([1, 5])
    poly(ctx, view, state.trace)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 平滑路径（发光 + 流动虚线）
  if (state.path.length > 1) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C.pathGlow
    ctx.lineWidth = 6
    poly(ctx, view, state.path)
    ctx.stroke()
    ctx.strokeStyle = C.path
    ctx.lineWidth = 2
    ctx.setLineDash([9, 7])
    ctx.lineDashOffset = -((state.simTime * 26) % 16)
    poly(ctx, view, state.path)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }

  // DWA 候选轨迹端点束
  if (layers.showDwa && state.dwa) {
    for (const t of state.dwa.candidates) {
      ctx.strokeStyle = t.collided ? C.dwaCollided : C.dwaSample
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(wx(state.pose.x), wy(state.pose.y))
      ctx.lineTo(wx(t.endX), wy(t.endY))
      ctx.stroke()
    }
    if (state.dwa.best) {
      ctx.strokeStyle = C.dwaBest
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(wx(state.pose.x), wy(state.pose.y))
      ctx.lineTo(wx(state.dwa.best.endX), wy(state.dwa.best.endY))
      ctx.stroke()
    }
  }

  // 站点
  ctx.font = `${Math.max(9, Math.round(s * 0.34))}px sans-serif`
  ctx.textAlign = 'center'
  for (const st of state.stations) {
    const active = st.id === state.goalStationId
    const x = wx(st.pos.x)
    const y = wy(st.pos.y)
    const r = Math.max(3, s * 0.11)
    ctx.fillStyle = active ? C.stationActive : C.station
    ctx.beginPath()
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r, y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = active ? C.stationActive : C.text
    ctx.fillText(`${st.icon} ${st.label}`, x, y - r - 4)
  }

  // 目标点
  if (state.goal) {
    const x = wx(state.goal.x)
    const y = wy(state.goal.y)
    const pulse = 1 + 0.18 * Math.sin(state.simTime * 5)
    ctx.strokeStyle = C.goal
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, Math.max(4, s * 0.16) * pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = C.goal
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 动态障碍（行人 / 推车）
  if (state.dynEnabled) {
    for (const o of state.obstacles) {
      const x = wx(o.pos.x)
      const y = wy(o.pos.y)
      const r = o.radius * s
      ctx.fillStyle = C.pedestrianHalo
      ctx.beginPath()
      ctx.arc(x, y, r * 1.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = C.pedestrian
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = C.text
      ctx.fillText(o.label, x, y - r - 4)
    }
  }

  // 前视目标点
  if (state.lookahead && state.phase === 'moving') {
    ctx.strokeStyle = C.lookahead
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(wx(state.pose.x), wy(state.pose.y))
    ctx.lineTo(wx(state.lookahead.x), wy(state.lookahead.y))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C.lookahead
    ctx.beginPath()
    ctx.arc(wx(state.lookahead.x), wy(state.lookahead.y), 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // 机器人（配送小车）
  {
    const x = wx(state.pose.x)
    const y = wy(state.pose.y)
    const r = state.robotRadius * s
    ctx.fillStyle = 'rgba(124, 140, 248, 0.2)'
    ctx.beginPath()
    ctx.arc(x, y, r * 1.55, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = C.robotBody
    ctx.strokeStyle = C.robot
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // 航向楔形
    ctx.strokeStyle = C.heading
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(
      x + Math.cos(state.pose.theta) * r * 1.35,
      y + Math.sin(state.pose.theta) * r * 1.35,
    )
    ctx.stroke()
    // 前轮转向指示：前轴处一小段线段，方向 = 航向 + 前轮转角
    const fx = x + Math.cos(state.pose.theta) * r * 0.62
    const fy = y + Math.sin(state.pose.theta) * r * 0.62
    const sa = state.pose.theta + state.steering
    ctx.strokeStyle = C.lookahead
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(fx - Math.cos(sa) * r * 0.34, fy - Math.sin(sa) * r * 0.34)
    ctx.lineTo(fx + Math.cos(sa) * r * 0.34, fy + Math.sin(sa) * r * 0.34)
    ctx.stroke()
  }
}
