import { twinEngine } from './engine'

const DEMO_TIMEOUT_MS = 120_000

let demoRunning = false

export function isDemoRunning(): boolean {
  return demoRunning
}

function waitFor(
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

    const unsub = twinEngine.subscribe(() => {
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
      await waitFor(isIdle, signal, timeoutAt)
      if (signal.aborted) return

      twinEngine.commandCaptureStore()

      await waitFor(isIdle, signal, timeoutAt)
      if (signal.aborted) return

      const cid = findOccupiedCid()
      if (cid === null) return

      twinEngine.commandTake(cid, '演示脚本')

      await waitFor(() => {
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
