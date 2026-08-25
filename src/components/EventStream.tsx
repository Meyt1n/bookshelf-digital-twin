import { useState } from 'react'
import { fmtTime } from '../format'
import type { EventKind, TwinSnapshot } from '../types'

const KIND_ICONS: Record<EventKind, string> = {
  system: '◈',
  store: '⤒',
  take: '⤓',
  ocr: '◉',
  voice: '🎙',
  uv: '☢',
  laminate: '▣',
  link: '⇌',
  motion: '⚙',
  diag: '✓',
}

type FilterId = 'all' | 'motion' | 'voice' | 'system'

const FILTERS: Array<{ id: FilterId; label: string; kinds: EventKind[] | null }> = [
  { id: 'all', label: '全部', kinds: null },
  { id: 'motion', label: '动作', kinds: ['motion', 'store', 'take', 'ocr', 'diag'] },
  { id: 'voice', label: '语音', kinds: ['voice'] },
  { id: 'system', label: '系统', kinds: ['system', 'link', 'uv', 'laminate'] },
]

export function EventStream({ snapshot }: { snapshot: TwinSnapshot }) {
  const [filter, setFilter] = useState<FilterId>('all')
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]
  const events =
    active.kinds === null
      ? snapshot.events
      : snapshot.events.filter((evt) => active.kinds!.includes(evt.kind))

  const counts = FILTERS.map((f) => ({
    id: f.id,
    n: f.kinds === null ? snapshot.events.length : snapshot.events.filter((evt) => f.kinds!.includes(evt.kind)).length,
  }))

  return (
    <section className="panel panel-grow">
      <header className="panel-head">
        <h2>
          实时事件流<span className="panel-sub">EVENT STREAM</span>
        </h2>
        <span className="live-pip">
          <i />
          LIVE
        </span>
      </header>
      <div className="event-filters">
        {FILTERS.map((f) => {
          const n = counts.find((c) => c.id === f.id)?.n ?? 0
          return (
            <button
              key={f.id}
              type="button"
              className={`event-filter-btn ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <em>{n}</em>
            </button>
          )
        })}
      </div>
      <div className="panel-scroll">
        <ul className="event-list">
          {events.map((evt, i) => (
            <li key={evt.id} className={`event-item lv-${evt.level} ${i === 0 ? 'is-latest' : ''}`}>
              <span className={`event-ico k-${evt.kind}`}>{KIND_ICONS[evt.kind]}</span>
              <div className="event-body">
                <span className="event-text">{evt.text}</span>
                <span className="event-time">{fmtTime(evt.at)}</span>
              </div>
            </li>
          ))}
          {events.length === 0 && <li className="inv-empty">该类别暂无事件</li>}
        </ul>
      </div>
    </section>
  )
}
