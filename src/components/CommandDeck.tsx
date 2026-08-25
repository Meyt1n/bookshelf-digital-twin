import { useState } from 'react'
import { PHASE_LABELS } from '../twin/engine'
import { twinEngine } from '../twin/useTwin'
import type { TwinSnapshot } from '../types'

export function CommandDeck({ snapshot }: { snapshot: TwinSnapshot }) {
  const [takeText, setTakeText] = useState('')
  const busy = snapshot.task !== null || snapshot.ocr !== null
  const live = snapshot.mode === 'live'
  const task = snapshot.task

  const submitTake = () => {
    const text = takeText.trim()
    if (!text) return
    twinEngine.commandTakeByText(text)
    setTakeText('')
  }

  const nowLabel = task
    ? `${task.action === 'store' ? '存书' : '取书'} · ${PHASE_LABELS[task.phase] ?? task.phase}`
    : snapshot.ocr
      ? '视觉识别中'
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

      <span className="deck-divider" />

      <button
        type="button"
        className={`btn btn-violet ${snapshot.modules.uv.status === 'running' ? 'is-running' : ''}`}
        disabled={snapshot.modules.uv.status === 'running'}
        onClick={() => twinEngine.commandUv()}
      >
        ☢ 紫外消毒
      </button>
      <button
        type="button"
        className={`btn btn-blue ${snapshot.modules.laminate.status === 'running' ? 'is-running' : ''}`}
        disabled={snapshot.modules.laminate.status === 'running'}
        onClick={() => twinEngine.commandLaminate()}
      >
        ▣ 塑封书籍
      </button>

      <span className="deck-divider" />

      <label className={`auto-toggle ${live ? 'disabled' : ''}`} title="自动仿真家庭成员的存取书行为">
        <input
          type="checkbox"
          checked={snapshot.autonomous}
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
