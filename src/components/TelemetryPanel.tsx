import { selectTelemetry } from '../twin/selectors'
import { useThrottledTwinSelector } from '../twin/useTwin'
import type { TelemetryPoint } from '../types'

type SparkProps = {
  points: TelemetryPoint[]
  field: 'temperature' | 'humidity'
  color: string
  min: number
  max: number
}

function Sparkline({ points, field, color, min, max }: SparkProps) {
  const w = 100
  const h = 30
  if (points.length < 2) {
    return <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" />
  }
  const xs = points.map((_, i) => (i / (points.length - 1)) * w)
  const ys = points.map((p) => {
    const v = p[field]
    const k = (v - min) / (max - min)
    return h - 3 - Math.min(1, Math.max(0, k)) * (h - 6)
  })
  const line = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  const lastX = xs[xs.length - 1]
  const lastY = ys[ys.length - 1]
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="1.7" fill={color} />
    </svg>
  )
}

const CLIMATE_SOURCE_HINT: Record<string, string> = {
  sim: '仿真 0.5 Hz',
  sensor: '柜内传感器',
  estimated: '天气耦合估算',
  cache: '最近缓存',
  fallback: '室内基准',
}

export function TelemetryPanel() {
  const telemetry = useThrottledTwinSelector(selectTelemetry, Object.is, 500)
  const currentPct = Math.min(100, (telemetry.motorCurrent / 1.2) * 100)
  const motorBusy = telemetry.motorCurrent > 0.35
  const tempOk = telemetry.temperature >= 23 && telemetry.temperature <= 26
  const humOk = telemetry.humidity >= 45 && telemetry.humidity <= 60

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          环境遥测<span className="panel-sub">TELEMETRY</span>
        </h2>
        <span className="panel-hint">{CLIMATE_SOURCE_HINT[telemetry.climateSource] ?? telemetry.climateSource}</span>
      </header>

      <div className="tele-grid">
        <div className="tele-card">
          <div className="tele-label">
            柜内温度
            <em className={tempOk ? 'ok' : 'warn'}>{tempOk ? '适宜' : '偏离'}</em>
          </div>
          <div className="tele-value">
            {telemetry.temperature.toFixed(1)}
            <em>°C</em>
          </div>
          <Sparkline points={telemetry.history} field="temperature" color="#7da2f8" min={22} max={27.5} />
        </div>
        <div className="tele-card">
          <div className="tele-label">
            柜内湿度
            <em className={humOk ? 'ok' : 'warn'}>{humOk ? '适宜' : '偏离'}</em>
          </div>
          <div className="tele-value">
            {Math.round(telemetry.humidity)}
            <em>%RH</em>
          </div>
          <Sparkline points={telemetry.history} field="humidity" color="#4ade9e" min={42} max={65} />
        </div>
      </div>

      <div className="motor-row">
        <span className="tele-label">驱动电流</span>
        <span className="motor-track">
          <span
            className={`motor-fill ${motorBusy ? 'busy' : ''}`}
            style={{ width: `${currentPct}%` }}
          />
        </span>
        <span className="motor-value">{telemetry.motorCurrent.toFixed(2)} A</span>
      </div>
    </section>
  )
}
