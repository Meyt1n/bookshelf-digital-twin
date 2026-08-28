import { useMemo } from 'react'
import { useThrottledTwinSelector } from '../twin/useTwin'
import type { LinkState, TwinSnapshot } from '../types'

export type AlertItem = {
  id: string
  level: 'warn' | 'fault' | 'info'
  text: string
}

function selectAlertSource(s: TwinSnapshot) {
  return {
    temperature: s.telemetry.temperature,
    humidity: s.telemetry.humidity,
    links: s.links,
    liveHealthy: s.liveHealthy,
    mode: s.mode,
    taskFault: s.task?.phase === 'fault',
  }
}

function alertSourceEqual(
  a: ReturnType<typeof selectAlertSource>,
  b: ReturnType<typeof selectAlertSource>,
): boolean {
  return (
    a.temperature === b.temperature &&
    a.humidity === b.humidity &&
    a.liveHealthy === b.liveHealthy &&
    a.mode === b.mode &&
    a.taskFault === b.taskFault &&
    a.links === b.links
  )
}

function buildAlerts(src: ReturnType<typeof selectAlertSource>): AlertItem[] {
  const items: AlertItem[] = []
  if (src.taskFault) items.push({ id: 'fault', level: 'fault', text: '急停触发 · 机构正在回待机位' })
  if (src.mode === 'live' && !src.liveHealthy) {
    items.push({ id: 'link', level: 'warn', text: '联机链路异常 · 显示最近快照' })
  }
  const badLink = src.links.find((l: LinkState) => l.status === 'offline')
  if (badLink) items.push({ id: `off-${badLink.id}`, level: 'warn', text: `${badLink.label} 离线` })
  if (src.temperature < 23 || src.temperature > 26) {
    items.push({
      id: 'temp',
      level: 'warn',
      text: `柜内温度 ${src.temperature.toFixed(1)}°C 偏离适宜区间`,
    })
  }
  if (src.humidity < 45 || src.humidity > 60) {
    items.push({
      id: 'hum',
      level: 'warn',
      text: `柜内湿度 ${Math.round(src.humidity)}%RH 偏离适宜区间`,
    })
  }
  return items
}

type Props = {
  onOpenHistory?: () => void
}

export function AlertBar({ onOpenHistory }: Props) {
  const src = useThrottledTwinSelector(selectAlertSource, alertSourceEqual, 800)
  const alerts = useMemo(() => buildAlerts(src), [src])
  if (alerts.length === 0) return null

  const top = alerts[0]
  return (
    <div className={`alert-bar lv-${top.level}`} role="status">
      <span className="alert-pip" />
      <strong>{top.text}</strong>
      {alerts.length > 1 && <em>+{alerts.length - 1}</em>}
      {onOpenHistory && (
        <button type="button" className="alert-action" onClick={onOpenHistory}>
          回放
        </button>
      )}
    </div>
  )
}
