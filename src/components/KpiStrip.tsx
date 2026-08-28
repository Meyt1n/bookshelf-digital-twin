import { kpiEqual, selectKpi } from '../twin/selectors'
import { useTwinSelector } from '../twin/useTwin'

export function KpiStrip() {
  const kpi = useTwinSelector(selectKpi, kpiEqual)
  const pct = kpi.compartmentCount > 0 ? Math.round((kpi.used / kpi.compartmentCount) * 100) : 0
  const ops = kpi.storeCount + kpi.takeCount

  return (
    <div className={`kpi-strip ${kpi.live ? 'is-live' : ''}`}>
      {kpi.live ? (
        <div className="kpi-chip live">
          <b>
            <i />
          </b>
          <span>作业中</span>
        </div>
      ) : null}
      <div className="kpi-chip">
        <b>{kpi.compartmentCount}</b>
        <span>格口总数</span>
      </div>
      <div className="kpi-chip cyan">
        <b>{kpi.used}</b>
        <span>在架图书</span>
      </div>
      <div className="kpi-chip green">
        <b>{kpi.compartmentCount - kpi.used}</b>
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
