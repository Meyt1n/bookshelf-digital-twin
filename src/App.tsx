import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { CommandDeck } from './components/CommandDeck'
import { CompartmentPanel } from './components/CompartmentPanel'
import { EventStream } from './components/EventStream'
import { InventoryTabs } from './components/InventoryTabs'
import { KpiStrip } from './components/KpiStrip'
import { ModulesPanel } from './components/ModulesPanel'
import { RegisterPanel } from './components/RegisterPanel'
import { TaskCard } from './components/TaskCard'
import { TelemetryPanel } from './components/TelemetryPanel'
import { TopBar } from './components/TopBar'
import type { PageId } from './components/TopBar'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { CAMERA_PRESETS, cameraForTask } from './scene/cameraPresets'
import { useTwin } from './twin/useTwin'
import type { TwinSnapshot } from './types'

const TwinScene = lazy(() =>
  import('./scene/TwinScene').then((m) => ({ default: m.TwinScene })),
)
const BooksPage = lazy(() =>
  import('./components/BooksPage').then((m) => ({ default: m.BooksPage })),
)
const AnalyticsPage = lazy(() =>
  import('./components/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const DevicesPage = lazy(() =>
  import('./components/DevicesPage').then((m) => ({ default: m.DevicesPage })),
)

function PageFallback({ label }: { label: string }) {
  return (
    <div className="page-fallback" role="status">
      <div className="page-fallback-pulse" />
      <span>{label}</span>
    </div>
  )
}

function PageGate({
  children,
  title,
  hint,
  loading,
}: {
  children: ReactNode
  title: string
  hint: string
  loading: string
}) {
  return (
    <ErrorBoundary title={title} hint={hint} fallbackClassName="error-boundary page-error">
      <Suspense fallback={<PageFallback label={loading} />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

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
  }, [followTask, snapshot.task])

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
        <CompartmentPanel />
        <InventoryTabs />
      </aside>

      <main className="viewport">
        <ErrorBoundary
          title="3D 孪生场景加载失败"
          hint="模型资源可能未就绪，可重试；持续失败请检查 public/model 下的 GLB。"
          fallbackClassName="error-boundary viewport-error"
        >
          <Suspense
            fallback={
              <div className="scene-fallback" role="status">
                <div className="scene-fallback-ring" />
                <span>正在装载柜体与机构模型…</span>
              </div>
            }
          >
            <TwinScene snapshot={snapshot} presetIdx={presetIdx} resetToken={resetToken} cruise={cruise} />
          </Suspense>
        </ErrorBoundary>
        <div className="viewport-frame" />
        <div className="vertical-motto">格物致知 · 藏书于阁</div>
        <KpiStrip />
        <TaskCard />
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
        <CommandDeck />
      </main>

      <aside className="col col-right">
        <TelemetryPanel />
        <ModulesPanel />
        <RegisterPanel />
        <EventStream />
      </aside>
    </div>
  )
}

export default function App() {
  const snapshot = useTwin()
  const [page, setPage] = useState<PageId>('overview')

  return (
    <div className="app">
      <TopBar page={page} onNavigate={setPage} />
      <ErrorBoundary title="驾驶舱页面异常" hint="页面渲染出错，可重试或切换到其他页签。">
        {page === 'overview' && <OverviewPage snapshot={snapshot} />}
        {page === 'books' && (
          <PageGate title="图书资产页异常" hint="可重试加载图书页。" loading="加载图书资产…">
            <BooksPage snapshot={snapshot} onTaskStart={() => setPage('overview')} />
          </PageGate>
        )}
        {page === 'analytics' && (
          <PageGate title="数据分析页异常" hint="可重试加载分析页。" loading="加载数据分析…">
            <AnalyticsPage snapshot={snapshot} />
          </PageGate>
        )}
        {page === 'devices' && (
          <PageGate title="设备诊断页异常" hint="可重试加载设备页。" loading="加载设备诊断…">
            <DevicesPage snapshot={snapshot} />
          </PageGate>
        )}
      </ErrorBoundary>
    </div>
  )
}
