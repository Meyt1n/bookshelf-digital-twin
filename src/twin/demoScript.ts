import { twinEngine } from './engine'
import { getHistory, linkNavMission } from './taskHistory'

const DEMO_TIMEOUT_MS = 120_000
/** 全流程演示含两段 2D 导航行驶，放宽整体超时 */
const FULL_DEMO_TIMEOUT_MS = 240_000

/** 桥接模块按需加载：避免把导航栈静态打进总览首屏分包 */
type BridgeModule = typeof import('../nav/twinBridge')

let demoRunning = false

export function isDemoRunning(): boolean {
  return demoRunning
}

type Subscribe = (fn: () => void) => () => void

function waitFor(
  subscribe: Subscribe,
  predicate: () => boolean,
  signal: { aborted: boolean },
  timeoutAt: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    if (predicate()) {
      resolve()
      return
    }

    let timer: ReturnType<typeof setTimeout> | null = null
    const checkTimeout = () => {
      if (Date.now() > timeoutAt) {
        cleanup()
        reject(new Error('demo timeout'))
      }
    }

    const unsub = subscribe(() => {
      if (signal.aborted) {
        cleanup()
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      checkTimeout()
      if (predicate()) {
        cleanup()
        resolve()
      }
    })

    const cleanup = () => {
      unsub()
      if (timer !== null) clearInterval(timer)
    }

    checkTimeout()
    timer = setInterval(checkTimeout, 500)
  })
}

function isIdle(): boolean {
  const { task, ocr } = twinEngine.getSnapshot()
  return task === null && ocr === null
}

function findOccupiedCid(): number | null {
  const { compartments } = twinEngine.getSnapshot()
  const occupied = compartments.find((c) => c.status === 'occupied')
  return occupied?.cid ?? null
}

/** 最近一次归档任务的 id：作为随后导航段的联动 ID（回放抽屉拼接用） */
function latestTaskCorrelation(): string | null {
  const rec = getHistory()[0]
  if (!rec) return null
  linkNavMission(rec.id, rec.id)
  return rec.id
}

/**
 * 派送并等待到站。返回是否成功送达；受阻 / 不可达时写警告事件并返回 false。
 */
async function navMissionTo(
  bridge: BridgeModule,
  stationId: string,
  label: string,
  signal: { aborted: boolean },
  timeoutAt: number,
  correlationId?: string,
): Promise<boolean> {
  if (!bridge.demoDispatchStation(stationId, correlationId)) {
    twinEngine.noteScriptEvent(`导航无法前往「${label}」，全流程演示中止`, 'warn')
    return false
  }
  await waitFor(
    bridge.subscribeNavForDemo,
    () => ['arrived', 'blocked', 'unreachable'].includes(bridge.demoNavPhase()),
    signal,
    timeoutAt,
  )
  if (bridge.demoNavPhase() !== 'arrived') {
    twinEngine.noteScriptEvent(`导航前往「${label}」受阻，全流程演示中止`, 'warn')
    return false
  }
  return true
}

/**
 * 仿真演示编排：空闲 → 拍照存书 → 等待完成 → 取出一本在架图书。
 * 仅仿真模式；联机时通过 commandCaptureStore 触发系统告警后退出。
 * 返回 abort 函数；全局 120s 超时安全中止。
 */
export function startDemoScript(): () => void {
  if (twinEngine.getSnapshot().mode === 'live') {
    return () => {}
  }
  if (demoRunning) return () => {}

  const signal = { aborted: false }
  const timeoutAt = Date.now() + DEMO_TIMEOUT_MS
  demoRunning = true

  const abort = () => {
    signal.aborted = true
    demoRunning = false
  }

  void (async () => {
    try {
      await waitFor(twinEngine.subscribe, isIdle, signal, timeoutAt)
      if (signal.aborted) return

      twinEngine.commandCaptureStore()

      await waitFor(twinEngine.subscribe, isIdle, signal, timeoutAt)
      if (signal.aborted) return

      const cid = findOccupiedCid()
      if (cid === null) return

      twinEngine.commandTake(cid, '演示脚本')

      await waitFor(twinEngine.subscribe, () => {
        const { task } = twinEngine.getSnapshot()
        return task === null
      }, signal, timeoutAt)
    } catch {
      // timeout or abort — silent cleanup
    } finally {
      demoRunning = false
    }
  })()

  return abort
}

/**
 * 全流程演示（取书→导航→存书 一键剧本）：
 *   1. 拍照存书（机器人入柜 → 夹板拍照 → 夹爪入库）
 *   2. 2D 导航派送：充电桩 → 藏书区（孪生同步时 3D 小车跟随）
 *   3. 取出一本在架图书
 *   4. 导航返回充电桩
 * 仅仿真模式；联机时写用户可见告警后直接退出。
 * 每一幕通过 noteScriptEvent 写入事件流。返回 abort 函数。
 */
export function startFullDemoScript(): () => void {
  if (twinEngine.getSnapshot().mode === 'live') {
    twinEngine.noteScriptEvent('联机模式下无法运行全流程演示 · 请先切回仿真模式', 'warn')
    return () => {}
  }
  if (demoRunning) return () => {}

  const signal = { aborted: false }
  const timeoutAt = Date.now() + FULL_DEMO_TIMEOUT_MS
  demoRunning = true

  const abort = () => {
    signal.aborted = true
    demoRunning = false
  }

  void (async () => {
    try {
      const bridge = await import('../nav/twinBridge')
      if (signal.aborted) return

      twinEngine.noteScriptEvent('全流程演示开始 · 存书 → 导航配送 → 取书 → 返回充电桩')
      await waitFor(twinEngine.subscribe, isIdle, signal, timeoutAt)

      twinEngine.noteScriptEvent('演示 1/4 · 拍照存书流程启动')
      twinEngine.commandCaptureStore()
      await waitFor(twinEngine.subscribe, isIdle, signal, timeoutAt)
      if (signal.aborted) return

      bridge.ensureNavSimForDemo()
      twinEngine.noteScriptEvent('演示 2/4 · 配送小车前往藏书区')
      const storeCorr = latestTaskCorrelation() ?? undefined
      if (!(await navMissionTo(bridge, 'stacks', '藏书区', signal, timeoutAt, storeCorr))) return

      const cid = findOccupiedCid()
      if (cid === null) {
        twinEngine.noteScriptEvent('书架上没有可取的图书，全流程演示提前结束', 'warn')
        return
      }
      twinEngine.noteScriptEvent('演示 3/4 · 取书流程启动')
      twinEngine.commandTake(cid, '全流程演示')
      await waitFor(twinEngine.subscribe, () => {
        const { task } = twinEngine.getSnapshot()
        return task === null
      }, signal, timeoutAt)
      if (signal.aborted) return

      twinEngine.noteScriptEvent('演示 4/4 · 配送小车返回充电桩')
      const takeCorr = latestTaskCorrelation() ?? undefined
      if (!(await navMissionTo(bridge, 'charge', '充电桩', signal, timeoutAt, takeCorr))) return

      twinEngine.noteScriptEvent('全流程演示完成 · 存书 / 导航 / 取书 / 返航 全链路贯通', 'ok')
    } catch {
      // timeout or abort — silent cleanup
    } finally {
      demoRunning = false
    }
  })()

  return abort
}
