import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertBar } from './components/AlertBar'
import { CommandDeck } from './components/CommandDeck'
import { CompartmentPanel } from './components/CompartmentPanel'
import { EventStream } from './components/EventStream'
import { InventoryTabs } from './components/InventoryTabs'
import { KpiStrip } from './components/KpiStrip'
import { ModulesPanel } from './components/ModulesPanel'
import { RegisterPanel } from './components/RegisterPanel'
import { TaskCard } from './components/TaskCard'
import { TaskHistoryDrawer } from './components/TaskHistoryDrawer'
import { TelemetryPanel } from './components/TelemetryPanel'
import { TopBar } from './components/TopBar'
import type { PageId } from './components/TopBar'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import {
  applyDocumentPerfClass,
  buildGraphicsProfile,
  type GraphicsProfile,
} from './graphics/perfTier'
import { CAMERA_PRESETS, cameraForTask } from './scene/cameraPresets'
import {
  cameraFollowEqual,
  hoverTipEqual,
  selectCameraFollow,
  selectHoverTip,
} from './twin/selectors'
import { twinEngine, useTwin, useTwinSelector } from './twin/useTwin'

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
const NavigationPage = lazy(() =>
  import('./components/NavigationPage').then((m) => ({ default: m.NavigationPage })),
)

type DrawerId = 'left' | 'right' | null

function PageSkeleton({
  variant,
}: {
  variant: 'books' | 'analytics' | 'navigation' | 'devices'
}) {
  return (
    <div className={`page-skeleton sk-${variant}`} role="status" aria-label="页面加载中">
      <div className="sk-banner" />
      <div className="sk-grid">
        {Array.from({ length: variant === 'analytics' ? 6 : 4 }).map((_, i) => (
          <div key={i} className="sk-card" />
        ))}
      </div>
    </div>
  )
}

function PageGate({
  children,
  title,
  hint,
  skeleton,
}: {
  children: ReactNode
  title: string
  hint: string
  skeleton: ReactNode
}) {
  return (
    <ErrorBoundary title={title} hint={hint} fallbackClassName="error-boundary page-error">
      <Suspense fallback={skeleton}>{children}</Suspense>
    </ErrorBoundary>
  )
}

function BooksRoute({ onTaskStart }: { onTaskStart: () => void }) {
  const snapshot = useTwin()
  return <BooksPage snapshot={snapshot} onTaskStart={onTaskStart} />
}

function AnalyticsRoute() {
  const snapshot = useTwin()
  return <AnalyticsPage snapshot={snapshot} />
}

function DevicesRoute() {
  const snapshot = useTwin()
  return <DevicesPage snapshot={snapshot} />
}

