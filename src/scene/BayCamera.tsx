import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { twinEngine } from '../twin/engine'
import { BAY_CAM } from './layout'

/** 第二层最左侧大隔间上方：夹紧后对书封拍照识别 */
export function BayCamera() {
  const flashRef = useRef<THREE.PointLight>(null)
  const spotRef = useRef<THREE.SpotLight>(null)
  const coneRef = useRef<THREE.MeshBasicMaterial>(null)
  const lensRef = useRef<THREE.MeshStandardMaterial>(null)
  const ringRef = useRef<THREE.MeshStandardMaterial>(null)
  const targetRef = useRef<THREE.Object3D>(null)

  useFrame(() => {
    const pose = twinEngine.sampleBay(performance.now())
    const snapshot = twinEngine.getSnapshot()
    const scanning = snapshot.task?.phase === 'scan' || snapshot.modules.camera.status === 'running'
    const flash = pose.scanFlash
    if (flashRef.current) flashRef.current.intensity = flash * 14
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current
      spotRef.current.intensity = scanning ? 1.6 + flash * 6 : 0.18
    }
    if (coneRef.current) coneRef.current.opacity = scanning ? 0.14 + flash * 0.4 : 0
    if (lensRef.current) lensRef.current.emissiveIntensity = scanning ? 1.1 + flash * 2.4 : 0.4
    if (ringRef.current) ringRef.current.emissiveIntensity = 0.15 + flash * 3.2
  })

  return (
    <group position={[BAY_CAM.x, BAY_CAM.y, BAY_CAM.z]}>
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[0.055, 0.028, 0.07]} />
        <meshStandardMaterial color="#1a2238" metalness={0.55} roughness={0.35} emissive="#243056" emissiveIntensity={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.012, 0.006]}>
        <cylinderGeometry args={[0.016, 0.018, 0.022, 20]} />
        <meshStandardMaterial
          ref={lensRef}
          color="#0b1224"
          metalness={0.85}
          roughness={0.12}
          emissive="#38bdf8"
          emissiveIntensity={0.4}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.02, 0.006]}>
        <torusGeometry args={[0.02, 0.0035, 8, 20]} />
        <meshStandardMaterial
          ref={ringRef}
          color="#e2e8f0"
          metalness={0.7}
          roughness={0.25}
          emissive="#f8fafc"
          emissiveIntensity={0.15}
        />
      </mesh>
      <mesh rotation={[Math.PI, 0, 0]} position={[0, -0.22, 0.006]}>
        <coneGeometry args={[0.1, 0.42, 16, 1, true]} />
        <meshBasicMaterial ref={coneRef} color="#7dd3fc" transparent opacity={0.045} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <object3D ref={targetRef} position={[0, -0.55, 0.02]} />
      <pointLight ref={flashRef} color="#fff7ed" intensity={0} distance={1.6} decay={2} position={[0, -0.04, 0]} />
      <spotLight ref={spotRef} color="#e0f2fe" intensity={0.18} distance={1.4} angle={0.42} penumbra={0.45} position={[0, -0.02, 0]} />
    </group>
  )
}
