/* ============================================================
   配送导航 · 核心类型
   世界坐标：米，x 向右，y 向下（与画布一致）；theta 为 atan2 弧度
   ============================================================ */

/** 二维点 / 向量（世界坐标，单位：米） */
export type Vec2 = { x: number; y: number }

/** 机器人位姿：位置 + 朝向角（弧度） */
export type Pose = { x: number; y: number; theta: number }

/** 速度指令：线速度 v（m/s）+ 角速度 w（rad/s） */
export type Twist = { v: number; w: number }

/** 阿克曼指令：线速度 v（m/s，负值 = 倒车）+ 前轮转角 delta（弧度，与 θ 增大方向同号） */
export type AckermannCommand = { v: number; delta: number }

/** 栅格坐标（列 cx，行 cy） */
export type Cell = { cx: number; cy: number }

/**
 * 占据栅格。三层数据：
 * - occ：静态障碍（书架 / 墙体 / 立柱），1 = 占据
 * - inflated：按机器人半径膨胀后的禁行层，1 = 禁行
 * - near：贴近障碍的软代价（0~40），A* 用于让路径远离墙面
 */
export type OccupancyGrid = {
  cols: number
  rows: number
  /** 米 / 格 */
  cellSize: number
  occ: Uint8Array
  inflated: Uint8Array
  near: Uint8Array
}

/** 圆形动态障碍（行人 / 推车），沿 from→to 匀速往返 */
export type DynamicObstacle = {
  id: number
  label: string
  radius: number
  from: Vec2
  to: Vec2
  /** m/s */
  speed: number
  /** 0..1 相位 */
  t: number
  dir: 1 | -1
  pos: Vec2
}

/** 可一键派送的站点 */
export type Station = {
  id: string
  label: string
  icon: string
  pos: Vec2
}

/** 任务阶段 */
export type MissionPhase =
  | 'idle'
  | 'planning'
  | 'moving'
  | 'arrived'
  | 'blocked'
  | 'unreachable'

/** 导航事件（中文日志） */
export type NavEvent = {
  id: number
  /** 仿真时刻，秒 */
  time: number
  text: string
  kind: 'info' | 'ok' | 'warn' | 'bad'
}

/** 可切换的导航地图 */
export type NavMapId = 'library' | 'warehouse' | 'exhibition'

/**
 * 导航地图定义。世界尺寸可各不相同，仿真器按 worldW/worldH ÷ cellSize
 * 动态创建栅格；stations 会吸附到最近可通行格中心。
 */
export type NavMapDef = {
  id: NavMapId
  label: string
  icon: string
  /** 场地一句话描述（用于画布 aria-label 等） */
  subtitle: string
  /** 世界宽（米） */
  worldW: number
  /** 世界高（米） */
  worldH: number
  /** 米 / 格 */
  cellSize: number
  /** 在空栅格上绘制静态障碍（外墙 + 家具 / 货架 / 展位） */
  paint(grid: OccupancyGrid): void
  stations: Station[]
  /** 每次加载生成新的动态障碍（行人 / 叉车 / 观众） */
  makeObstacles(): DynamicObstacle[]
  /** 小车出生站点 id（默认取第一个站点） */
  homeStationId: string
  /** 孪生桥接锚点：该导航坐标映射到 3D 场景的 CART_HOME */
  twinAnchor: Vec2
}
