import { useEffect, useState } from 'react'
import { PHASE_LABELS } from '../twin/engine'
import { isDemoRunning, startDemoScript, startFullDemoScript } from '../twin/demoScript'
import { commandDeckEqual, selectCommandDeck } from '../twin/selectors'
import { twinEngine, useTwinSelector } from '../twin/useTwin'

export function CommandDeck() {
  const deck = useTwinSelector(selectCommandDeck, commandDeckEqual)
  const [takeText, setTakeText] = useState('')
  const [demoOn, setDemoOn] = useState(false)
  const busy = deck.task !== null || deck.ocr !== null || demoOn
  const live = deck.mode === 'live'
  const task = deck.task

  useEffect(() => {
    if (!demoOn) return
    const id = window.setInterval(() => {
      if (!isDemoRunning()) setDemoOn(false)
    }, 400)
    return () => window.clearInterval(id)
  }, [demoOn])

  const submitTake = () => {
    const text = takeText.trim()
    if (!text) return
    twinEngine.commandTakeByText(text)
    setTakeText('')
  }

  const runDemo = () => {
    if (live || busy) return
    setDemoOn(true)
    startDemoScript()
  }

  const runFullDemo = () => {
    if (live || busy) return
    setDemoOn(true)
    startFullDemoScript()
  }

  const nowLabel = task
    ? `${task.action === 'store' ? '存书' : '取书'} · ${PHASE_LABELS[task.phase] ?? task.phase}`
    : deck.ocr
      ? '视觉识别中'
      : demoOn
        ? '演示剧本执行中'
        : null

  return (
    <div className={`command-deck ${busy ? 'is-busy' : ''}`}>
      {nowLabel && (
        <span className="deck-now" title="当前作业阶段">
          <i />
          {nowLabel}
        </span>
      )}

      <button
        type="button"
        className="btn btn-green"
        disabled={busy || live}
        title={live ? '联机模式请在实体端存书' : '送书机器人入柜 → 夹板夹紧拍照 → 夹爪入库'}
        onClick={() => twinEngine.commandCaptureStore()}
      >
        ↥ 存书
      </button>

      <div className="take-group">
        <input
          className="input"
          placeholder="书名关键词取书…"
          value={takeText}
          disabled={busy}
          onChange={(e) => setTakeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitTake()
          }}
        />
        <button type="button" className="btn btn-amber" disabled={busy || !takeText.trim()} onClick={submitTake}>
          ⤓ 取书
        </button>
      </div>

      <button
        type="button"
        className={`btn btn-cyan ${demoOn ? 'is-running' : ''}`}
        disabled={busy || live}
        title="一键跑存书→识别→入库→取书（答辩/录屏）"
        onClick={runDemo}
      >
        ▶ 演示剧本
      </button>

      <button
        type="button"
        className={`btn btn-cyan ${demoOn ? 'is-running' : ''}`}
        disabled={busy || live}
        title="存书 → 2D 导航配送藏书区 → 取书 → 返回充电桩（全链路联动）"
        onClick={runFullDemo}
      >
        ⏩ 全流程演示
      </button>

      <span className="deck-divider" />

      <button
        type="button"
        className={`btn btn-violet ${deck.uvStatus === 'running' ? 'is-running' : ''}`}
        disabled={deck.uvStatus === 'running'}
        onClick={() => twinEngine.commandUv()}
      >
        ☢ 紫外消毒
      </button>
      <button
        type="button"
        className={`btn btn-blue ${deck.laminateStatus === 'running' ? 'is-running' : ''}`}
        disabled={deck.laminateStatus === 'running'}
        onClick={() => twinEngine.commandLaminate()}
      >
        ▣ 塑封书籍
      </button>

      <span className="deck-divider" />

      <label className={`auto-toggle ${live ? 'disabled' : ''}`} title="自动仿真家庭成员的存取书行为">
        <input
          type="checkbox"
          checked={deck.autonomous}
          disabled={live}
          onChange={(e) => twinEngine.setAutonomous(e.target.checked)}
        />
        <span className="auto-track">
          <span className="auto-thumb" />
        </span>
        自主活动
      </label>

      <button type="button" className="btn btn-danger" onClick={() => twinEngine.commandEmergencyStop()}>
        ◼ 急停
      </button>
    </div>
  )
}
