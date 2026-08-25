import type { TwinSnapshot } from '../types'

export function KpiStrip({ snapshot }: { snapshot: TwinSnapshot }) {
  const total = snapshot.compartments.length
  const used = snapshot.compartments.filter((c) => c.status === 'occupied').length
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const ops = snapshot.stats.storeCount + snapshot.stats.takeCount
  const live =
    (snapshot.task !== null && snapshot.task.phase !== 'done' && snapshot.task.phase !== 'fault') ||
    snapshot.ocr !== null ||
    snapshot.modules.uv.status === 'running' ||
    snapshot.modules.laminate.status === 'running'

  return (
    <div className={`kpi-strip ${live ? 'is-live' : ''}`}>
      {live ? (
        <div className="kpi-chip live">
          <b>
            <i />
          </b>
          <span>作业中</span>
        </div>
      ) : null}
      <div className="kpi-chip">
        <b>{total}</b>
        <span>格口总数</span>
      </div>
      <div className="kpi-chip cyan">
        <b>{used}</b>
        <span>在架图书</span>
      </div>
      <div className="kpi-chip green">
        <b>{total - used}</b>
        <span>空闲格口</span>
      </div>
      <div className="kpi-chip amber">
        <b>{pct}%</b>
        <span>使用率</span>
        <div className="kpi-bar" aria-hidden>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="kpi-chip violet">
        <b>{ops}</b>
        <span>今日存取</span>
      </div>
    </div>
  )
}
