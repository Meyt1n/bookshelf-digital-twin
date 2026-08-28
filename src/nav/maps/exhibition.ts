/* ============================================================
   地图 · 智能展厅（18m × 12m）
   上下两排贴墙展位 + 中央主舞台 + 两个岛式展台 + 右侧茶歇区；
   环形参观动线，走廊净宽 ≥ 2m
   动态障碍：两名观众沿动线游走、讲解员在舞台东侧往返
   ============================================================ */

import { setRectWorld } from '../grid'
import type { DynamicObstacle, NavMapDef, OccupancyGrid } from '../types'

const W = 18
const H = 12

function paint(grid: OccupancyGrid): void {
  grid.occ.fill(0)
  // 四周外墙
  setRectWorld(grid, 0, 0, W, 0.2, 1)
  setRectWorld(grid, 0, H - 0.2, W, H, 1)
  setRectWorld(grid, 0, 0, 0.2, H, 1)
  setRectWorld(grid, W - 0.2, 0, W, H, 1)
  // 顶排贴墙展位
  setRectWorld(grid, 1.6, 0.2, 4.0, 1.3, 1)
  setRectWorld(grid, 5.2, 0.2, 7.6, 1.3, 1)
  setRectWorld(grid, 8.8, 0.2, 11.2, 1.3, 1)
  setRectWorld(grid, 12.4, 0.2, 14.8, 1.3, 1)
  // 底排贴墙展位
  setRectWorld(grid, 3.0, 10.7, 5.4, 11.8, 1)
  setRectWorld(grid, 6.6, 10.7, 9.0, 11.8, 1)
  setRectWorld(grid, 10.2, 10.7, 12.6, 11.8, 1)
  setRectWorld(grid, 13.8, 10.7, 16.2, 11.8, 1)
  // 中央主舞台
  setRectWorld(grid, 7.6, 4.8, 10.4, 7.2, 1)
  // 岛式展台
  setRectWorld(grid, 3.4, 4.0, 5.0, 5.2, 1)
  setRectWorld(grid, 13.0, 6.8, 14.6, 8.0, 1)
  // 茶歇区圆桌（右侧）
  setRectWorld(grid, 15.6, 2.6, 16.8, 3.6, 1)
  setRectWorld(grid, 15.6, 8.8, 16.8, 9.8, 1)
}

function makeObstacles(): DynamicObstacle[] {
  return [
    {
      id: 1,
      label: '观众',
      radius: 0.24,
      from: { x: 2.0, y: 2.2 },
      to: { x: 2.0, y: 9.8 },
      speed: 0.45,
      t: 0.25,
      dir: 1,
      pos: { x: 2.0, y: 4.1 },
    },
    {
      id: 2,
      label: '观众',
      radius: 0.24,
      from: { x: 6.0, y: 9.4 },
      to: { x: 12.5, y: 9.4 },
      speed: 0.5,
      t: 0.55,
      dir: -1,
      pos: { x: 9.58, y: 9.4 },
    },
    {
      id: 3,
      label: '讲解员',
      radius: 0.26,
      from: { x: 11.2, y: 3.2 },
      to: { x: 14.9, y: 3.2 },
      speed: 0.38,
      t: 0.4,
      dir: 1,
      pos: { x: 12.68, y: 3.2 },
    },
  ]
}

export const exhibitionMap: NavMapDef = {
  id: 'exhibition',
  label: '展厅',
  icon: '◇',
  subtitle: '智能展厅 18 × 12 米',
  worldW: W,
  worldH: H,
  cellSize: 0.2,
  paint,
  stations: [
    { id: 'charge', label: '充电桩', icon: '⚡', pos: { x: 1.0, y: 11.0 } },
    { id: 'entrance', label: '入口接待', icon: '◈', pos: { x: 1.0, y: 6.0 } },
    { id: 'stage', label: '主舞台', icon: '▣', pos: { x: 9.0, y: 3.9 } },
    { id: 'boothA', label: 'A 区展位', icon: '❒', pos: { x: 4.2, y: 2.6 } },
    { id: 'boothB', label: 'B 区展位', icon: '▤', pos: { x: 12.0, y: 9.0 } },
    { id: 'tea', label: '茶歇区', icon: '♨', pos: { x: 16.2, y: 6.2 } },
  ],
  makeObstacles,
  homeStationId: 'charge',
  twinAnchor: { x: 1.0, y: 11.0 },
}
