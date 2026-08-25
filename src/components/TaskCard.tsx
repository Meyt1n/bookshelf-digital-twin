import { PHASE_LABELS, taskFlow } from '../twin/engine'
import { selectTaskCard, taskCardEqual } from '../twin/selectors'
import { useTwinSelector } from '../twin/useTwin'

export function TaskCard() {
  const { task, ocr, ocrTitle } = useTwinSelector(selectTaskCard, taskCardEqual)
  if (!task && !ocr) return null

  const ocrTotal = ocr?.stages.length ?? 0
  const ocrDone = ocr?.stages.filter((s) => s.emitted).length ?? 0
  const ocrCurrent = ocr ? (ocr.stages.find((s) => !s.emitted) ?? ocr.stages[ocrTotal - 1]) : null

  if (!task && ocr && ocrCurrent) {
    return (
      <div className="task-card ocr">
        <div className="task-card-head">
          <span className="task-tag tag-ocr">视觉识别</span>
          <span className="task-title">《{ocrTitle ?? '…'}》</span>
        </div>
        <div className="phase-now">
          <span className="phase-now-label">当前阶段</span>
          <strong>{ocrCurrent.text}</strong>
        </div>
        <div className="task-progress">
          <span style={{ width: `${ocrTotal ? (ocrDone / ocrTotal) * 100 : 0}%` }} />
        </div>
        <div className="task-meta">
          发起：{ocr.actor} · 目标格口 {ocr.targetCid}
        </div>
      </div>
    )
  }

  if (!task) return null
  const isFault = task.phase === 'fault'
  const flow = taskFlow(task.action)
  const activeIdx = flow.indexOf(task.phase)
  const pct = isFault ? 100 : task.phase === 'done' ? 100 : ((Math.max(activeIdx, 0) + 0.45) / flow.length) * 100

  return (
    <div className={`task-card ${isFault ? 'fault' : ''}`}>
      <div className="task-card-head">
        <span className={`task-tag ${task.action === 'store' ? 'tag-store' : 'tag-take'}`}>
          {task.action === 'store' ? '存书' : '取书'} {task.id}
        </span>
        <span className="task-title">《{task.title}》</span>
      </div>
      <div className="phase-now">
        <span className="phase-now-label">{isFault ? '状态' : '当前阶段'}</span>
        <strong>{PHASE_LABELS[task.phase] ?? task.phase}</strong>
      </div>
      <div className="phase-flow">
        {flow.map((phase, i) => {
          let cls = 'phase-step'
          if (isFault) cls += ' fault'
          else if (i < activeIdx || task.phase === 'done') cls += ' done'
          else if (i === activeIdx) cls += ' active'
          return (
            <span key={phase} className={cls} title={PHASE_LABELS[phase]}>
              <i />
            </span>
          )
        })}
      </div>
      <div className="task-progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      {ocr && ocrCurrent ? <div className="ocr-inline">{ocrCurrent.text}</div> : null}
      <div className="task-meta">
        {isFault
          ? '任务已急停 · 机构正在返回待机位'
          : `目标 ${task.floor} 层 ${task.cell} 号格 · 发起：${task.actor}`}
      </div>
    </div>
  )
}
