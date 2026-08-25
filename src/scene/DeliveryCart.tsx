import { useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { categoryColor } from '../catalog'
import { twinEngine } from '../twin/engine'
import { BookMesh } from './BookMesh'
import {
  CART_DOCK,
  CART_HOME,
  ROBOT_BOOK_FIT,
  ROBOT_BOOK_LOCAL_Y,
  ROBOT_COL_TOP_Y,
  ROBOT_GRIPPER_HOLD_Z,
  ROBOT_GRIPPER_JAW_Y,
  ROBOT_GRIPPER_RAISE_Y,
  ROBOT_LIFT_CAD_BOTTOM_Y,
  ROBOT_MAST_Z,
  robotGripperLocalZ,
} from './layout'

type Spring = { p: number; v: number }

function stepSpring(s: Spring, target: number, dt: number, stiffness: number, damping: number): void {
  const a = (target - s.p) * stiffness - s.v * damping
  s.v += a * dt
  s.p += s.v * dt
}

const MAT_CHASSIS = new THREE.MeshStandardMaterial({
  color: '#1a1e26',
  metalness: 0.58,
  roughness: 0.38,
  emissive: '#12151c',
  emissiveIntensity: 0.34,
})
const MAT_LIFT = new THREE.MeshStandardMaterial({
  color: '#c5ccd6',
  metalness: 0.72,
  roughness: 0.28,
  emissive: '#2a3344',
  emissiveIntensity: 0.28,
})
const MAT_GRIPPER = new THREE.MeshStandardMaterial({
  color: '#e65c2a',
  metalness: 0.4,
  roughness: 0.36,
  emissive: '#c2410c',
  emissiveIntensity: 0.48,
})

const MAST_BOTTOM = ROBOT_COL_TOP_Y - 0.05
const MAST_TOP = ROBOT_LIFT_CAD_BOTTOM_Y + ROBOT_GRIPPER_RAISE_Y + 0.06
const MAST_H = MAST_TOP - MAST_BOTTOM
const MAST_Y = (MAST_BOTTOM + MAST_TOP) / 2

type RobotParts = {
  chassis: THREE.Mesh
  lift: THREE.Mesh
  gripper: THREE.Mesh
}

function useRobotParts(): RobotParts {
  const gltf = useLoader(GLTFLoader, '/model/delivery-robot.glb')
  return useMemo(() => {
    const root = gltf.scene.clone(true)
    const parts: Partial<RobotParts> = {}
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      if (mesh.name.includes('chassis')) {
        mesh.material = MAT_CHASSIS
        parts.chassis = mesh
      } else if (mesh.name.includes('lift')) {
        mesh.material = MAT_LIFT
        parts.lift = mesh
      } else if (mesh.name.includes('gripper')) {
        mesh.material = MAT_GRIPPER
        parts.gripper = mesh
      }
    })
    if (!parts.chassis || !parts.lift || !parts.gripper) {
      throw new Error('delivery-robot.glb 缺少 chassis/lift/gripper')
    }
    return parts as RobotParts
  }, [gltf])
}

function makeLabel(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(8, 12, 28, 0.78)'
  ctx.fillRect(8, 8, 240, 48)
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.7)'
  ctx.lineWidth = 2
  ctx.strokeRect(8, 8, 240, 48)
  ctx.fillStyle = '#ffedd5'
  ctx.font = '600 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 34)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** CAD 送书机器人：夹爪固定在书腰高度，从柜后把书送进大隔间 */
