import type {
  BookInfo,
  Compartment,
  ModuleState,
  MotionTask,
  OcrJob,
  Registers,
  StoredMeta,
  Telemetry,
  TwinEvent,
  TwinSnapshot,
  TwinStats,
} from '../types'

export function refEqual<T>(a: T, b: T): boolean {
  return a === b
}

export type SceneSlice = {
  compartments: Compartment[]
  booksById: Record<number, BookInfo>
  selectedCid: number | null
  hoveredCid: number | null
  task: MotionTask | null
  uv: ModuleState
  laminate: ModuleState
}

export function selectScene(s: TwinSnapshot): SceneSlice {
  return {
    compartments: s.compartments,
    booksById: s.booksById,
    selectedCid: s.selectedCid,
    hoveredCid: s.hoveredCid,
    task: s.task,
    uv: s.modules.uv,
    laminate: s.modules.laminate,
  }
}

export function sceneEqual(a: SceneSlice, b: SceneSlice): boolean {
  return (
    a.compartments === b.compartments &&
    a.booksById === b.booksById &&
    a.selectedCid === b.selectedCid &&
    a.hoveredCid === b.hoveredCid &&
    a.task === b.task &&
    a.uv === b.uv &&
    a.laminate === b.laminate
  )
}

export type KpiSlice = {
  compartmentCount: number
  used: number
  storeCount: number
  takeCount: number
  live: boolean
}

export function selectKpi(s: TwinSnapshot): KpiSlice {
  const used = s.compartments.reduce((n, c) => n + (c.status === 'occupied' ? 1 : 0), 0)
  const live =
    (s.task !== null && s.task.phase !== 'done' && s.task.phase !== 'fault') ||
    s.ocr !== null ||
    s.modules.uv.status === 'running' ||
    s.modules.laminate.status === 'running'
  return {
    compartmentCount: s.compartments.length,
    used,
    storeCount: s.stats.storeCount,
    takeCount: s.stats.takeCount,
    live,
  }
}

export function kpiEqual(a: KpiSlice, b: KpiSlice): boolean {
  return (
    a.compartmentCount === b.compartmentCount &&
    a.used === b.used &&
    a.storeCount === b.storeCount &&
    a.takeCount === b.takeCount &&
    a.live === b.live
  )
}

export type HoverTipSlice = {
  hoveredCid: number | null
  floor: number | null
  cell: number | null
  title: string | null
  author: string | null
}

export function selectHoverTip(s: TwinSnapshot): HoverTipSlice {
  if (s.hoveredCid === null) {
    return { hoveredCid: null, floor: null, cell: null, title: null, author: null }
  }
  const comp = s.compartments.find((c) => c.cid === s.hoveredCid)
  if (!comp) return { hoveredCid: s.hoveredCid, floor: null, cell: null, title: null, author: null }
  const book = comp.bookId !== null ? s.booksById[comp.bookId] : null
  return {
    hoveredCid: s.hoveredCid,
    floor: comp.floor,
    cell: comp.cell,
    title: book?.title ?? null,
    author: book?.author ?? null,
  }
}

export function hoverTipEqual(a: HoverTipSlice, b: HoverTipSlice): boolean {
  return (
    a.hoveredCid === b.hoveredCid &&
    a.floor === b.floor &&
    a.cell === b.cell &&
    a.title === b.title &&
    a.author === b.author
  )
}

export type CameraFollowSlice = {
  taskAction: MotionTask['action'] | null
  taskPhase: MotionTask['phase'] | null
  taskId: string | null
  laminateRunning: boolean
}

export function selectCameraFollow(s: TwinSnapshot): CameraFollowSlice {
  return {
    taskAction: s.task?.action ?? null,
    taskPhase: s.task?.phase ?? null,
    taskId: s.task?.id ?? null,
    laminateRunning: s.modules.laminate.status === 'running',
  }
}

export function cameraFollowEqual(a: CameraFollowSlice, b: CameraFollowSlice): boolean {
  return (
    a.taskAction === b.taskAction &&
    a.taskPhase === b.taskPhase &&
    a.taskId === b.taskId &&
    a.laminateRunning === b.laminateRunning
  )
}

export function selectEvents(s: TwinSnapshot): TwinEvent[] {
  return s.events
}

