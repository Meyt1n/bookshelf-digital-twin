import { useId, useMemo } from 'react'
import { MEMBERS, categoryColor } from '../catalog'
import { PHASE_LABELS } from '../twin/engine'
import type { TelemetryPoint, TwinSnapshot } from '../types'

function fmtUptime(bootAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - bootAt) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** 时段活跃度：固定早晚高峰曲线（模拟自 borrow_logs 的时间分布） */
const HOUR_PROFILE = Array.from({ length: 24 }, (_, h) => {
  const morning = Math.exp(-((h - 8.5) ** 2) / 4.5) * 0.85
  const noon = Math.exp(-((h - 13) ** 2) / 5) * 0.4
  const evening = Math.exp(-((h - 20) ** 2) / 3.2)
  const noise = 0.06 + 0.05 * Math.abs(Math.sin(h * 37.7))
  return morning + noon + evening + noise
})

function OccupancyRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const r = 16
  const c = 2 * Math.PI * r
  return (
    <svg className="ana-ring" viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <circle cx="20" cy="20" r={r} className="ana-ring-track" />
      <circle
        cx="20"
        cy="20"
        r={r}
        className="ana-ring-value"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 20 20)"
      />
    </svg>
  )
}

function WeeklyTrendChart({ snapshot }: { snapshot: TwinSnapshot }) {
  const days = snapshot.weeklyTrend
  const max = Math.max(4, ...days.map((d) => Math.max(d.store, d.take)))
  const storeTot = days.reduce((a, d) => a + d.store, 0)
  const takeTot = days.reduce((a, d) => a + d.take, 0)
  const w = 640
  const h = 210
  const padL = 32
  const padR = 10
  const padT = 22
  const padB = 36
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const groupW = innerW / Math.max(1, days.length)
  const barW = Math.min(16, groupW * 0.28)
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t))

  return (
    <div className="trend-chart">
      <svg className="trend-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="近七日存取趋势">
        {ticks.map((v) => {
          const y = padT + innerH * (1 - v / max)
          return (
            <g key={v}>
              <line x1={padL} x2={w - padR} y1={y} y2={y} className="chart-grid" />
              <text x={padL - 8} y={y + 4} className="chart-tick" textAnchor="end">
                {v}
              </text>
            </g>
          )
        })}
        {days.map((d, i) => {
          const cx = padL + groupW * (i + 0.5)
          const hs = (d.store / max) * innerH
          const ht = (d.take / max) * innerH
          const y0 = padT + innerH
          const isToday = d.label === '今天'
          return (
            <g key={d.label}>
              {isToday ? (
                <rect
                  x={cx - groupW * 0.42}
                  y={padT}
                  width={groupW * 0.84}
                  height={innerH}
                  className="trend-today-bg"
                />
              ) : null}
              <title>{`${d.label} · 存 ${d.store} · 取 ${d.take}`}</title>
              <rect
                x={cx - barW - 2.5}
                y={y0 - hs}
                width={barW}
                height={Math.max(hs, 2)}
                rx="3.5"
                className="trend-svg-store"
              />
              <rect
                x={cx + 2.5}
                y={y0 - ht}
                width={barW}
                height={Math.max(ht, 2)}
                rx="3.5"
                className="trend-svg-take"
              />
              <text x={cx - barW / 2 - 2.5} y={y0 - hs - 5} className="chart-val" textAnchor="middle">
                {d.store}
              </text>
              <text x={cx + barW / 2 + 2.5} y={y0 - ht - 5} className="chart-val amber" textAnchor="middle">
                {d.take}
              </text>
              <text x={cx} y={h - 12} className={`chart-axis ${isToday ? 'is-today' : ''}`} textAnchor="middle">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="trend-legend">
        <span>
          <i className="lg-dot store" />
          存书 · {storeTot}
        </span>
        <span>
          <i className="lg-dot take" />
          取书 · {takeTot}
        </span>
        <span className="trend-sum">七日合计 {storeTot + takeTot} 次</span>
      </div>
    </div>
  )
}

function CategoryDonut({ snapshot }: { snapshot: TwinSnapshot }) {
  const shares = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const [idStr, count] of Object.entries(snapshot.stats.bookActivity)) {
      const book = snapshot.booksById[Number(idStr)]
      if (!book || count <= 0) continue
      byCat[book.category] = (byCat[book.category] ?? 0) + count
    }
    const total = Object.values(byCat).reduce((a, b) => a + b, 0)
    const rows = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => ({ cat, n, pct: total > 0 ? (n / total) * 100 : 0 }))
    return { rows, total }
  }, [snapshot.stats.bookActivity, snapshot.booksById])

  const r = 42
  const c = 2 * Math.PI * r
  let acc = 0

  return (
    <div className="donut-wrap">
      <svg className="donut-svg" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} className="donut-track" />
        {shares.rows.map((row) => {
          const len = (row.pct / 100) * c
          const gap = shares.rows.length > 1 ? 5 : 0
          const dash = Math.max(0, len - gap)
          const offset = acc
          acc += len
          return (
            <circle
              key={row.cat}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={categoryColor(row.cat)}
              strokeWidth="13"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
            />
          )
        })}
        <text x="60" y="56" className="donut-num" textAnchor="middle">
          {shares.total}
        </text>
        <text x="60" y="72" className="donut-cap" textAnchor="middle">
          累计流转
        </text>
      </svg>
      <ul className="donut-legend">
        {shares.rows.slice(0, 6).map((row) => (
          <li key={row.cat}>
            <i style={{ background: categoryColor(row.cat) }} />
            <span className="dl-cat">{row.cat}</span>
            <span className="dl-n">{row.n}</span>
            <span className="dl-pct">{row.pct.toFixed(0)}%</span>
          </li>
        ))}
        {shares.rows.length === 0 && <li className="inv-empty">暂无流转</li>}
      </ul>
    </div>
  )
}

