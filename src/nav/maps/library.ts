/* ============================================================
   地图 · 图书馆配送楼层（19.2m × 11.2m）
   原 simulator.paintDefaultWorld 抽取：四排书架 + 中央服务台 +
   立柱 + 阅览区桌椅 + 自助借还机；行人 / 推车沿固定线路往返
   ============================================================ */

import { setRectWorld } from '../grid'
import type { DynamicObstacle, NavMapDef, OccupancyGrid } from '../types'

const W = 19.2
const H = 11.2

function paint(grid: OccupancyGrid): void {
  grid.occ.fill(0)
  // 四周外墙
  setRectWorld(grid, 0, 0, W, 0.2, 1)
  setRectWorld(grid, 0, H - 0.2, W, H, 1)
  setRectWorld(grid, 0, 0, 0.2, H, 1)
  setRectWorld(grid, W - 0.2, 0, W, H, 1)
  // 藏书区：四排书架
  for (let i = 0; i < 4; i++) {
    const y = 1.9 + i * 2.2
    setRectWorld(grid, 1.8, y, 7.6, y + 0.6, 1)
  }
  // 中央服务台
  setRectWorld(grid, 9.5, 4.6, 11.7, 7.0, 1)
  // 立柱
  setRectWorld(grid, 12.7, 2.2, 13.15, 2.65, 1)
  setRectWorld(grid, 12.7, 8.6, 13.15, 9.05, 1)
  // 阅览区桌椅
  setRectWorld(grid, 14.2, 1.4, 15.4, 2.2, 1)
  setRectWorld(grid, 16.6, 2.6, 17.8, 3.4, 1)
  setRectWorld(grid, 14.0, 6.6, 15.2, 7.4, 1)
  setRectWorld(grid, 16.4, 7.6, 17.6, 8.4, 1)
  // 自助借还机
  setRectWorld(grid, 5.4, 10.0, 7.0, 10.6, 1)
}

function makeObstacles(): DynamicObstacle[] {
  return [
    {
      id: 1,
      label: '读者',
      radius: 0.24,
      from: { x: 8.6, y: 1.2 },
      to: { x: 8.6, y: 10.0 },
      speed: 0.5,
      t: 0.15,
      dir: 1,
      pos: { x: 8.6, y: 2.52 },
    },
    {
      id: 2,
      label: '读者',
      radius: 0.24,
      from: { x: 12.4, y: 5.6 },
      to: { x: 18.0, y: 5.6 },
      speed: 0.42,
      t: 0.6,
      dir: -1,
      pos: { x: 15.76, y: 5.6 },
    },
    {
      id: 3,
      label: '推车',
      radius: 0.3,
      from: { x: 1.2, y: 3.1 },
      to: { x: 8.2, y: 3.1 },
      speed: 0.34,
      t: 0.35,
      dir: 1,
      pos: { x: 3.65, y: 3.1 },
    },
  ]
}

export const libraryMap: NavMapDef = {
  id: 'library',
  label: '图书馆',
  icon: '❒',
  subtitle: '图书馆配送楼层 19.2 × 11.2 米',
  worldW: W,
  worldH: H,
  cellSize: 0.2,
  paint,
  stations: [
    { id: 'charge', label: '充电桩', icon: '⚡', pos: { x: 1.0, y: 10.2 } },
    { id: 'desk', label: '服务台', icon: '◈', pos: { x: 10.5, y: 3.6 } },
    { id: 'returns', label: '还书口', icon: '↩', pos: { x: 1.0, y: 1.0 } },
    { id: 'stacks', label: '藏书区', icon: '❒', pos: { x: 4.6, y: 5.5 } },
    { id: 'reading', label: '阅览区', icon: '☰', pos: { x: 15.4, y: 5.0 } },
    { id: 'elevator', label: '电梯厅', icon: '▤', pos: { x: 18.1, y: 10.1 } },
  ],
  makeObstacles,
  homeStationId: 'charge',
  twinAnchor: { x: 1.0, y: 10.2 },
}
