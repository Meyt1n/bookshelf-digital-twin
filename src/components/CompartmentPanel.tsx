import { useEffect, useState } from 'react'
import { categoryColor } from '../catalog'
import { fmtRelative } from '../format'
import { compartmentPanelEqual, selectCompartmentPanel, type CompartmentPanelSlice } from '../twin/selectors'
import { twinEngine, useTwinSelector } from '../twin/useTwin'
import type { Compartment } from '../types'

function tileClass(comp: Compartment, slice: CompartmentPanelSlice): string {
  const classes = ['cell-tile']
  classes.push(comp.status === 'occupied' ? 'is-occupied' : 'is-free')
  if (slice.selectedCid === comp.cid) classes.push('is-selected')
  if (slice.hoveredCid === comp.cid) classes.push('is-hovered')
  const task = slice.task
  if (task && task.cid === comp.cid && task.phase !== 'done') {
    classes.push(task.action === 'store' ? 'is-storing' : 'is-taking')
  }
  return classes.join(' ')
}

function SelectedDetail({ slice }: { slice: CompartmentPanelSlice }) {
  const cid = slice.selectedCid
  const comp = slice.compartments.find((c) => c.cid === cid) ?? null
  const [pickBookId, setPickBookId] = useState<number | ''>('')
  useEffect(() => setPickBookId(''), [cid])

  if (!comp) {
    return <div className="cell-detail empty">点击矩阵或 3D 格口查看详情</div>
  }

  const busy = slice.task !== null || slice.ocr !== null
  const meta = slice.stored[comp.cid]
  const book = comp.bookId !== null ? slice.booksById[comp.bookId] : null

  return (
    <div className="cell-detail">
      <div className="cell-detail-head">
        <span className="cell-detail-pos">
          {comp.floor} 层 {comp.cell} 号格
        </span>
        <span className={`status-chip ${comp.status === 'occupied' ? 'chip-occupied' : 'chip-free'}`}>
          {comp.status === 'occupied' ? '占用' : '空闲'}
        </span>
      </div>

      {book && meta ? (
        <>
          <div className="cell-book">
            <span className="book-spine" style={{ background: categoryColor(book.category) }} />
            <div className="cell-book-info">
              <div className="cell-book-title">《{book.title}》</div>
              <div className="cell-book-meta">
                {book.author} · {book.category}
              </div>
              <div className="cell-book-meta dim">
                {meta.storedBy} 存入 · {fmtRelative(meta.storedAt)}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-amber btn-block"
            disabled={busy}
            onClick={() => twinEngine.commandTake(comp.cid)}
          >
            {busy ? '任务执行中…' : '⤓ 取出这本书'}
          </button>
        </>
      ) : (
        <>
          <div className="cell-detail-tip">该格口空闲，可指派图书入库</div>
          <select
            className="input select-book"
            value={pickBookId}
            disabled={slice.mode === 'live'}
            onChange={(e) => setPickBookId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">选择要存入的图书…</option>
            {slice.offShelfBookIds.map((id) => {
              const b = slice.booksById[id]
              return (
                <option key={id} value={id}>
                  《{b.title}》 · {b.category}
                </option>
              )
            })}
          </select>
          <button
            type="button"
            className="btn btn-green btn-block"
            disabled={busy || pickBookId === '' || slice.mode === 'live'}
            onClick={() => {
              if (pickBookId !== '') twinEngine.commandStoreTo(comp.cid, pickBookId)
            }}
          >
            {slice.mode === 'live' ? '联机模式请在实体端存书' : busy ? '任务执行中…' : '⤒ 视觉识别并存入'}
          </button>
        </>
      )}
    </div>
  )
}

export function CompartmentPanel() {
  const slice = useTwinSelector(selectCompartmentPanel, compartmentPanelEqual)
  const floors = [1, 2]
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          格口矩阵<span className="panel-sub">CELL MATRIX</span>
        </h2>
        <div className="legend">
          <span className="legend-item">
            <i className="legend-dot ld-occupied" />
            占用
          </span>
          <span className="legend-item">
            <i className="legend-dot ld-free" />
            空闲
          </span>
          <span className="legend-item">
            <i className="legend-dot ld-active" />
            作业
          </span>
        </div>
      </header>

      <div className="cell-matrix">
        {floors.map((floor) => (
          <div key={floor} className="cell-row">
            <span className="floor-tag">F{floor}</span>
            {slice.compartments
              .filter((c) => c.floor === floor)
              .map((comp) => {
                const book = comp.bookId !== null ? slice.booksById[comp.bookId] : null
                return (
                  <button
                    key={comp.cid}
                    type="button"
                    className={tileClass(comp, slice)}
                    onClick={() => twinEngine.setSelected(slice.selectedCid === comp.cid ? null : comp.cid)}
                    onMouseEnter={() => twinEngine.setHovered(comp.cid)}
                    onMouseLeave={() => twinEngine.setHovered(null)}
                  >
                    <span className="cell-no">{comp.cell}</span>
                    <span className="cell-book-name">{book ? book.title : '·'}</span>
                  </button>
                )
              })}
          </div>
        ))}
      </div>

      <SelectedDetail slice={slice} />
    </section>
  )
}
