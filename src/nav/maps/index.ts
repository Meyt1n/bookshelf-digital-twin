/* ============================================================
   导航地图注册表：图书馆 / 仓库 / 展厅
   仿真器通过 getNavMap(id) 加载；UI 通过 NAV_MAPS 渲染切换页签
   ============================================================ */

import type { NavMapDef, NavMapId } from '../types'
import { exhibitionMap } from './exhibition'
import { libraryMap } from './library'
import { warehouseMap } from './warehouse'

export const NAV_MAPS: NavMapDef[] = [libraryMap, warehouseMap, exhibitionMap]

const BY_ID = new Map<NavMapId, NavMapDef>(NAV_MAPS.map((m) => [m.id, m]))

export function getNavMap(id: NavMapId): NavMapDef {
  return BY_ID.get(id) ?? libraryMap
}
