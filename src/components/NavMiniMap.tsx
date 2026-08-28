import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getNavMap } from '../nav/maps'
import { navSimulator, phaseLabel } from '../nav/simulator'
import { initTwinBridge } from '../nav/twinBridge'

/** 约 10fps 重绘：小地图只做态势速览，不追求逐帧平滑 */
const REDRAW_MS = 100
const CSS_W = 196

/**
 * 总览角落的 2D 导航小地图：机器人位姿 + 任务路径 + 简化障碍。
 * 直接读 navSimulator 渲染态（仿真未运行时呈现最后位姿）；
 * 挂载时幂等初始化 twinBridge，让孪生联动在总览页也生效。
 * 经 React.lazy 按需装载，导航栈不进入总览首屏分包。
 */
export function NavMiniMap({ active }: { active: boolean }) {
  const ui = useSyncExternalStore(navSimulator.subscribe, navSimulator.getUiSnapshot)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    initTwinBridge()
  }, [])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const rs = navSimulator.getRenderState()
      const grid = rs.grid
      const worldW = grid.cols * grid.cellSize
      const worldH = grid.rows * grid.cellSize
      const cssH = Math.max(48, Math.round(CSS_W * (worldH / worldW)))
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (canvas.width !== Math.round(CSS_W * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(CSS_W * dpr)
        canvas.height = Math.round(cssH * dpr)
        canvas.style.width = `${CSS_W}px`
        canvas.style.height = `${cssH}px`
      }
      const s = CSS_W / worldW
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      ctx.fillStyle = 'rgba(7, 10, 22, 0.94)'
      ctx.fillRect(0, 0, CSS_W, cssH)

      // 静态障碍（书架 / 墙体 / 立柱）
      ctx.fillStyle = 'rgba(104, 122, 199, 0.5)'
      const cell = grid.cellSize * s
      for (let cy = 0; cy < grid.rows; cy++) {
        const rowBase = cy * grid.cols
        for (let cx = 0; cx < grid.cols; cx++) {
          if (grid.occ[rowBase + cx] === 1) {
            ctx.fillRect(cx * cell, cy * cell, cell + 0.5, cell + 0.5)
          }
        }
      }

      // 站点
      ctx.fillStyle = 'rgba(150, 168, 245, 0.65)'
      for (const st of rs.stations) {
        ctx.beginPath()
        ctx.arc(st.pos.x * s, st.pos.y * s, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      // 动态障碍（行人 / 推车）
      if (rs.dynEnabled) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.45)'
        for (const o of rs.obstacles) {
          ctx.beginPath()
          ctx.arc(o.pos.x * s, o.pos.y * s, Math.max(1.6, o.radius * s), 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 任务路径
      if (rs.path.length > 1 && (rs.phase === 'moving' || rs.phase === 'blocked')) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(rs.path[0].x * s, rs.path[0].y * s)
        for (let i = 1; i < rs.path.length; i++) {
          ctx.lineTo(rs.path[i].x * s, rs.path[i].y * s)
        }
        ctx.stroke()
      }

      // 目标点
      if (rs.goal) {
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(rs.goal.x * s, rs.goal.y * s, 4, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 机器人：圆点 + 航向线
      const rx = rs.pose.x * s
      const ry = rs.pose.y * s
      ctx.fillStyle = '#22d3ee'
      ctx.beginPath()
      ctx.arc(rx, ry, Math.max(2.4, rs.robotRadius * s), 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#e8ecff'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(rx, ry)
      ctx.lineTo(rx + Math.cos(rs.pose.theta) * 7, ry + Math.sin(rs.pose.theta) * 7)
      ctx.stroke()
    }

    draw()
    const id = window.setInterval(draw, REDRAW_MS)
    return () => window.clearInterval(id)
  }, [active])

  const mapDef = getNavMap(ui.mapId)

  return (
    <div className="nav-mini" role="img" aria-label={`导航小地图：${mapDef.subtitle}`}>
      <div className="nav-mini-head">
        <b>导航小地图</b>
        <span>{mapDef.label}</span>
        <i className={`nav-mini-sync ${ui.twinSync ? 'on' : ''}`}>
          {ui.twinSync ? '● 孪生同步' : '○ 独立'}
        </i>
      </div>
      <canvas ref={canvasRef} className="nav-mini-canvas" />
      <div className="nav-mini-foot">
        <span className={`nav-mini-phase is-${ui.phase}`}>{phaseLabel(ui.phase)}</span>
        {ui.goalLabel ? <span className="nav-mini-goal">→ {ui.goalLabel}</span> : null}
        {!ui.running ? <span className="nav-mini-goal">· 待启动</span> : null}
      </div>
    </div>
  )
}
