// @vitest-environment jsdom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwinEngine, twinEngine } from '../engine'

/* jsdom 没有 EventSource：用最小桩承接 connectStream / disconnectStream */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  closed = false
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  close(): void {
    this.closed = true
  }
}

/** 实体端 /api/compartments 载荷：cid 3 放一本书目之外的书 → 合成 id 903 */
const LIVE_ROWS = Array.from({ length: 8 }, (_, i) => {
  const cid = i + 1
  return {
    cid,
    x: cid <= 4 ? 1 : 2,
    y: ((cid - 1) % 4) + 1,
    status: cid === 3 ? 'occupied' : 'free',
    book: cid === 3 ? '实体侧新书' : null,
  }
})

function mockFetch(url: string): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  if (url.includes('/api/compartments')) {
    return Promise.resolve({ ok: true, json: async () => LIVE_ROWS })
  }
  // climate / borrow_logs：res.ok=false → 引擎按拉取失败处理
  return Promise.resolve({ ok: false, json: async () => ({}) })
}

async function makeLiveEngine(): Promise<TwinEngine> {
  const engine = new TwinEngine()
  await engine.enterLive()
  expect(engine.getSnapshot().mode).toBe('live')
  return engine
}

describe('联机模式 · 指令告警与合成书清理', () => {
  let engine: TwinEngine | null = null

  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('fetch', vi.fn(mockFetch))
  })

  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    twinEngine.dispose()
  })

  it('enterLive 同步实体格口，未知书名生成合成书目（id = 900 + cid）', async () => {
    engine = await makeLiveEngine()
    const snap = engine.getSnapshot()
    expect(snap.liveHealthy).toBe(true)
    expect(snap.compartments).toHaveLength(8)
    expect(snap.compartments.find((c) => c.cid === 3)?.status).toBe('occupied')
    expect(snap.booksById[903]?.title).toBe('实体侧新书')
    expect(snap.stored[3]?.bookId).toBe(903)
  })

  it('commandStoreTo 联机时推送告警事件，不启动任务', async () => {
    engine = await makeLiveEngine()
    engine.commandStoreTo(1, 1)
    const snap = engine.getSnapshot()
    expect(snap.task).toBeNull()
    expect(snap.events[0].level).toBe('warn')
    expect(snap.events[0].text).toContain('联机模式请在实体端存书')
  })

  it('commandStoreBook 联机时推送告警事件，不启动任务', async () => {
    engine = await makeLiveEngine()
    engine.commandStoreBook(1)
    const snap = engine.getSnapshot()
    expect(snap.task).toBeNull()
    expect(snap.events[0].level).toBe('warn')
    expect(snap.events[0].text).toContain('联机模式请在实体端存书')
  })

  it('commandCaptureStore 联机告警保持原行为（回归）', async () => {
    engine = await makeLiveEngine()
    engine.commandCaptureStore()
    const snap = engine.getSnapshot()
    expect(snap.task).toBeNull()
    expect(snap.events[0].level).toBe('warn')
    expect(snap.events[0].text).toContain('联机模式请在实体端拍照存书')
  })

  it('exitLive 回到仿真：合成书目（id ≥ 900）全部清除，仿真世界还原', async () => {
    engine = await makeLiveEngine()
    expect(engine.getSnapshot().booksById[903]).toBeDefined()

    engine.exitLive()
    const snap = engine.getSnapshot()
    expect(snap.mode).toBe('sim')
    const syntheticIds = Object.keys(snap.booksById)
      .map(Number)
      .filter((id) => id >= 900)
    expect(syntheticIds).toHaveLength(0)
    // 仿真初始在架分布还原（resetSimWorld 的 5 本初始藏书）
    expect(Object.keys(snap.stored)).toHaveLength(5)
    expect(snap.compartments.filter((c) => c.status === 'occupied')).toHaveLength(5)
    // SSE 通道已断开
    expect(FakeEventSource.instances.every((es) => es.closed)).toBe(true)
  })
})
