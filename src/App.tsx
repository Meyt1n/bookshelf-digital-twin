import { useEffect, useRef, useState } from 'react'
import { AnalyticsPage } from './components/AnalyticsPage'
import { BooksPage } from './components/BooksPage'
import { CommandDeck } from './components/CommandDeck'
import { CompartmentPanel } from './components/CompartmentPanel'
import { DevicesPage } from './components/DevicesPage'
import { EventStream } from './components/EventStream'
import { InventoryTabs } from './components/InventoryTabs'
import { KpiStrip } from './components/KpiStrip'
import { ModulesPanel } from './components/ModulesPanel'
import { RegisterPanel } from './components/RegisterPanel'
import { TaskCard } from './components/TaskCard'
import { TelemetryPanel } from './components/TelemetryPanel'
import { TopBar } from './components/TopBar'
import type { PageId } from './components/TopBar'
import { CAMERA_PRESETS, cameraForTask, TwinScene } from './scene/TwinScene'
import { useTwin } from './twin/useTwin'
import type { TwinSnapshot } from './types'

function OverviewPage({ snapshot }: { snapshot: TwinSnapshot }) {
  const [resetToken, setResetToken] = useState(0)
  const [presetIdx, setPresetIdx] = useState(0)
  const [cruise, setCruise] = useState(false)
  const [followTask, setFollowTask] = useState(true)
  const presetIdxRef = useRef(presetIdx)
  presetIdxRef.current = presetIdx

  const hovered =
    snapshot.hoveredCid !== null
      ? snapshot.compartments.find((c) => c.cid === snapshot.hoveredCid)
      : null
  const hoveredBook =
    hovered && hovered.bookId !== null ? snapshot.booksById[hovered.bookId] : null

  useEffect(() => {
    if (!followTask) return
    const task = snapshot.task
    if (!task || task.phase === 'done' || task.phase === 'fault') return
    const id = cameraForTask(task.action, task.phase)
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === id)
    if (idx < 0 || idx === presetIdxRef.current) return
    setPresetIdx(idx)
    setResetToken((t) => t + 1)
  }, [followTask, snapshot.task?.action, snapshot.task?.id, snapshot.task?.phase])

  useEffect(() => {
    if (!followTask) return
    if (snapshot.modules.laminate.status !== 'running') return
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === 'laminate')
    if (idx < 0 || idx === presetIdxRef.current) return
    setPresetIdx(idx)
    setResetToken((t) => t + 1)
  }, [followTask, snapshot.modules.laminate.status])

  const applyPreset = (idx: number) => {
    setFollowTask(false)
    setCruise(false)
    setPresetIdx(idx)
    setResetToken((t) => t + 1)
  }

  return (
    <div className="layout">
      <aside className="col col-left">
        <CompartmentPanel snapshot={snapshot} />
        <InventoryTabs snapshot={snapshot} />
      </aside>

      <main className="viewport">
        <TwinScene snapshot={snapshot} presetIdx={presetIdx} resetToken={resetToken} cruise={cruise} />
        <div className="viewport-frame" />
        <div className="vertical-motto">格物致知 · 藏书于阁</div>
        <KpiStrip snapshot={snapshot} />
        <TaskCard snapshot={snapshot} />
        {hovered && (
          <div className="hover-tip">
            <b>
              {hovered.floor} 层 {hovered.cell} 号格
            </b>
            {hoveredBook ? (
              <span>
                《{hoveredBook.title}》 · {hoveredBook.author}
              </span>
            ) : (
              <span className="c-dim">空闲 · 点击查看详情</span>
            )}
          </div>
        )}
        <div className="view-tools">
          <div className="view-tool-row">
            <button
              type="button"
              className={`view-tool-btn ${followTask ? 'active' : ''}`}
              onClick={() => {
                setFollowTask((v) => {
                  const next = !v
                  if (next) setCruise(false)
                  return next
                })
              }}
              title="作业时自动切到对应机位"
            >
              跟随
            </button>
            <button
              type="button"
              className={`view-tool-btn ${cruise ? 'active' : ''}`}
              onClick={() => {
                setCruise((v) => {
                  const next = !v
                  if (next) setFollowTask(false)
                  return next
                })
              }}
              title="自动环绕巡航"
            >
              巡航
            </button>
            <button
              type="button"
              className="view-tool-btn"
              onClick={() => setResetToken((t) => t + 1)}
              title="恢复当前预设视角"
            >
              复位
            </button>
          </div>
          <div className="cam-presets">
            {CAMERA_PRESETS.map((preset, i) => (
              <button
                key={preset.id}
                type="button"
                className={`view-tool-btn ${presetIdx === i ? 'active' : ''}`}
                onClick={() => applyPreset(i)}
                title={`切换到${preset.label}视角`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {(CAMERA_PRESETS[presetIdx]?.id === 'cabinet' ||
            CAMERA_PRESETS[presetIdx]?.id === 'robot' ||
            CAMERA_PRESETS[presetIdx]?.id === 'laminate') && (
            <span className="view-inspect-hint">半透明查看内部结构 · 可拖拽环视</span>
          )}
        </div>
        <CommandDeck snapshot={snapshot} />
      </main>

      <aside className="col col-right">
        <TelemetryPanel snapshot={snapshot} />
        <ModulesPanel snapshot={snapshot} />
        <RegisterPanel snapshot={snapshot} />
        <EventStream snapshot={snapshot} />
      </aside>
    </div>
  )
}

export default function App() {
  const snapshot = useTwin()
  const [page, setPage] = useState<PageId>('overview')

  return (
    <div className="app">
      <TopBar snapshot={snapshot} page={page} onNavigate={setPage} />
      {page === 'overview' && <OverviewPage snapshot={snapshot} />}
      {page === 'books' && <BooksPage snapshot={snapshot} onTaskStart={() => setPage('overview')} />}
      {page === 'analytics' && <AnalyticsPage snapshot={snapshot} />}
      {page === 'devices' && <DevicesPage snapshot={snapshot} />}
    </div>
  )
}
