/* ============================================================
   地图 · 立体仓库（20m × 14m）
   四列纵向高位货架 + 底部装卸月台 + 右侧打包区与散落托盘；
   货架间巷道 2.3m，膨胀后剩余 ~1.7m，适合阿克曼小车转弯
   动态障碍：叉车横穿货架下缘、拣货员在巷道内往返、拖板车在打包区
   ============================================================ */

import { setRectWorld } from '../grid'
import type { DynamicObstacle, NavMapDef, OccupancyGrid } from '../types'

const W = 20
const H = 14

function paint(grid: OccupancyGrid): void {
  grid.occ.fill(0)
  // 四周外墙
  setRectWorld(grid, 0, 0, W, 0.2, 1)
  setRectWorld(grid, 0, H - 0.2, W, H, 1)
  setRectWorld(grid, 0, 0, 0.2, H, 1)
  setRectWorld(grid, W - 0.2, 0, W, H, 1)
  // 四列纵向货架（y 2.4 ~ 10.4），巷道净宽 2.3m
  for (let i = 0; i < 4; i++) {
    const x = 2.6 + i * 3.2
    setRectWorld(grid, x, 2.4, x + 0.9, 10.4, 1)
  }
  // 装卸月台（底部两段，中间留发货通道）
  setRectWorld(grid, 2.0, 12.9, 8.0, 13.8, 1)
  setRectWorld(grid, 10.0, 12.9, 16.0, 13.8, 1)
  // 打包工作台（右上）
  setRectWorld(grid, 15.2, 1.6, 18.4, 2.4, 1)
  // 散落托盘
  setRectWorld(grid, 15.0, 6.5, 16.2, 7.7, 1)
  setRectWorld(grid, 16.8, 9.0, 18.0, 10.2, 1)
  setRectWorld(grid, 14.6, 11.0, 15.8, 12.2, 1)
}

function makeObstacles(): DynamicObstacle[] {
  return [
    {
      id: 1,
      label: '叉车',
      radius: 0.34,
      from: { x: 4.3, y: 11.6 },
      to: { x: 15.5, y: 11.6 },
      speed: 0.55,
      t: 0.2,
      dir: 1,
      pos: { x: 6.54, y: 11.6 },
    },
    {
      id: 2,
      label: '拣货员',
      radius: 0.24,
      from: { x: 7.85, y: 3.0 },
      to: { x: 7.85, y: 9.8 },
      speed: 0.5,
      t: 0.5,
      dir: 1,
      pos: { x: 7.85, y: 6.4 },
    },
    {
      id: 3,
      label: '拖板车',
      radius: 0.3,
      from: { x: 14.0, y: 5.0 },
      to: { x: 18.6, y: 5.0 },
      speed: 0.4,
      t: 0.3,
      dir: -1,
      pos: { x: 15.38, y: 5.0 },
    },
  ]
}

export const warehouseMap: NavMapDef = {
  id: 'warehouse',
  label: '仓库',
  icon: '▤',
  subtitle: '立体仓库 20 × 14 米',
  worldW: W,
  worldH: H,
  cellSize: 0.2,
  paint,
  stations: [
    { id: 'charge', label: '充电桩', icon: '⚡', pos: { x: 1.1, y: 1.1 } },
    { id: 'inbound', label: '收货口', icon: '⬇', pos: { x: 17.9, y: 12.9 } },
    { id: 'shipping', label: '发货台', icon: '⬆', pos: { x: 9.0, y: 13.3 } },
    { id: 'picking', label: '拣选区', icon: '❒', pos: { x: 7.9, y: 6.4 } },
    { id: 'packing', label: '打包台', icon: '▤', pos: { x: 16.8, y: 3.2 } },
    { id: 'rack', label: '高位货架', icon: '☰', pos: { x: 11.0, y: 8.4 } },
  ],
  makeObstacles,
  homeStationId: 'charge',
  twinAnchor: { x: 1.1, y: 1.1 },
}