function heatTone(k: number): { bg: string; border: string; glow: string } {
  const t = Math.min(1, Math.max(0, k))
  const r = Math.round(70 + t * 185)
  const g = Math.round(140 - t * 70)
  const b = Math.round(248 - t * 170)
  return {
    bg: `rgba(${r}, ${g}, ${b}, ${0.1 + t * 0.48})`,
    border: `rgba(${r}, ${g}, ${b}, ${0.22 + t * 0.5})`,
    glow: t > 0.62 ? `0 0 16px rgba(${r}, ${g}, ${b}, 0.35)` : 'none',
  }
}

function CellHeatmap({ snapshot }: { snapshot: TwinSnapshot }) {
  const max = Math.max(1, ...Object.values(snapshot.stats.cellActivity))
  return (
    <div className="heat-block">
      <div className="heat-grid">
        {[1, 2].map((floor) => (
          <div key={floor} className="heat-row">
            <span className="heat-floor">F{floor}</span>
            {snapshot.compartments
              .filter((c) => c.floor === floor)
              .map((comp) => {
                const n = snapshot.stats.cellActivity[comp.cid] ?? 0
                const tone = heatTone(n / max)
                const occupied = comp.status === 'occupied'
                const book = comp.bookId !== null ? snapshot.booksById[comp.bookId] : null
                return (
                  <div
                    key={comp.cid}
                    className={`heat-cell ${occupied ? 'is-occupied' : ''}`}
                    style={{ background: tone.bg, borderColor: tone.border, boxShadow: tone.glow }}
                    title={`${comp.floor}-${comp.cell} · 累计 ${n} 次${book ? ` · 《${book.title}》` : ' · 空闲'}`}
                  >
                    <span className="heat-pos">{comp.cell}</span>
                    <b>{n}</b>
                    <i className={`heat-pip ${occupied ? 'on' : 'off'}`} />
                  </div>
                )
              })}
          </div>
        ))}
      </div>
      <div className="heat-scale">
        <span>低</span>
        <i />
        <span>高</span>
        <em>
          <i className="heat-pip on" />
          在架
        </em>
      </div>
    </div>
  )
}

