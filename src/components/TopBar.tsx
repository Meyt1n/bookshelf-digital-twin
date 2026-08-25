import { useEffect, useState } from 'react'
import { twinEngine } from '../twin/useTwin'
import type { TwinSnapshot } from '../types'

export type PageId = 'overview' | 'books' | 'analytics' | 'devices'

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: string }> = [
  { id: 'overview', label: '孪生总览', icon: '◈' },
  { id: 'books', label: '图书资产', icon: '❒' },
  { id: 'analytics', label: '数据分析', icon: '∿' },
  { id: 'devices', label: '设备诊断', icon: '⚙' },
]

const LINK_DOT: Record<string, string> = {
  online: 'dot-ok',
  sim: 'dot-sim',
  offline: 'dot-bad',
  unknown: 'dot-unknown',
}

const CLIMATE_SOURCE_LABELS: Record<string, string> = {
  sim: '仿真数据',
  sensor: '柜内传感器实测',
  estimated: '实体遥测 · 天气耦合估算',
  cache: '实体遥测 · 最近缓存',
  fallback: '实体遥测 · 基准兜底',
}

const CLIMATE_SOURCE_TAGS: Record<string, string> = {
  sensor: '实测',
  estimated: '估算',
  cache: '缓存',
  fallback: '基准',
}

type TopBarProps = {
  snapshot: TwinSnapshot
  page: PageId
  onNavigate: (page: PageId) => void
}

export function TopBar({ snapshot, page, onNavigate }: TopBarProps) {
  const [clock, setClock] = useState('')
  useEffect(() => {
    const update = () => {
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      setClock(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`)
    }
    update()
    const t = window.setInterval(update, 1000)
    return () => window.clearInterval(t)
  }, [])

  const { mode, liveHealthy, telemetry } = snapshot
  const modeClass = mode === 'live' ? (liveHealthy ? 'mode-live' : 'mode-error') : 'mode-sim'
  const modeText = mode === 'live' ? (liveHealthy ? '已联机' : '联机异常') : '仿真运行'
  const climateTag = CLIMATE_SOURCE_TAGS[telemetry.climateSource]
  const climateChipClass =
    telemetry.climateSource === 'sensor'
      ? 'climate-real'
      : telemetry.climateSource === 'sim'
        ? ''
        : 'climate-est'

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-seal">◈</div>
        <div>
          <h1>智慧书架 · 数字孪生</h1>
          <span className="brand-sub">Shelf Twin · Digital OS</span>
        </div>
      </div>

      <nav className="main-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-btn ${page === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <i>{item.icon}</i>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <button
          type="button"
          className="link-mini"
          onClick={() => onNavigate('devices')}
          title="数据链路：驾驶舱 ↔ Flask ↔ Pi 桥接 ↔ STM32（点击查看设备诊断）"
        >
          {snapshot.links.map((link) => (
            <span key={link.id} className={`link-dot ${LINK_DOT[link.status]}`} />
          ))}
          <em>链路</em>
        </button>
        <div
          className={`climate-chip ${climateChipClass}`}
          title={`柜内环境遥测 · ${CLIMATE_SOURCE_LABELS[telemetry.climateSource] ?? telemetry.climateSource}`}
        >
          <span className="climate-item">
            <i className="climate-ico temp" />
            {telemetry.temperature.toFixed(1)}
            <em>°C</em>
          </span>
          <span className="climate-item">
            <i className="climate-ico hum" />
            {Math.round(telemetry.humidity)}
            <em>%RH</em>
          </span>
          {climateTag ? (
            <span className={`climate-live-tag ${telemetry.climateSource === 'sensor' ? '' : 'is-est'}`}>
              {climateTag}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={`mode-btn ${modeClass}`}
          onClick={() => (mode === 'live' ? twinEngine.exitLive() : void twinEngine.enterLive())}
          title={mode === 'live' ? '点击断开，回到仿真模式' : '点击尝试连接实体书架 Flask 服务'}
        >
          <span className="mode-dot" />
          {modeText}
        </button>
        <div className="clock">{clock}</div>
      </div>
    </header>
  )
}