export function selectTelemetry(s: TwinSnapshot): Telemetry {
  return s.telemetry
}

export function selectRegisters(s: TwinSnapshot): Registers {
  return s.registers
}

export type ModulesSlice = {
  task: MotionTask | null
  ocr: OcrJob | null
  modules: TwinSnapshot['modules']
}

export function selectModules(s: TwinSnapshot): ModulesSlice {
  return { task: s.task, ocr: s.ocr, modules: s.modules }
}

export function modulesEqual(a: ModulesSlice, b: ModulesSlice): boolean {
  return a.task === b.task && a.ocr === b.ocr && a.modules === b.modules
}

export type TaskCardSlice = {
  task: MotionTask | null
  ocr: OcrJob | null
  ocrTitle: string | null
}

export function selectTaskCard(s: TwinSnapshot): TaskCardSlice {
  return {
    task: s.task,
    ocr: s.ocr,
    ocrTitle: s.ocr ? (s.booksById[s.ocr.bookId]?.title ?? null) : null,
  }
}

export function taskCardEqual(a: TaskCardSlice, b: TaskCardSlice): boolean {
  return a.task === b.task && a.ocr === b.ocr && a.ocrTitle === b.ocrTitle
}

export type CommandDeckSlice = {
  task: MotionTask | null
  ocr: OcrJob | null
  mode: TwinSnapshot['mode']
  autonomous: boolean
  uvStatus: ModuleState['status']
  laminateStatus: ModuleState['status']
}

export function selectCommandDeck(s: TwinSnapshot): CommandDeckSlice {
  return {
    task: s.task,
    ocr: s.ocr,
    mode: s.mode,
    autonomous: s.autonomous,
    uvStatus: s.modules.uv.status,
    laminateStatus: s.modules.laminate.status,
  }
}

export function commandDeckEqual(a: CommandDeckSlice, b: CommandDeckSlice): boolean {
  return (
    a.task === b.task &&
    a.ocr === b.ocr &&
    a.mode === b.mode &&
    a.autonomous === b.autonomous &&
    a.uvStatus === b.uvStatus &&
    a.laminateStatus === b.laminateStatus
  )
}

export type CompartmentPanelSlice = {
  mode: TwinSnapshot['mode']
  compartments: Compartment[]
  booksById: Record<number, BookInfo>
  stored: Record<number, StoredMeta>
  selectedCid: number | null
  hoveredCid: number | null
  task: MotionTask | null
  ocr: OcrJob | null
  offShelfBookIds: number[]
}

export function selectCompartmentPanel(s: TwinSnapshot): CompartmentPanelSlice {
  return {
    mode: s.mode,
    compartments: s.compartments,
    booksById: s.booksById,
    stored: s.stored,
    selectedCid: s.selectedCid,
    hoveredCid: s.hoveredCid,
    task: s.task,
    ocr: s.ocr,
    offShelfBookIds: s.offShelfBookIds,
  }
}

export function compartmentPanelEqual(a: CompartmentPanelSlice, b: CompartmentPanelSlice): boolean {
  return (
    a.mode === b.mode &&
    a.compartments === b.compartments &&
    a.booksById === b.booksById &&
    a.stored === b.stored &&
    a.selectedCid === b.selectedCid &&
    a.hoveredCid === b.hoveredCid &&
    a.task === b.task &&
    a.ocr === b.ocr &&
    a.offShelfBookIds === b.offShelfBookIds
  )
}

export type InventorySlice = {
  compartments: Compartment[]
  booksById: Record<number, BookInfo>
  stored: Record<number, StoredMeta>
  selectedCid: number | null
  stats: TwinStats
  offShelfBookIds: number[]
}

export function selectInventory(s: TwinSnapshot): InventorySlice {
  return {
    compartments: s.compartments,
    booksById: s.booksById,
    stored: s.stored,
    selectedCid: s.selectedCid,
    stats: s.stats,
    offShelfBookIds: s.offShelfBookIds,
  }
}

export function inventoryEqual(a: InventorySlice, b: InventorySlice): boolean {
  return (
    a.compartments === b.compartments &&
    a.booksById === b.booksById &&
    a.stored === b.stored &&
    a.selectedCid === b.selectedCid &&
    a.stats === b.stats &&
    a.offShelfBookIds === b.offShelfBookIds
  )
}