export function DeliveryCart({ inspect = false }: { inspect?: boolean }) {
  const parts = useRobotParts()
  const groupRef = useRef<THREE.Group>(null)
  const liftRef = useRef<THREE.Group>(null)
  const gripperRef = useRef<THREE.Group>(null)
  const bookRef = useRef<THREE.Group>(null)
  const lastBookId = useRef<number | null>(null)
  const [held, setHeld] = useState<{ title: string; color: string } | null>(null)

  const sx = useRef<Spring>({ p: CART_HOME.x, v: 0 })
  const sz = useRef<Spring>({ p: CART_HOME.z, v: 0 })
  const syaw = useRef<Spring>({ p: 0, v: 0 })
  const sreach = useRef<Spring>({ p: 0, v: 0 })
  const lastTime = useRef(performance.now())

  const padGeo = useMemo(() => new THREE.RingGeometry(0.22, 0.28, 48), [])
  const labels = useMemo(
    () => ({
      chassis: makeLabel('底盘'),
      mast: makeLabel('立柱'),
      gripper: makeLabel('夹爪'),
    }),
    [],
  )

  useFrame(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - lastTime.current) / 1000)
    lastTime.current = now

    const pose = twinEngine.sampleCart(now)
    const snapshot = twinEngine.getSnapshot()

    stepSpring(sx.current, pose.x, dt, 36, 22)
    stepSpring(sz.current, pose.z, dt, 36, 22)
    let yawErr = pose.yaw - syaw.current.p
    yawErr = Math.atan2(Math.sin(yawErr), Math.cos(yawErr))
    syaw.current.v += (yawErr * 28 - syaw.current.v * 16) * dt
    syaw.current.p += syaw.current.v * dt
    stepSpring(sreach.current, pose.reach, dt, 48, 28)
    if (Math.abs(pose.reach - sreach.current.p) < 0.01 && Math.abs(sreach.current.v) < 0.08) {
      sreach.current.p = pose.reach
      sreach.current.v = 0
    }

    if (groupRef.current) {
      groupRef.current.position.set(sx.current.p, 0, sz.current.p)
      groupRef.current.rotation.y = syaw.current.p
    }
    if (gripperRef.current) {
      gripperRef.current.position.z = robotGripperLocalZ(sreach.current.p)
    }
    if (bookRef.current) {
      bookRef.current.visible = pose.carrying
      if (pose.carrying && pose.carryBookId !== null && pose.carryBookId !== lastBookId.current) {
        lastBookId.current = pose.carryBookId
        const book = snapshot.booksById[pose.carryBookId]
        setHeld({ title: book?.title ?? '', color: categoryColor(book?.category) })
      }
      if (!pose.carrying) lastBookId.current = null
    }

  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CART_DOCK.x, 0.006, CART_DOCK.z]} geometry={padGeo}>
        <meshBasicMaterial color="#f97316" transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <group ref={groupRef}>
        <primitive object={parts.chassis} />
        <mesh position={[0, MAST_Y, ROBOT_MAST_Z]} material={MAT_LIFT}>
          <boxGeometry args={[0.046, MAST_H, 0.046]} />
        </mesh>
        <mesh position={[0, MAST_Y, ROBOT_MAST_Z]} material={MAT_CHASSIS}>
          <boxGeometry args={[0.032, MAST_H + 0.02, 0.032]} />
        </mesh>
        {[-0.32, 0, 0.32].map((t) => (
          <mesh
            key={t}
            position={[0, MAST_Y + (MAST_H / 2) * t, ROBOT_MAST_Z]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.028, 0.004, 8, 18]} />
            <meshStandardMaterial color="#d6dde6" metalness={0.85} roughness={0.22} />
          </mesh>
        ))}
        <group ref={liftRef} position={[0, ROBOT_GRIPPER_RAISE_Y, 0]}>
          <primitive object={parts.lift} />
          <group ref={gripperRef}>
            <primitive object={parts.gripper} />
            <group
              ref={bookRef}
              position={[0, ROBOT_BOOK_LOCAL_Y, ROBOT_GRIPPER_HOLD_Z]}
              scale={[ROBOT_BOOK_FIT, 1, 1]}
              visible={false}
            >
              {held ? <BookMesh color={held.color} title={held.title} /> : null}
            </group>
          </group>
        </group>
        {inspect ? (
          <>
            <sprite position={[0.22, 0.14, 0]} scale={[0.32, 0.08, 1]}>
              <spriteMaterial map={labels.chassis} transparent depthWrite={false} />
            </sprite>
            <sprite position={[0.22, MAST_Y, ROBOT_MAST_Z]} scale={[0.32, 0.08, 1]}>
              <spriteMaterial map={labels.mast} transparent depthWrite={false} />
            </sprite>
            <sprite position={[0.22, ROBOT_GRIPPER_RAISE_Y + ROBOT_GRIPPER_JAW_Y, 0.05]} scale={[0.32, 0.08, 1]}>
              <spriteMaterial map={labels.gripper} transparent depthWrite={false} />
            </sprite>
          </>
        ) : null}
      </group>
    </group>
  )
}
