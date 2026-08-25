import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { twinEngine } from '../twin/engine'
import type { TaskAction, TwinSnapshot } from '../types'
import { BayCamera } from './BayCamera'
import { BookFlightMesh } from './BookFlight'
import { Bookshelf } from './Bookshelf'
import { DeliveryCart } from './DeliveryCart'
import { Environment3D } from './Environment3D'
import { Gantry } from './Gantry'
import { TransferBay } from './TransferBay'

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

function CameraRig({ presetIdx, resetToken, cruise }: { presetIdx: number; resetToken: number; cruise: boolean }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControls | null>(null)

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 0.85
    controls.maxDistance = 11
    controls.maxPolarAngle = Math.PI * 0.49
    controls.minPolarAngle = Math.PI * 0.08
    controls.autoRotateSpeed = 0.7
    controlsRef.current = controls
    return () => controls.dispose()
  }, [camera, gl])

  useEffect(() => {
    const preset = CAMERA_PRESETS[presetIdx] ?? CAMERA_PRESETS[0]
    camera.position.set(...preset.pos)
    controlsRef.current?.target.set(...preset.target)
    controlsRef.current?.update()
  }, [camera, presetIdx, resetToken])

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = cruise
  }, [cruise])

  useFrame(() => controlsRef.current?.update())
  return null
}

type TwinSceneProps = {
  snapshot: TwinSnapshot
  presetIdx: number
  resetToken: number
  cruise: boolean
}

export function TwinScene({ snapshot, presetIdx, resetToken, cruise }: TwinSceneProps) {
  const preset = CAMERA_PRESETS[presetIdx] ?? CAMERA_PRESETS[0]
  const inspectCabinet = preset.id === 'cabinet' || preset.id === 'robot' || preset.id === 'laminate'
  const inspectRobot = preset.id === 'robot'

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 42, position: CAMERA_PRESETS[0].pos, near: 0.08, far: 80 }}
      gl={{ antialias: true }}
      onPointerMissed={() => twinEngine.setSelected(null)}
    >
      <color attach="background" args={['#070915']} />
      <fog attach="fog" args={['#070915', 9, 26]} />
      <CameraRig presetIdx={presetIdx} resetToken={resetToken} cruise={cruise} />
      <Environment3D />
      <Suspense fallback={null}>
        <Bookshelf
          compartments={snapshot.compartments}
          booksById={snapshot.booksById}
          selectedCid={snapshot.selectedCid}
          hoveredCid={snapshot.hoveredCid}
          task={snapshot.task}
          uv={snapshot.modules.uv}
          laminate={snapshot.modules.laminate}
          inspect={inspectCabinet}
        />
        <Gantry />
        <TransferBay />
        <BayCamera />
        <DeliveryCart inspect={inspectRobot} />
        <BookFlightMesh />
      </Suspense>
    </Canvas>
  )
}
