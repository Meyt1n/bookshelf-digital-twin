import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function StarDust() {
  const geometry = useMemo(() => {
    const count = 480
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 13 + Math.random() * 15
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.54
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 0.4
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [])

  const groupRef = useRef<THREE.Group>(null)
  const matRef = useRef<THREE.PointsMaterial>(null)

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.008
    if (matRef.current) {
      matRef.current.opacity = 0.5 + 0.2 * Math.sin(performance.now() / 1400)
    }
  })

  return (
    <group ref={groupRef}>
      <points geometry={geometry}>
        <pointsMaterial ref={matRef} size={0.034} color="#aec2ff" transparent opacity={0.6} sizeAttenuation />
      </points>
    </group>
  )
}

export function Environment3D() {
  return (
    <group>
      <ambientLight intensity={0.62} color="#e7ebff" />
      <hemisphereLight args={['#b8c6ff', '#131a3a', 0.85]} />
      <directionalLight position={[4.5, 7, 4.5]} intensity={1.5} color="#eef1ff" />
      <directionalLight position={[-3.5, 5, -3]} intensity={0.55} color="#9db4ff" />
      <pointLight position={[-4, 3.4, -3]} intensity={26} color="#7c8cf8" distance={16} />
      <pointLight position={[3.5, 1.2, 3.5]} intensity={15} color="#22d3ee" distance={12} />
      <pointLight position={[0, 4.5, -5]} intensity={12} color="#a78bfa" distance={14} />
      {/* 柜体内部补光 */}
      <pointLight position={[0.3, 1.6, 0]} intensity={6} color="#aebfff" distance={5} />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[26, 64]} />
        <meshStandardMaterial color="#080b18" roughness={0.9} metalness={0.2} />
      </mesh>
      <gridHelper args={[26, 52, '#2c3766', '#141a35']} position={[0, 0, 0]} />

      {/* 中心光环 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.4]}>
        <ringGeometry args={[3.05, 3.11, 96]} />
        <meshBasicMaterial color="#8ca6ff" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0.4]}>
        <ringGeometry args={[3.5, 3.517, 96]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.26} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* 柜体地面投影光晕 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[1.9, 64]} />
        <meshBasicMaterial color="#4c5fd0" transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[1.86, 1.9, 80]} />
        <meshBasicMaterial color="#7c8cf8" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <StarDust />
    </group>
  )
}
