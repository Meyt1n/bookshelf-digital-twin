import { useState } from 'react'
import { MEMBERS, categoryColor } from '../catalog'
import { inventoryEqual, selectInventory, type InventorySlice } from '../twin/selectors'
import { twinEngine, useTwinSelector } from '../twin/useTwin'

function InventoryList({ inventory }: { inventory: InventorySlice }) {
  const entries = Object.entries(inventory.stored)
    .map(([cidStr, meta]) => ({
      cid: Number(cidStr),
      book: inventory.booksById[meta.bookId],
      meta,
    }))
    .filter((e) => e.book)
    .sort((a, b) => a.cid - b.cid)

  if (entries.length === 0) {
    return <div className="inv-empty">书架上暂时没有图书</div>
  }

  return (
    <ul className="inv-list">
      {entries.map(({ cid, book }) => {
        const comp = inventory.compartments.find((c) => c.cid === cid)
        return (
          <li key={cid}>
            <button
              type="button"
              className={`inv-item ${inventory.selectedCid === cid ? 'is-selected' : ''}`}
              onClick={() => twinEngine.setSelected(inventory.selectedCid === cid ? null : cid)}
            >
              <span className="inv-spine" style={{ background: categoryColor(book.category) }} />
              <span className="inv-title">{book.title}</span>
              <span className="inv-cat" style={{ color: categoryColor(book.category) }}>
                {book.category}
              </span>
              <span className="inv-pos">
                {comp ? `${comp.floor}-${comp.cell}` : cid}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function StatsView({ inventory }: { inventory: InventorySlice }) {
  const total = inventory.compartments.length
  const used = inventory.compartments.filter((c) => c.status === 'occupied').length
  const pct = total > 0 ? Math.round((used / total) * 100) : 0

  const categoryCount: Record<string, number> = {}
  for (const meta of Object.values(inventory.stored)) {
    const book = inventory.booksById[meta.bookId]
    if (!book) continue
    categoryCount[book.category] = (categoryCount[book.category] ?? 0) + 1
  }
  const catEntries = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])
  const catMax = Math.max(1, ...catEntries.map(([, n]) => n))

  const activity = MEMBERS.map((m) => ({
    ...m,
    count: inventory.stats.memberActivity[`${m.name} · 语音`] ?? 0,
  }))
  for (const [key, count] of Object.entries(inventory.stats.memberActivity)) {
    const name = key.split(' · ')[0]
    const row = activity.find((a) => a.name === name && !key.endsWith('语音'))
    if (row) row.count += count
  }
  const actMax = Math.max(1, ...activity.map((a) => a.count))

  const circumference = 2 * Math.PI * 26

  return (
    <div className="stats-view">
      <div className="stats-top">
        <div className="usage-ring">
          <svg viewBox="0 0 64 64">
            <circle className="ring-track" cx="32" cy="32" r="26" />
            <circle
              className="ring-value"
              cx="32"
              cy="32"
              r="26"
              strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
            />
          </svg>
          <div className="usage-center">
            <b>{pct}</b>
            <i>%</i>
          </div>
        </div>
        <div className="stats-kv">
          <div>
            <em>{inventory.stats.storeCount}</em>存书
          </div>
          <div>
            <em>{inventory.stats.takeCount}</em>取书
          </div>
          <div>
            <em>{inventory.stats.uvCount}</em>消毒
          </div>
          <div>
            <em>{inventory.stats.laminateCount}</em>塑封
          </div>
        </div>
      </div>

      <div className="stats-block">
        <h4>在架分类分布</h4>
        {catEntries.length === 0 && <div className="inv-empty">暂无数据</div>}
        {catEntries.map(([cat, n]) => (
          <div key={cat} className="bar-row">
            <span className="bar-label">{cat}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(n / catMax) * 100}%`, background: categoryColor(cat) }}
              />
            </span>
            <span className="bar-num">{n}</span>
          </div>
        ))}
      </div>

      <div className="stats-block">
        <h4>成员活跃度（累计存取）</h4>
        {activity.map((m) => (
          <div key={m.name} className="bar-row">
            <span className="bar-label">
              {m.avatar} {m.name}
            </span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(m.count / actMax) * 100}%`, background: m.role === 'parent' ? '#7c8cf8' : '#a78bfa' }}
              />
            </span>
            <span className="bar-num">{m.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function InventoryTabs() {
  const inventory = useTwinSelector(selectInventory, inventoryEqual)
  const [tab, setTab] = useState<'inv' | 'stats'>('inv')
  const used = Object.keys(inventory.stored).length
  return (
    <section className="panel panel-grow">
      <header className="panel-head tabs-head">
        <button type="button" className={`tab-btn ${tab === 'inv' ? 'active' : ''}`} onClick={() => setTab('inv')}>
          在架图书 <em>{used}</em>
        </button>
        <button type="button" className={`tab-btn ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          运行统计
        </button>
      </header>
      <div className="panel-scroll">{tab === 'inv' ? <InventoryList inventory={inventory} /> : <StatsView inventory={inventory} />}</div>
    </section>
  )
}