function OverviewPage({
  active,
  profile,
  drawer,
  onDrawer,
}: {
  active: boolean
  profile: GraphicsProfile
  drawer: DrawerId
  onDrawer: (id: DrawerId) => void
}) {
  const [resetToken, setResetToken] = useState(0)
  const [presetIdx, setPresetIdx] = useState(0)
  const [cruise, setCruise] = useState(false)
  const [followTask, setFollowTask] = useState(true)
  const [docHidden, setDocHidden] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const presetIdxRef = useRef(presetIdx)
  presetIdxRef.current = presetIdx

  const hover = useTwinSelector(selectHoverTip, hoverTipEqual)
  const follow = useTwinSelector(selectCameraFollow, cameraFollowEqual)

  useEffect(() => {
    const onVis = () => setDocHidden(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!active || docHidden) setCruise(false)
  }, [active, docHidden])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement | null)?.isContentEditable) return

      if (e.code === 'Space') {
        e.preventDefault()
        twinEngine.commandEmergencyStop()
        return
      }
      if (e.key === 'h' || e.key === 'H') {
        setHistoryOpen((v) => !v)
        return
      }
      const digit = e.code.match(/^Digit(\d)$/)
      if (digit) {
        const n = Number(digit[1])
        const idx = n === 0 ? 9 : n - 1
        if (idx >= 0 && idx < CAMERA_PRESETS.length) {
          e.preventDefault()
          setFollowTask(false)
          setCruise(false)
          setPresetIdx(idx)
          setResetToken((t) => t + 1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  useEffect(() => {
    if (!followTask || !active) return
    if (!follow.taskAction || !follow.taskPhase) return
    if (follow.taskPhase === 'done' || follow.taskPhase === 'fault') return
    const id = cameraForTask(follow.taskAction, follow.taskPhase)
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === id)
    if (idx < 0 || idx === presetIdxRef.current) return
    setPresetIdx(idx)
    setResetToken((t) => t + 1)
  }, [followTask, active, follow.taskAction, follow.taskPhase, follow.taskId])

  useEffect(() => {
    if (!followTask || !active) return
    if (!follow.laminateRunning) return
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === 'laminate')
    if (idx < 0 || idx === presetIdxRef.current) return
    setPresetIdx(idx)
    setResetToken((t) => t + 1)
  }, [followTask, active, follow.laminateRunning])

  const applyPreset = (idx: number) => {
    setFollowTask(false)
    setCruise(false)
    setPresetIdx(idx)
    setResetToken((t) => t + 1)
  }

  const sceneActive = active && !docHidden
  const effectiveCruise = cruise && sceneActive && profile.envAnimate

  return (
    <div
      className={`layout ${drawer === 'left' ? 'drawer-left' : ''} ${drawer === 'right' ? 'drawer-right' : ''}`}
    >
      <aside className={`col col-left ${drawer === 'left' ? 'is-open' : ''}`}>
        <CompartmentPanel />
        <InventoryTabs />
      </aside>

      <main className="viewport">
        <AlertBar onOpenHistory={() => setHistoryOpen(true)} />
        <ErrorBoundary
          title="3D 孪生场景加载失败"
          hint="模型资源可能未就绪，可重试；持续失败请检查 public/model 下的 GLB。"
          fallbackClassName="error-boundary viewport-error"
        >
          <Suspense
            fallback={
              <div className="scene-fallback" role="status">
                <div className="scene-load-bar">
                  <i style={{ width: '18%' }} />
                </div>
                <span>正在装载柜体模型…</span>
              </div>
            }
          >
            <TwinScene
              active={sceneActive}
              profile={profile}
              presetIdx={presetIdx}
              resetToken={resetToken}
              cruise={effectiveCruise}
            />
          </Suspense>
        </ErrorBoundary>
        <div className="viewport-frame" />
        <div className="vertical-motto">格物致知 · 藏书于阁</div>
        <KpiStrip />
        <TaskCard />
        <TaskHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
        {hover.hoveredCid !== null && hover.floor !== null && hover.cell !== null && (
          <div className="hover-tip">
            <b>
              {hover.floor} 层 {hover.cell} 号格
            </b>
            {hover.title ? (
              <span>
                《{hover.title}》 · {hover.author}
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
              disabled={!profile.envAnimate}
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
            <button
              type="button"
              className={`view-tool-btn ${historyOpen ? 'active' : ''}`}
              onClick={() => setHistoryOpen((v) => !v)}
              title="任务回放（快捷键 H）"
            >
              回放
            </button>
          </div>
          <div className="cam-presets" role="toolbar" aria-label="机位预设，数字键 1-0 切换">
            {CAMERA_PRESETS.map((preset, i) => (
              <button
                key={preset.id}
                type="button"
                className={`view-tool-btn ${presetIdx === i ? 'active' : ''}`}
                onClick={() => applyPreset(i)}
                title={`切换到${preset.label}视角（快捷键 ${i === 9 ? 0 : i + 1}）`}
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
        <div className="mobile-dock" role="toolbar" aria-label="面板切换">
          <button
            type="button"
            className={`dock-btn ${drawer === 'left' ? 'active' : ''}`}
            onClick={() => onDrawer(drawer === 'left' ? null : 'left')}
          >
            格口
          </button>
          <button
            type="button"
            className={`dock-btn ${drawer === null ? 'active' : ''}`}
            onClick={() => onDrawer(null)}
          >
            3D
          </button>
          <button
            type="button"
            className={`dock-btn ${drawer === 'right' ? 'active' : ''}`}
            onClick={() => onDrawer(drawer === 'right' ? null : 'right')}
          >
            遥测
          </button>
        </div>
      </main>

      <aside className={`col col-right ${drawer === 'right' ? 'is-open' : ''}`}>
        <TelemetryPanel />
        <ModulesPanel />
        <RegisterPanel />
        <EventStream />
      </aside>

      {drawer !== null && (
        <button type="button" className="drawer-scrim" aria-label="关闭面板" onClick={() => onDrawer(null)} />
      )}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<PageId>('overview')
  const [drawer, setDrawer] = useState<DrawerId>(null)
  const [bootPhase, setBootPhase] = useState(0)
  const profile = useMemo(() => {
    const p = buildGraphicsProfile()
    applyDocumentPerfClass(p)
    return p
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = () => {
      if (!cancelled) void import('./scene/TwinScene')
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run)
      return () => {
        cancelled = true
        window.cancelIdleCallback?.(id)
      }
    }
    const id = window.setTimeout(run, 400)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [])

  useEffect(() => {
    if (profile.reducedMotion) {
      setBootPhase(3)
      return
    }
    const t1 = window.setTimeout(() => setBootPhase(1), 40)
    const t2 = window.setTimeout(() => setBootPhase(2), 220)
    const t3 = window.setTimeout(() => setBootPhase(3), 480)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [profile.reducedMotion])

  useEffect(() => {
    setDrawer(null)
  }, [page])

  return (
    <div className={`app boot-${bootPhase}`}>
      <TopBar page={page} onNavigate={setPage} />
      <ErrorBoundary title="驾驶舱页面异常" hint="页面渲染出错，可重试或切换到其他页签。">
        <div
          className={`page-layer ${page === 'overview' ? 'is-active' : 'is-parked'}`}
          aria-hidden={page !== 'overview'}
        >
          <OverviewPage
            active={page === 'overview'}
            profile={profile}
            drawer={drawer}
            onDrawer={setDrawer}
          />
        </div>
        {page === 'books' && (
          <PageGate
            title="图书资产页异常"
            hint="可重试加载图书页。"
            skeleton={<PageSkeleton variant="books" />}
          >
            <BooksRoute onTaskStart={() => setPage('overview')} />
          </PageGate>
        )}
        {page === 'analytics' && (
          <PageGate
            title="数据分析页异常"
            hint="可重试加载分析页。"
            skeleton={<PageSkeleton variant="analytics" />}
          >
            <AnalyticsRoute />
          </PageGate>
        )}
        {page === 'navigation' && (
          <PageGate
            title="配送导航页异常"
            hint="可重试加载导航页。"
            skeleton={<PageSkeleton variant="navigation" />}
          >
            <NavigationPage />
          </PageGate>
        )}
        {page === 'devices' && (
          <PageGate
            title="设备诊断页异常"
            hint="可重试加载设备页。"
            skeleton={<PageSkeleton variant="devices" />}
          >
            <DevicesRoute />
          </PageGate>
        )}
      </ErrorBoundary>
    </div>
  )
}
