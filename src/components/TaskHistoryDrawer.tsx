import { useSyncExternalStore } from 'react'
import { PHASE_LABELS } from '../twin/engine'
import { clearHistory, getHistory, subscribeHistory, type TaskHistoryRecord } from '../twin/taskHistory'

function useTaskHistory(): readonly TaskHistoryRecord[] {
  return useSyncExternalStore(subscribeHistory, getHistory, getHistory)
}

type Props = {
  open: boolean
  onClose: () => void
}

/** 最近任务时间线回放列表（仿真价值展示） */
export function TaskHistoryDrawer({ open, onClose }: Props) {
  const history = useTaskHistory()
  if (!open) return null

  return (
    <div className="history-drawer" role="dialog" aria-label="任务回放">
      <header className="history-head">
        <h3>任务回放</h3>
        <span className="panel-sub">最近 {history.length} 次</span>
        <button type="button" className="view-tool-btn" onClick={() => clearHistory()}>
          清空
        </button>
        <button type="button" className="view-tool-btn" onClick={onClose} aria-label="关闭">
          关闭
        </button>
      </header>
      <ul className="history-list">
        {history.length === 0 && <li className="inv-empty">尚无已完成任务 · 跑一次演示剧本即可生成</li>}
        {history.map((rec) => (
          <li key={`${rec.id}-${rec.endedAt}`} className={`history-item ${rec.fault ? 'is-fault' : ''}`}>
            <div className="history-item-head">
              <span className={`task-tag ${rec.action === 'store' ? 'tag-store' : 'tag-take'}`}>
                {rec.action === 'store' ? '存书' : '取书'}
              </span>
              <b>《{rec.title}》</b>
              <em>{new Date(rec.endedAt).toLocaleTimeString()}</em>
            </div>
            <div className="history-phases" aria-label="相位序列">
              {rec.phases.map((p, i) => (
                <span key={`${p.phase}-${i}`} className="history-phase" title={PHASE_LABELS[p.phase]}>
                  {PHASE_LABELS[p.phase] ?? p.phase}
                </span>
              ))}
            </div>
            <div className="history-meta">
              {rec.actor} · {Math.max(0, Math.round((rec.endedAt - rec.startedAt) / 1000))}s
              {rec.fault ? ' · 急停' : ''}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
