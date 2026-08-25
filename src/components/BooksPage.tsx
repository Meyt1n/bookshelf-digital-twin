import { useMemo, useState } from 'react'
import { CATEGORY_COLORS, categoryColor } from '../catalog'
import { twinEngine } from '../twin/useTwin'
import type { BookInfo, TwinSnapshot } from '../types'

type ShelfState = 'all' | 'on' | 'off'

type BookRow = {
  book: BookInfo
  cid: number | null
  floor: number | null
  cell: number | null
  storedBy: string | null
  activity: number
}

type BooksPageProps = {
  snapshot: TwinSnapshot
  /** 发起存/取书后跳回孪生总览展示过程 */
  onTaskStart?: () => void
}

export function BooksPage({ snapshot, onTaskStart }: BooksPageProps) {
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<string>('全部')
  const [shelfState, setShelfState] = useState<ShelfState>('all')

  const busy = snapshot.task !== null || snapshot.ocr !== null
  const live = snapshot.mode === 'live'

  const rows = useMemo<BookRow[]>(() => {
    const cidByBook = new Map<number, number>()
    for (const [cidStr, meta] of Object.entries(snapshot.stored)) {
      cidByBook.set(meta.bookId, Number(cidStr))
    }
    const list: BookRow[] = Object.values(snapshot.booksById).map((book) => {
      const cid = cidByBook.get(book.id) ?? null
      const comp = cid !== null ? snapshot.compartments.find((c) => c.cid === cid) : null
      return {
        book,
        cid,
        floor: comp?.floor ?? null,
        cell: comp?.cell ?? null,
        storedBy: cid !== null ? snapshot.stored[cid].storedBy : null,
        activity: snapshot.stats.bookActivity[book.id] ?? 0,
      }
    })
    return list.sort((a, b) => {
      if ((a.cid !== null) !== (b.cid !== null)) return a.cid !== null ? -1 : 1
      return a.book.id - b.book.id
    })
  }, [snapshot])

  const categories = useMemo(() => {
    const set = new Set<string>()
    Object.values(snapshot.booksById).forEach((b) => set.add(b.category))
    return ['全部', ...Object.keys(CATEGORY_COLORS).filter((c) => set.has(c))]
  }, [snapshot.booksById])

  const filtered = rows.filter((row) => {
    if (category !== '全部' && row.book.category !== category) return false
    if (shelfState === 'on' && row.cid === null) return false
    if (shelfState === 'off' && row.cid !== null) return false
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      const hay = `${row.book.title}${row.book.author}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })

  const onCount = rows.filter((r) => r.cid !== null).length

  return (
    <div className="page page-books">
      <div className="page-toolbar panel">
        <div className="toolbar-row">
          <div className="toolbar-title">
            <h2>图书资产库</h2>
            <span className="panel-sub">BOOK ASSETS</span>
          </div>
          <div className="toolbar-summary">
            共 <em>{rows.length}</em> 册 · 在架 <em className="c-cyan">{onCount}</em> · 离架{' '}
            <em className="c-dim">{rows.length - onCount}</em>
            {filtered.length !== rows.length ? (
              <>
                {' '}
                · 筛选 <em>{filtered.length}</em>
              </>
            ) : null}
          </div>
          <div className="search-wrap">
            <input
              className="input search-input"
              placeholder="搜索书名 / 作者…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword ? (
              <button type="button" className="search-clear" onClick={() => setKeyword('')} title="清除搜索">
                ×
              </button>
            ) : null}
          </div>
          <div className="seg-group">
            {(
              [
                ['all', '全部'],
                ['on', '在架'],
                ['off', '离架'],
              ] as Array<[ShelfState, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`seg-btn ${shelfState === value ? 'active' : ''}`}
                onClick={() => setShelfState(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="cat-row">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cat-chip ${category === cat ? 'active' : ''}`}
              style={
                cat !== '全部'
                  ? ({ '--chip-color': categoryColor(cat) } as React.CSSProperties)
                  : undefined
              }
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="book-grid-scroll">
        <div className="book-grid">
          {filtered.map((row) => {
            const color = categoryColor(row.book.category)
            const onShelf = row.cid !== null
            return (
              <article key={row.book.id} className={`book-card ${onShelf ? 'on-shelf' : ''}`}>
                <div className="book-card-top">
                  <span className="book-card-spine" style={{ background: color }} />
                  <div className="book-card-headings">
                    <h3>{row.book.title}</h3>
                    <span className="book-card-author">{row.book.author}</span>
                  </div>
                  <span className={`status-chip ${onShelf ? 'chip-occupied' : 'chip-off'}`}>
                    {onShelf ? '在架' : '离架'}
                  </span>
                </div>
                <p className="book-card-desc">{row.book.description ?? '暂无简介'}</p>
                <div className="book-card-meta">
                  <span className="cat-tag" style={{ color, borderColor: color }}>
                    {row.book.category}
                  </span>
                  {onShelf ? (
                    <span className="pos-tag" title={`${row.storedBy} 存入`}>
                      ▣ {row.floor} 层 {row.cell} 号格
                    </span>
                  ) : (
                    <span className="pos-tag dim">未在架</span>
                  )}
                  <span className="flow-tag" title="累计流转次数">
                    ⇅ {row.activity}
                  </span>
                </div>
                <div className="book-card-actions">
                  {onShelf ? (
                    <button
                      type="button"
                      className="btn btn-amber btn-block"
                      disabled={busy}
                      onClick={() => {
                        twinEngine.commandTake(row.cid!)
                        onTaskStart?.()
                      }}
                    >
                      {busy ? '任务执行中…' : '⤓ 取出'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-green btn-block"
                      disabled={busy || live}
                      title={live ? '联机模式请在实体端存书' : '视觉识别并顺位分配格口'}
                      onClick={() => {
                        twinEngine.commandStoreBook(row.book.id)
                        onTaskStart?.()
                      }}
                    >
                      {busy ? '任务执行中…' : '⤒ 入库'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
          {filtered.length === 0 && (
            <div className="inv-empty grid-empty">
              <p>没有匹配的图书</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setKeyword('')
                  setCategory('全部')
                  setShelfState('all')
                }}
              >
                清除筛选
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
