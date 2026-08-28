import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  DEFAULT_LAYERS,
  canvasToWorld,
  computeView,
  renderScene,
  type RenderLayers,
} from '../nav/render'
import { navSimulator, phaseLabel } from '../nav/simulator'
import type { NavEvent } from '../nav/types'

type EditMode = 'goal' | 'wall' | 'erase' | 'robot'

const EDIT_MODES: Array<{ id: EditMode; label: string; hint: string }> = [
  { id: 'goal', label: '⌖ 目标', hint: '点击地图任意可达点，下达配送目标' },
  { id: 'wall', label: '▦ 画障碍', hint: '点击 / 拖拽绘制书架与临时障碍' },
  { id: 'erase', label: '⌫ 擦除', hint: '点击 / 拖拽擦除已绘制的障碍' },
  { id: 'robot', label: '▣ 放小车', hint: '点击地图重新放置配送小车' },
]

const LAYER_ITEMS: Array<{ key: keyof RenderLayers; label: string }> = [
  { key: 'showGrid', label: '米格' },
  { key: 'showInflation', label: '膨胀区' },
  { key: 'showDwa', label: 'DWA 采样' },
  { key: 'showTrace', label: '轨迹' },
  { key: 'showRawPath', label: 'A* 原始' },
]

function fmtClock(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function EventRow({ ev }: { ev: NavEvent }) {
  return (
    <li className={`navp-ev navp-ev-${ev.kind}`}>
      <i>{fmtClock(ev.time)}</i>
      <span>{ev.text}</span>
    </li>
  )
}

export function NavigationPage() {
  const ui = useSyncExternalStore(navSimulator.subscribe, navSimulator.getUiSnapshot)
  const [editMode, setEditMode] = useState<EditMode>('goal')
  const [layers, setLayers] = useState<RenderLayers>(DEFAULT_LAYERS)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const layersRef = useRef(layers)
  layersRef.current = layers
  /** 拖拽绘制中：true 加障碍，false 擦除，null 未绘制 */
  const paintingRef = useRef<boolean | null>(null)

  useEffect(() => {
    navSimulator.start()
    return () => navSimulator.stop()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cssW = 0
    let cssH = 0
    let dpr = 1
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      cssW = Math.max(1, rect.width)
      cssH = Math.max(1, rect.height)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const unsub = navSimulator.onFrame(() => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      renderScene(ctx, navSimulator.getRenderState(), layersRef.current, cssW, cssH)
    })
    return () => {
      ro.disconnect()
      unsub()
    }
  }, [])

  const eventToWorld = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const view = computeView(rect.width, rect.height, navSimulator.grid)
    return canvasToWorld(view, e.clientX - rect.left, e.clientY - rect.top)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = eventToWorld(e)
    if (!p) return
    if (editMode === 'goal') {
      navSimulator.setGoalWorld(p.x, p.y)
    } else if (editMode === 'robot') {
      navSimulator.teleportRobot(p.x, p.y)
    } else {
      const add = editMode === 'wall'
      paintingRef.current = add
      navSimulator.paintObstacle(p.x, p.y, add)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (paintingRef.current === null) return
    const p = eventToWorld(e)
    if (p) navSimulator.paintObstacle(p.x, p.y, paintingRef.current)
  }

  const endPaint = () => {
    paintingRef.current = null
  }

  const hint = EDIT_MODES.find((m) => m.id === editMode)?.hint ?? ''

  return (
    <div className="page navp-page">
      <div className="navp-grid">
        <section className="panel navp-map-panel">
          <header className="panel-head">
            <h2>
              配送导航<span className="panel-sub">PATH PLANNING</span>
            </h2>
            <span className="panel-hint">A* 全局规划 · 纯追踪跟踪 · DWA 局部避障</span>
          </header>
          <div className="navp-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              className="navp-canvas"
              aria-label="配送导航 2D 地图：图书馆楼层 19.2 × 11.2 米"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPaint}
              onPointerCancel={endPaint}
            />
            <div className="navp-hud">
              <span className={`navp-phase navp-phase-${ui.phase}`}>{phaseLabel(ui.phase)}</span>
              {ui.goalLabel ? <span className="navp-goal-chip">目标 · {ui.goalLabel}</span> : null}
              <span className="navp-hint">{hint}</span>
            </div>
            <div className="navp-metrics">
              <span className="navp-chip">
                规划 <b>{ui.planMs.toFixed(1)}</b> ms
              </span>
              <span className="navp-chip">
                展开 <b>{ui.expanded}</b> 节点
              </span>
              <span className="navp-chip">
                路径 <b>{ui.pathLen.toFixed(1)}</b> m
              </span>
              <span className="navp-chip">
                已行驶 <b>{ui.traveled.toFixed(1)}</b> m
              </span>
              <span className="navp-chip">
                速度 <b>{ui.speed.toFixed(2)}</b> m/s
              </span>
              <span className="navp-chip">
                重规划 <b>{ui.replans}</b> 次
              </span>
            </div>
          </div>
        </section>

        <aside className="navp-side">
          <section className="panel">
            <header className="panel-head">
              <h2>
                一键派送<span className="panel-sub">DISPATCH</span>
              </h2>
            </header>
            <div className="navp-stations">
              {navSimulator.stations.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className={`navp-station-btn ${ui.goalLabel === st.label ? 'active' : ''}`}
                  onClick={() => navSimulator.dispatchTo(st.id)}
                >
                  <i>{st.icon}</i>
                  {st.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>
                地图与控制<span className="panel-sub">CONTROLS</span>
              </h2>
            </header>
            <div className="navp-modes" role="toolbar" aria-label="地图编辑模式">
              {EDIT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`navp-mode-btn ${editMode === m.id ? 'active' : ''}`}
                  title={m.hint}
                  onClick={() => setEditMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="navp-slider">
              <span>
                速度上限 <b>×{ui.speedScale.toFixed(1)}</b>
              </span>
              <input
                type="range"
                min={0.3}
                max={1.6}
                step={0.1}
                value={ui.speedScale}
                aria-label="小车速度上限倍率"
                onChange={(e) => navSimulator.setSpeedScale(Number(e.target.value))}
              />
            </label>

            <div className="navp-toggles">
              <button
                type="button"
                className={`navp-toggle ${ui.dynEnabled ? 'active' : ''}`}
                onClick={() => navSimulator.toggleDynamic()}
              >
                行人模拟
              </button>
              {LAYER_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`navp-toggle ${layers[item.key] ? 'active' : ''}`}
                  onClick={() => setLayers((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="navp-actions">
              <button type="button" className="btn" onClick={() => navSimulator.togglePaused()}>
                {ui.paused ? '▶ 继续' : '⏸ 暂停'}
              </button>
              <button type="button" className="btn" onClick={() => navSimulator.resetWorld()}>
                ↺ 重置地图
              </button>
            </div>
          </section>

          <section className="panel navp-log-panel">
            <header className="panel-head">
              <h2>
                导航日志<span className="panel-sub">NAV LOG</span>
              </h2>
              <span className="panel-hint">{fmtClock(ui.simTime)}</span>
            </header>
            <ul className="navp-log">
              {ui.events.map((ev) => (
                <EventRow key={ev.id} ev={ev} />
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
