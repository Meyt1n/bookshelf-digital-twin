import { Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { twinEngine } from '../twin/engine'
import type { TwinSnapshot } from '../types'
import { BayCamera } from './BayCamera'
import { BookFlightMesh } from './BookFlight'
import { Bookshelf } from './Bookshelf'
import { CAMERA_PRESETS } from './cameraPresets'
import { DeliveryCart } from './DeliveryCart'
import { Environment3D } from './Environment3D'
import { Gantry } from './Gantry'
import { TransferBay } from './TransferBay'

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

function SceneLoadingFallback() {
  return (
    <mesh position={[0, 1.1, 0]}>
      <boxGeometry args={[0.35, 0.35, 0.35]} />
      <meshStandardMaterial color="#7c8cf8" emissive="#22d3ee" emissiveIntensity={0.35} wireframe />
    </mesh>
  )
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
  const isCoarse =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  return (
    <Canvas
      dpr={isCoarse ? [1, 1.25] : [1, 1.75]}
      camera={{ fov: 42, position: CAMERA_PRESETS[0].pos, near: 0.08, far: 80 }}
      gl={{ antialias: !isCoarse, powerPreference: 'high-performance' }}
      onPointerMissed={() => twinEngine.setSelected(null)}
    >
      <color attach="background" args={['#070915']} />
      <fog attach="fog" args={['#070915', 9, 26]} />
      <CameraRig presetIdx={presetIdx} resetToken={resetToken} cruise={cruise} />
      <Environment3D />
      <Suspense fallback={<SceneLoadingFallback />}>
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