function HourChart() {
  const max = Math.max(...HOUR_PROFILE)
  const nowHour = new Date().getHours()
  const peak = HOUR_PROFILE.reduce((best, v, h) => (v > best.v ? { h, v } : best), { h: 0, v: 0 })
  return (
    <div className="hour-wrap">
      <div className="hour-peaks" aria-hidden>
        <span className="hour-peak" style={{ left: `${(7 / 24) * 100}%`, width: `${(4 / 24) * 100}%` }}>
          早高峰
        </span>
        <span className="hour-peak eve" style={{ left: `${(18 / 24) * 100}%`, width: `${(4 / 24) * 100}%` }}>
          晚高峰
        </span>
      </div>
      <div className="hour-chart">
        {HOUR_PROFILE.map((v, h) => (
          <div key={h} className={`hour-col ${h === nowHour ? 'is-now' : ''} ${h === peak.h ? 'is-peak' : ''}`}>
            <span className="hour-val">{h === nowHour || h === peak.h ? Math.round((v / max) * 100) : ''}</span>
            <span
              className={`hour-bar ${h === nowHour ? 'now' : ''}`}
              style={{ height: `${(v / max) * 100}%` }}
              title={`${String(h).padStart(2, '0')}:00 · 相对活跃 ${Math.round((v / max) * 100)}`}
            />
            {h % 3 === 0 && <span className="hour-label">{h}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberRank({ snapshot }: { snapshot: TwinSnapshot }) {
  const totals = new Map<string, number>()
  MEMBERS.forEach((m) => totals.set(m.name, 0))
  for (const [key, count] of Object.entries(snapshot.stats.memberActivity)) {
    const name = key.split(' · ')[0]
    if (totals.has(name)) totals.set(name, (totals.get(name) ?? 0) + count)
  }
  const rows = MEMBERS.map((m) => ({ ...m, count: totals.get(m.name) ?? 0 })).sort((a, b) => b.count - a.count)
  const max = Math.max(1, ...rows.map((r) => r.count))
  const sum = rows.reduce((a, r) => a + r.count, 0)
  return (
    <div className="rank-list">
      {rows.map((m, i) => (
        <div key={m.name} className="rank-row">
          <span className={`rank-no r${i + 1}`}>{i + 1}</span>
          <span className="rank-name">
            {m.avatar} {m.name}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{
                width: `${(m.count / max) * 100}%`,
                background: m.role === 'parent' ? '#7c8cf8' : '#a78bfa',
              }}
            />
          </span>
          <span className="bar-num">{m.count}</span>
          <span className="rank-pct">{sum ? Math.round((m.count / sum) * 100) : 0}%</span>
        </div>
      ))}
      <p className="rank-note">统计口径：语音 / 现场 / 控制台发起的存取任务（含模拟历史）</p>
    </div>
  )
}

function BookRank({ snapshot }: { snapshot: TwinSnapshot }) {
  const rows = useMemo(() => {
    return Object.values(snapshot.booksById)
      .map((book) => ({ book, n: snapshot.stats.bookActivity[book.id] ?? 0 }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
  }, [snapshot.booksById, snapshot.stats.bookActivity])
  const max = Math.max(1, ...rows.map((r) => r.n))
  const onShelf = new Set(Object.values(snapshot.stored).map((s) => s.bookId))
  return (
    <div className="book-rank">
      {rows.map((row, i) => (
        <div key={row.book.id} className="book-rank-row">
          <span className={`rank-no r${i + 1}`}>{i + 1}</span>
          <span className="book-rank-spine" style={{ background: categoryColor(row.book.category) }} />
          <div className="book-rank-meta">
            <b>《{row.book.title}》</b>
            <em>
              {row.book.category}
              {onShelf.has(row.book.id) ? ' · 在架' : ' · 离架'}
            </em>
          </div>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(row.n / max) * 100}%`, background: categoryColor(row.book.category) }}
            />
          </span>
          <span className="bar-num">{row.n}</span>
        </div>
      ))}
    </div>
  )
}

function EnvChart({
  points,
  field,
  color,
  min,
  max,
  unit,
  comfort,
}: {
  points: TelemetryPoint[]
  field: 'temperature' | 'humidity'
  color: string
  min: number
  max: number
  unit: string
  comfort: [number, number]
}) {
  const gid = useId().replace(/:/g, '')
  const w = 100
  const h = 42
  const line = useMemo(() => {
    if (points.length < 2) return ''
    return points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * w
        const k = (p[field] - min) / (max - min)
        const y = h - 4 - Math.min(1, Math.max(0, k)) * (h - 8)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [points, field, min, max])

  const last = points.length > 0 ? points[points.length - 1][field] : null
  const lastPt = useMemo(() => {
    if (points.length < 2 || last === null) return null
    const x = w - 1.8
    const k = (last - min) / (max - min)
    const y = h - 4 - Math.min(1, Math.max(0, k)) * (h - 8)
    return { x, y }
  }, [points.length, last, min, max])

  const inComfort = last !== null && last >= comfort[0] && last <= comfort[1]
  const yComfort = (v: number) => h - 4 - Math.min(1, Math.max(0, (v - min) / (max - min))) * (h - 8)

  return (
    <div className="env-chart">
      <div className="env-chart-head">
        <span className="tele-label">{field === 'temperature' ? '柜内温度' : '柜内湿度'}</span>
        <span className={`env-now ${inComfort ? 'ok' : 'warn'}`} style={{ color }}>
          {last !== null ? (field === 'temperature' ? last.toFixed(1) : Math.round(last)) : '--'}
          <em>{unit}</em>
        </span>
        <span className={`env-chip ${inComfort ? 'ok' : 'warn'}`}>{inComfort ? '适宜' : '偏离'}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`envfill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x="0"
          y={yComfort(comfort[1])}
          width={w}
          height={Math.max(1, yComfort(comfort[0]) - yComfort(comfort[1]))}
          className="env-band"
        />
        {[0.25, 0.5, 0.75].map((k) => (
          <line key={k} x1="0" x2={w} y1={h * k} y2={h * k} stroke="rgba(124,140,248,0.13)" strokeWidth="0.35" />
        ))}
        {line && <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#envfill-${gid})`} />}
        {line && (
          <polyline points={line} fill="none" stroke={color} strokeWidth={1.35} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {lastPt && <circle cx={lastPt.x} cy={lastPt.y} r="1.6" fill={color} />}
      </svg>
      <div className="env-range">
        <span>
          {min}
          {unit}
        </span>
        <span>
          舒适 {comfort[0]}–{comfort[1]}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  )
}

export function AnalyticsPage({ snapshot }: { snapshot: TwinSnapshot }) {
  const total = snapshot.compartments.length
  const used = snapshot.compartments.filter((c) => c.status === 'occupied').length
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const todayOps = snapshot.stats.storeCount + snapshot.stats.takeCount
  const weekOps = snapshot.weeklyTrend.reduce((a, d) => a + d.store + d.take, 0)
  const weekAvg = snapshot.weeklyTrend.length > 0 ? weekOps / snapshot.weeklyTrend.length : 0
  const vsAvg = weekAvg > 0 ? Math.round(((todayOps - weekAvg) / weekAvg) * 100) : 0
  const live =
    snapshot.task !== null && snapshot.task.phase !== 'done' && snapshot.task.phase !== 'fault'
      ? snapshot.task
      : null
  const moduleLive =
    snapshot.modules.uv.status === 'running'
      ? '紫外消毒中'
      : snapshot.modules.laminate.status === 'running'
        ? '塑封作业中'
        : snapshot.ocr
          ? '视觉识别中'
          : null

  const kpis = [
    {
      label: '今日存书',
      value: snapshot.stats.storeCount,
      accent: 'green',
      hint: `七日均值 ${Math.round(snapshot.weeklyTrend.reduce((a, d) => a + d.store, 0) / Math.max(1, snapshot.weeklyTrend.length))}`,
    },
    {
      label: '今日取书',
      value: snapshot.stats.takeCount,
      accent: 'amber',
      hint: `七日均值 ${Math.round(snapshot.weeklyTrend.reduce((a, d) => a + d.take, 0) / Math.max(1, snapshot.weeklyTrend.length))}`,
    },
    {
      label: '书架使用率',
      value: `${pct}%`,
      accent: 'cyan',
      hint: `${used} / ${total} 格占用`,
      ring: pct,
    },
    {
      label: '累计消毒',
      value: snapshot.stats.uvCount,
      accent: 'violet',
      hint: snapshot.modules.uv.status === 'running' ? '灯管扫描中' : '模块待命',
    },
    {
      label: '累计塑封',
      value: snapshot.stats.laminateCount,
      accent: 'blue',
      hint: snapshot.modules.laminate.status === 'running' ? '加热通道作业' : '抽屉待命',
    },
    {
      label: '孪生运行时长',
      value: fmtUptime(snapshot.bootAt),
      accent: '',
      hint: snapshot.mode === 'live' ? '联机模式' : '仿真时钟',
    },
  ]

  return (
    <div className="page page-analytics">
      <div className="ana-banner">
        <div className="ana-banner-title">
          <h2>数据驾驶舱</h2>
          <span className="panel-sub">COMMAND BOARD</span>
        </div>
        <div className="ana-banner-stats">
          <span>
            在架 <b>{used}</b>
            <em>/{total}</em>
          </span>
          <span>
            今日流转 <b>{todayOps}</b>
          </span>
          <span className={vsAvg >= 0 ? 'up' : 'down'}>
            较七日均 {vsAvg >= 0 ? '+' : ''}
            {vsAvg}%
          </span>
        </div>
        {live ? (
          <span className="ana-live-chip">
            <i />
            {live.action === 'store' ? '存书' : '取书'} · {PHASE_LABELS[live.phase]}
          </span>
        ) : moduleLive ? (
          <span className="ana-live-chip module">
            <i />
            {moduleLive}
          </span>
        ) : (
          <span className="ana-idle-chip">系统空闲</span>
        )}
      </div>

      <div className="ana-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`ana-kpi ${k.accent}`}>
            <div className="ana-kpi-top">
              {'ring' in k && k.ring !== undefined ? <OccupancyRing pct={k.ring} /> : null}
              <b>{k.value}</b>
            </div>
            <span>{k.label}</span>
            <em className="ana-kpi-hint">{k.hint}</em>
          </div>
        ))}
      </div>

      <div className="ana-grid">
        <section className="panel ana-span5">
          <header className="panel-head">
            <h2>
              近 7 天存取趋势<span className="panel-sub">WEEKLY TREND</span>
            </h2>
          </header>
          <WeeklyTrendChart snapshot={snapshot} />
        </section>

        <section className="panel ana-span3">
          <header className="panel-head">
            <h2>
              分类流转占比<span className="panel-sub">CATEGORY</span>
            </h2>
          </header>
          <CategoryDonut snapshot={snapshot} />
        </section>

        <section className="panel ana-span4">
          <header className="panel-head">
            <h2>
              成员活跃排行<span className="panel-sub">MEMBERS</span>
            </h2>
          </header>
          <MemberRank snapshot={snapshot} />
        </section>

        <section className="panel ana-span4">
          <header className="panel-head">
            <h2>
              格口使用热力<span className="panel-sub">CELL HEAT</span>
            </h2>
          </header>
          <CellHeatmap snapshot={snapshot} />
        </section>

        <section className="panel ana-span8">
          <header className="panel-head">
            <h2>
              时段活跃分布<span className="panel-sub">HOURLY</span>
            </h2>
            <span className="panel-hint">高峰 08:00–09:00 / 20:00–21:00</span>
          </header>
          <HourChart />
        </section>

        <section className="panel ana-span4">
          <header className="panel-head">
            <h2>
              热门图书<span className="panel-sub">TOP BOOKS</span>
            </h2>
          </header>
          <BookRank snapshot={snapshot} />
        </section>

        <section className="panel ana-span4">
          <EnvChart
            points={snapshot.telemetry.history}
            field="temperature"
            color="#7da2f8"
            min={22}
            max={27.5}
            unit="°C"
            comfort={[23, 26]}
          />
        </section>

        <section className="panel ana-span4">
          <EnvChart
            points={snapshot.telemetry.history}
            field="humidity"
            color="#4ade9e"
            min={42}
            max={65}
            unit="%RH"
            comfort={[45, 60]}
          />
        </section>
      </div>
    </div>
  )
}
