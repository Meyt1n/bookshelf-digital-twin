import type { TaskAction } from '../types'

export type CameraPreset = {
  id: string
  label: string
  pos: [number, number, number]
  target: [number, number, number]
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'default', label: '全景', pos: [3.1, 2.5, 4.1], target: [0.05, 1.2, 0] },
  { id: 'front', label: '正面', pos: [0.15, 1.9, 4.7], target: [0.05, 1.3, 0] },
  { id: 'top', label: '俯瞰', pos: [1.2, 5.4, 2.2], target: [0, 0.7, 0] },
  { id: 'gantry', label: '龙门', pos: [1.9, 2.9, 2.6], target: [0, 1.75, 0.4] },
  { id: 'bay', label: '大隔间', pos: [-0.66, 1.52, 2.05], target: [-0.53, 1.0, 0] },
  { id: 'cart', label: '送书', pos: [-0.8, 1.42, -2.55], target: [-0.53, 0.95, -0.55] },
  { id: 'scan-cam', label: '识别', pos: [-0.56, 1.9, 1.5], target: [-0.53, 1.12, -0.05] },
  { id: 'cabinet', label: '柜体', pos: [2.15, 1.55, 2.05], target: [0.02, 1.05, -0.05] },
  { id: 'robot', label: '机器人', pos: [-1.05, 0.82, -1.42], target: [-0.53, 0.42, -0.82] },
  { id: 'laminate', label: '塑封', pos: [0.42, 0.72, 1.38], target: [-0.53, 0.24, -0.08] },
]

export function cameraForTask(action: TaskAction, phase: string): string {
  if (action === 'store') {
    if (phase === 'dispatch' || phase === 'ack' || phase === 'deliver') return 'cart'
    if (phase === 'scan') return 'scan-cam'
    if (phase === 'handoff') return 'bay'
    if (phase === 'lift' || phase === 'traverse' || phase === 'operate' || phase === 'retract' || phase === 'return') {
      return 'gantry'
    }
    return 'front'
  }
  if (phase === 'handoff') return 'bay'
  if (phase === 'dispatch' || phase === 'ack') return 'front'
  return 'gantry'
}
