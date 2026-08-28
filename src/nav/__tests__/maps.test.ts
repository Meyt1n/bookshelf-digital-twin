import { describe, expect, it } from 'vitest'
import { findPath } from '../astar'
import { cellCenter, createGrid, inflate, nearestFreeCell, worldToCell } from '../grid'
import { NAV_MAPS, getNavMap } from '../maps'
import type { NavMapDef } from '../types'

const INFLATE_RADIUS = 0.3

function buildGrid(map: NavMapDef) {
  const grid = createGrid(
    Math.round(map.worldW / map.cellSize),
    Math.round(map.worldH / map.cellSize),
    map.cellSize,
  )
  map.paint(grid)
  inflate(grid, INFLATE_RADIUS)
  return grid
}

describe('nav map registry', () => {
  it('registers library / warehouse / exhibition with unique ids', () => {
    expect(NAV_MAPS.map((m) => m.id)).toEqual(['library', 'warehouse', 'exhibition'])
    expect(getNavMap('warehouse').label).toBe('仓库')
    // 未知 id 回退到图书馆
    expect(getNavMap('nope' as never).id).toBe('library')
  })

  it.each(NAV_MAPS.map((m) => [m.id, m] as const))(
    '%s: geometry, stations and obstacles are well-formed',
    (_id, map) => {
      const grid = buildGrid(map)
      expect(grid.cols * grid.cellSize).toBeCloseTo(map.worldW)
      expect(grid.rows * grid.cellSize).toBeCloseTo(map.worldH)

      // 有外墙也有可通行区域
      const occCount = grid.occ.reduce((a, b) => a + b, 0)
      expect(occCount).toBeGreaterThan(grid.cols * 2)
      expect(occCount).toBeLessThan(grid.cols * grid.rows * 0.5)

      // 站点 id 唯一、都在场内、且附近有可通行格（吸附距离 < 0.7m）
      const ids = new Set(map.stations.map((s) => s.id))
      expect(ids.size).toBe(map.stations.length)
      expect(ids.has(map.homeStationId)).toBe(true)
      for (const st of map.stations) {
        expect(st.pos.x).toBeGreaterThan(0)
        expect(st.pos.x).toBeLessThan(map.worldW)
        expect(st.pos.y).toBeGreaterThan(0)
        expect(st.pos.y).toBeLessThan(map.worldH)
        const cell = nearestFreeCell(grid, worldToCell(grid, st.pos.x, st.pos.y))
        expect(cell).not.toBeNull()
        const snapped = cellCenter(grid, cell!.cx, cell!.cy)
        expect(Math.hypot(snapped.x - st.pos.x, snapped.y - st.pos.y)).toBeLessThan(0.7)
      }

      // 动态障碍每次加载都是新副本，端点在场内
      const a = map.makeObstacles()
      const b = map.makeObstacles()
      expect(a.length).toBeGreaterThan(0)
      expect(a[0]).not.toBe(b[0])
      for (const o of a) {
        for (const p of [o.from, o.to]) {
          expect(p.x).toBeGreaterThan(0)
          expect(p.x).toBeLessThan(map.worldW)
          expect(p.y).toBeGreaterThan(0)
          expect(p.y).toBeLessThan(map.worldH)
        }
      }

      // 孪生锚点在场内
      expect(map.twinAnchor.x).toBeGreaterThanOrEqual(0)
      expect(map.twinAnchor.y).toBeLessThanOrEqual(map.worldH)
    },
  )

  it.each(NAV_MAPS.map((m) => [m.id, m] as const))(
    '%s: every station is reachable from every other station',
    (_id, map) => {
      const grid = buildGrid(map)
      const cells = map.stations.map((s) => {
        const cell = nearestFreeCell(grid, worldToCell(grid, s.pos.x, s.pos.y))
        expect(cell).not.toBeNull()
        return cell!
      })
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const res = findPath(grid, cells[i], cells[j])
          expect(res, `${map.stations[i].id} → ${map.stations[j].id}`).not.toBeNull()
        }
      }
    },
  )
})

describe('simulator map switching', () => {
  it('switches grid, stations and spawn pose per map', async () => {
    const { NavSimulator } = await import('../simulator')
    const sim = new NavSimulator()
    expect(sim.mapId).toBe('library')
    expect(sim.grid.cols).toBe(96)

    sim.setMap('warehouse')
    expect(sim.mapId).toBe('warehouse')
    expect(sim.grid.cols).toBe(100)
    expect(sim.grid.rows).toBe(70)
    expect(sim.stations.map((s) => s.id)).toContain('picking')
    // 小车回到仓库出生点（充电桩附近）
    const home = sim.stations.find((s) => s.id === 'charge')!
    const rs = sim.getRenderState()
    expect(Math.hypot(rs.pose.x - home.pos.x, rs.pose.y - home.pos.y)).toBeLessThan(0.3)
    expect(rs.phase).toBe('idle')

    // 重复切换同一张地图是幂等的
    const grid = sim.grid
    sim.setMap('warehouse')
    expect(sim.grid).toBe(grid)

    sim.setMap('exhibition')
    expect(sim.grid.cols).toBe(90)
    expect(sim.stations.map((s) => s.id)).toContain('stage')
  })
})
