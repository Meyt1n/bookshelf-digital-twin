import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GraphicsProfile } from '../graphics/perfTier'
import { twinEngine } from '../twin/engine'
import { sceneEqual, selectScene } from '../twin/selectors'
import { useTwinSelector } from '../twin/useTwin'
import { BayCamera } from './BayCamera'
import { Bookshelf } from './Bookshelf'
import { CAMERA_PRESETS } from './cameraPresets'
import { Environment3D } from './Environment3D'
import { Gantry } from './Gantry'
import { TransferBay } from './TransferBay'

const DeliveryCart = lazy(() =>
  import('./DeliveryCart').then((m) => ({ default: m.DeliveryCart })),
)
const BookFlightMesh = lazy(() =>
  import('./BookFlight').then((m) => ({ default: m.BookFlightMesh })),
)

const STAGE_LABELS = ['柜体 1/4', '龙门机构 2/4', '送书车 3/4', '就绪 4/4'] as const

function CameraRig({
  presetIdx,
  resetToken,
  cruise,
  enabled,
}: {
  presetIdx: number
  resetToken: number
  cruise: boolean
  enabled: boolean
}) {
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
    if (controlsRef.current) controlsRef.current.autoRotate = cruise && enabled
  }, [cruise, enabled])

  useFrame(() => {
    if (!enabled) return
    controlsRef.current?.update()
  })
  return null
}

function StageReady({ stage, onReady }: { stage: number; onReady: (stage: number) => void }) {
  useEffect(() => {
    onReady(stage)
  }, [stage, onReady])
  return null
}

function StagedModels({
  inspectRobot,
  onStage,
  childrenCabinet,
}: {
  inspectRobot: boolean
  onStage: (stage: number) => void
  childrenCabinet: ReactNode
}) {
  return (
    <Suspense fallback={null}>
      {childrenCabinet}
      <StageReady stage={1} onReady={onStage} />
      <Suspense fallback={null}>
        <Gantry />
        <TransferBay />
        <BayCamera />
        <StageReady stage={2} onReady={onStage} />
        <Suspense fallback={null}>
          <DeliveryCart inspect={inspectRobot} />
          <BookFlightMesh />
          <StageReady stage={3} onReady={onStage} />
        </Suspense>
      </Suspense>
    </Suspense>
  )
}

type TwinSceneProps = {
  active: boolean
  profile: GraphicsProfile
  presetIdx: number
  resetToken: number
  cruise: boolean
}

export function TwinScene({ active, profile, presetIdx, resetToken, cruise }: TwinSceneProps) {
  const scene = useTwinSelector(selectScene, sceneEqual)
  const [stage, setStage] = useState(0)
  const preset = CAMERA_PRESETS[presetIdx] ?? CAMERA_PRESETS[0]
  const inspectCabinet = preset.id === 'cabinet' || preset.id === 'robot' || preset.id === 'laminate'
  const inspectRobot = preset.id === 'robot'
  const loading = stage < 3
  const progressPct = Math.min(100, ((stage + 1) / 4) * 100)

  return (
    <div className="twin-scene-root">
      {loading && (
        <div className="scene-fallback scene-progress" role="status">
          <div className="scene-load-bar">
            <i style={{ width: `${progressPct}%` }} />
          </div>
          <span>{STAGE_LABELS[Math.min(stage, 3)]}</span>
        </div>
      )}
      <Canvas
        dpr={[1, profile.dprMax]}
        frameloop={active ? 'always' : 'never'}
        camera={{ fov: 42, position: CAMERA_PRESETS[0].pos, near: 0.08, far: 80 }}
        gl={{ antialias: profile.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onPointerMissed={() => twinEngine.setSelected(null)}
        style={{ opacity: loading && stage === 0 ? 0.35 : 1, transition: 'opacity 280ms ease' }}
      >
        <color attach="background" args={['#070915']} />
        <fog attach="fog" args={['#070915', 9, 26]} />
        <CameraRig presetIdx={presetIdx} resetToken={resetToken} cruise={cruise} enabled={active} />
        <Environment3D
          animate={active && profile.envAnimate}
          starDust={profile.starDust}
          starCount={profile.starCount}
        />
        <StagedModels
          inspectRobot={inspectRobot}
          onStage={setStage}
          childrenCabinet={
            <Bookshelf
              compartments={scene.compartments}
              booksById={scene.booksById}
              selectedCid={scene.selectedCid}
              hoveredCid={scene.hoveredCid}
              task={scene.task}
              uv={scene.uv}
              laminate={scene.laminate}
              inspect={inspectCabinet}
            />
          }
        />
      </Canvas>
    </div>
  )
}
