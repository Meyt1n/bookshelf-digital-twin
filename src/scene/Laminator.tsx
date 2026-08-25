import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { categoryColor } from '../catalog'
import type { ModuleState } from '../types'
import { twinEngine } from '../twin/engine'
import { BookMesh } from './BookMesh'
import {
  BOOK_DEPTH,
  BOOK_HEIGHT,
  BOOK_THICK,
  LAMINATE_BELT,
  LAMINATE_H,
  LAMINATE_HEATER_N,
  LAMINATE_W,
  LAMINATE_X,
  LAMINATE_Y0,
  LAMINATE_Z_FRONT,
  LAMINATE_Z_REAR,
  laminateChannelLength,
} from './layout'

function makeLaminateBeltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1a2218'
  ctx.fillRect(0, 0, 64, 256)
  for (let i = 0; i < 10; i++) {
    const y = i * 26
    ctx.fillStyle = i % 2 === 0 ? '#3d4a32' : '#2c3626'
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(64, y + 10)
    ctx.lineTo(64, y + 20)
    ctx.lineTo(0, y + 10)
    ctx.closePath()
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 4)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeTag(text: string, accent = '#fde68a'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(8, 12, 32, 0.82)'
  ctx.fillRect(8, 8, 304, 48)
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.strokeRect(8, 8, 304, 48)
  ctx.fillStyle = accent
  ctx.font = '600 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 160, 34)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const SHELL = new THREE.MeshStandardMaterial({
  color: '#3a4a8c',
  metalness: 0.62,
  roughness: 0.36,
  emissive: '#24346e',
  emissiveIntensity: 0.48,
})
const LIP = new THREE.MeshStandardMaterial({
  color: '#2c365e',
  metalness: 0.55,
  roughness: 0.4,
  emissive: '#1c2448',
  emissiveIntensity: 0.4,
})
const METAL = new THREE.MeshStandardMaterial({
  color: '#9aa6c4',
  metalness: 0.78,
  roughness: 0.28,
  emissive: '#2a3348',
  emissiveIntensity: 0.22,
})
const FILM_ROLL = new THREE.MeshStandardMaterial({
  color: '#dbe7f5',
  metalness: 0.12,
  roughness: 0.22,
  transparent: true,
  opacity: 0.55,
  emissive: '#93c5fd',
  emissiveIntensity: 0.18,
})
const FILM_SHEET = new THREE.MeshStandardMaterial({
  color: '#e8f2ff',
  metalness: 0.08,
  roughness: 0.12,
  transparent: true,
  opacity: 0.22,
  emissive: '#bfdbfe',
  emissiveIntensity: 0.2,
  side: THREE.DoubleSide,
  depthWrite: false,
})

/**
 * 柜座左侧底层抽屉 · 剖视：履带 / 膜卷 / 压辊 / 加热片全程可见。
 * 书从正面进入，覆膜随加热行程包覆，完成后停在入口展示封口效果。
 */
export function Laminator({ laminate, inspect = false }: { laminate: ModuleState; inspect?: boolean }) {
  const beltTex = useMemo(() => makeLaminateBeltTexture(), [])
  const tags = useMemo(
    () => ({
      heat: makeTag('加热片', '#fdba74'),
      roll: makeTag('覆膜卷', '#93c5fd'),
      press: makeTag('压辊', '#cbd5e1'),
      belt: makeTag('送进履带', '#86efac'),
      done: makeTag('塑封完成', '#6ee7b7'),
    }),
    [],
  )
  const heaterMats = useMemo(
    () =>
      Array.from({ length: LAMINATE_HEATER_N }, () => [
        new THREE.MeshStandardMaterial({
          color: '#4a2c12',
          metalness: 0.35,
          roughness: 0.4,
          emissive: '#fb923c',
          emissiveIntensity: 0.12,
        }),
        new THREE.MeshStandardMaterial({
          color: '#4a2c12',
          metalness: 0.35,
          roughness: 0.4,
          emissive: '#fb923c',
          emissiveIntensity: 0.12,
        }),
      ]),
    [],
  )
  const topHeaterMats = useMemo(
    () =>
      Array.from(
        { length: LAMINATE_HEATER_N },
        () =>
          new THREE.MeshStandardMaterial({
            color: '#3a2410',
            metalness: 0.4,
            roughness: 0.38,
            emissive: '#f59e0b',
            emissiveIntensity: 0.1,
          }),
      ),
    [],
  )

  const pouchMatRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const pouchRef = useRef<THREE.Group>(null)
  const shineRef = useRef<THREE.MeshBasicMaterial>(null)
  const glowRef = useRef<THREE.MeshBasicMaterial>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const bookRef = useRef<THREE.Group>(null)
  const doneTagRef = useRef<THREE.Sprite>(null)
  const rollerRefs = useRef<THREE.Mesh[]>([])
  const topRollerRefs = useRef<THREE.Mesh[]>([])
  const lastId = useRef<number | null>(null)
  const [held, setHeld] = useState<{ title: string; color: string } | null>(null)

  const length = laminateChannelLength()
  const midZ = (LAMINATE_Z_FRONT + LAMINATE_Z_REAR) / 2
  const wall = 0.016
  const yMid = LAMINATE_Y0 + LAMINATE_H / 2
  const heaterGap = 0.018
  const pouchDepth = BOOK_DEPTH + 0.012
  const pouchH = BOOK_HEIGHT + 0.012
  const pouchT = BOOK_THICK + 0.008

  useFrame((_, dt) => {
    const pose = twinEngine.sampleLaminate(performance.now())
    if (pose.running) beltTex.offset.y = (beltTex.offset.y + dt * 1.35) % 1
    rollerRefs.current.forEach((roller) => {
      if (roller && pose.running) roller.rotation.y += dt * (pose.progress < 0.7 ? 8 : -8)
    })
    topRollerRefs.current.forEach((roller) => {
      if (roller && pose.running) roller.rotation.x += dt * (pose.progress < 0.7 ? 8 : -8)
    })

    heaterMats.forEach((pair, i) => {
      const center = (i + 0.5) / LAMINATE_HEATER_N
      const inbound = Math.min(pose.progress, 0.7) / 0.7
      const near = pose.running ? Math.max(0, 1 - Math.abs(inbound - center) * 4.2) : 0
      const glow = 0.08 + pose.heat * 0.5 + near * 1.7
      pair[0].emissiveIntensity = glow
      pair[1].emissiveIntensity = glow
      topHeaterMats[i].emissiveIntensity = glow * 0.85
    })
    if (glowRef.current) {
      glowRef.current.opacity = pose.running ? 0.16 + pose.heat * 0.2 : 0.035
    }
    if (lightRef.current) {
      lightRef.current.intensity = pose.running ? 3.2 + pose.heat * 4.5 : pose.presenting ? 1.2 : 0.4
    }
    if (bookRef.current) {
      bookRef.current.visible = pose.active && pose.bookId !== null
      if (pose.active) bookRef.current.position.set(pose.x, pose.y, pose.z)
    }
    if (pouchRef.current) {
      const s = Math.max(pose.sealed, 0.001)
      pouchRef.current.visible = pose.sealed > 0.03
      pouchRef.current.scale.set(1, 1, s)
      pouchRef.current.position.z = ((s - 1) * pouchDepth) / 2
    }
    if (pouchMatRef.current) {
      pouchMatRef.current.opacity = 0.12 + pose.sealed * 0.32
      pouchMatRef.current.roughness = 0.22 - pose.sealed * 0.14
      pouchMatRef.current.emissiveIntensity = pose.presenting ? 0.22 : pose.sealed * 0.16
    }
    if (shineRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280)
      shineRef.current.opacity = pose.presenting ? 0.18 + pulse * 0.22 : pose.sealed > 0.85 ? 0.08 : 0
    }
    if (doneTagRef.current) {
      doneTagRef.current.visible = pose.presenting
      if (pose.presenting) {
        doneTagRef.current.position.set(pose.x, pose.y + BOOK_HEIGHT / 2 + 0.08, pose.z)
      }
    }
    if (pose.active && pose.bookId !== null && pose.bookId !== lastId.current) {
      lastId.current = pose.bookId
      const book = twinEngine.getSnapshot().booksById[pose.bookId]
      setHeld({ title: book?.title ?? '待塑封', color: categoryColor(book?.category) })
    }
    if (!pose.active) lastId.current = null
  })

  const heaters = Array.from({ length: LAMINATE_HEATER_N }, (_, i) => {
    const t = (i + 0.5) / LAMINATE_HEATER_N
    const z = LAMINATE_Z_FRONT - t * length
    return { i, z }
  })
  const pressZ = Array.from({ length: LAMINATE_HEATER_N + 1 }, (_, i) => {
    return LAMINATE_Z_FRONT - (i / LAMINATE_HEATER_N) * length
  })

  const showTags = inspect || laminate.status !== 'idle'

  return (
    <group>
      {/* 剖视壳体：保留底板、外侧墙、后墙，朝书槽一侧敞开 */}
      <mesh position={[LAMINATE_X, LAMINATE_Y0 - 0.008, midZ]} material={SHELL}>
        <boxGeometry args={[LAMINATE_W + 0.02, 0.016, length + 0.04]} />
      </mesh>
      <mesh position={[LAMINATE_X - LAMINATE_W / 2, yMid, midZ]} material={SHELL}>
        <boxGeometry args={[wall, LAMINATE_H, length]} />
      </mesh>
      <mesh position={[LAMINATE_X - 0.04, yMid, LAMINATE_Z_REAR]} material={SHELL}>
        <boxGeometry args={[LAMINATE_W - 0.08, LAMINATE_H, wall]} />
      </mesh>
      <mesh position={[LAMINATE_X - LAMINATE_W / 2 + 0.01, LAMINATE_Y0 + LAMINATE_H, midZ]} material={LIP}>
        <boxGeometry args={[0.03, 0.008, length]} />
      </mesh>

      {/* 正面只留入口框，不挡剖视 */}
      <mesh position={[LAMINATE_X, LAMINATE_Y0 + 0.008, LAMINATE_Z_FRONT]} material={LIP}>
        <boxGeometry args={[0.12, 0.016, 0.02]} />
      </mesh>
      <mesh position={[LAMINATE_X, LAMINATE_Y0 + LAMINATE_H - 0.008, LAMINATE_Z_FRONT]} material={LIP}>
        <boxGeometry args={[0.12, 0.016, 0.02]} />
      </mesh>
      <mesh position={[LAMINATE_X - 0.055, yMid, LAMINATE_Z_FRONT]} material={LIP}>
        <boxGeometry args={[0.014, LAMINATE_H, 0.02]} />
      </mesh>
      <mesh position={[LAMINATE_X + 0.055, yMid, LAMINATE_Z_FRONT]} material={LIP}>
        <boxGeometry args={[0.014, LAMINATE_H, 0.02]} />
      </mesh>
      <mesh position={[LAMINATE_X - 0.032, LAMINATE_Y0 + 0.028, midZ]} material={LIP}>
        <boxGeometry args={[0.007, 0.046, length - 0.04]} />
      </mesh>
      <mesh position={[LAMINATE_X + 0.032, LAMINATE_Y0 + 0.028, midZ]} material={LIP}>
        <boxGeometry args={[0.007, 0.046, length - 0.04]} />
      </mesh>

      {/* 履带 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LAMINATE_X, LAMINATE_Y0 + LAMINATE_BELT * 0.4, midZ]}>
        <planeGeometry args={[0.072, length - 0.04]} />
        <meshStandardMaterial
          map={beltTex}
          color="#c5d4b0"
          metalness={0.12}
          roughness={0.58}
          emissive="#3d4a32"
          emissiveIntensity={laminate.status === 'running' ? 0.7 : 0.28}
        />
      </mesh>

      {/* 入口覆膜卷 + 导入薄膜 */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[LAMINATE_X + side * 0.07, yMid + 0.02, LAMINATE_Z_FRONT - 0.02]}>
          <mesh material={FILM_ROLL} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.028, 0.028, 0.09, 22]} />
          </mesh>
          <mesh material={METAL} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.1, 10]} />
          </mesh>
        </group>
      ))}
      <mesh position={[LAMINATE_X, yMid + 0.02, LAMINATE_Z_FRONT - 0.07]} material={FILM_SHEET}>
        <planeGeometry args={[0.048, LAMINATE_H * 0.68]} />
      </mesh>

      {/* 压辊：加热片之间上下成对 */}
      {pressZ.map((z, i) => (
        <group key={`press-${i}`}>
          {([-1, 1] as const).map((side, si) => (
            <mesh
              key={side}
              ref={(node) => {
                if (node) rollerRefs.current[i * 2 + si] = node
              }}
              position={[LAMINATE_X + side * heaterGap, yMid, z]}
              material={METAL}
            >
              <cylinderGeometry args={[0.011, 0.011, LAMINATE_H * 0.72, 14]} />
            </mesh>
          ))}
          <mesh
            ref={(node) => {
              if (node) topRollerRefs.current[i] = node
            }}
            position={[LAMINATE_X, LAMINATE_Y0 + LAMINATE_H - 0.028, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={METAL}
          >
            <cylinderGeometry args={[0.01, 0.01, 0.05, 12]} />
          </mesh>
        </group>
      ))}

      {/* 加热片：陶瓷基板 + 发热条 */}
      {heaters.map(({ i, z }) => (
        <group key={i}>
          {([-1, 1] as const).map((side, si) => (
            <group key={side} position={[LAMINATE_X + side * (heaterGap + 0.01), yMid, z]}>
              <mesh material={heaterMats[i][si]}>
                <boxGeometry args={[0.006, LAMINATE_H * 0.78, length / LAMINATE_HEATER_N - 0.03]} />
              </mesh>
              {[-0.22, 0, 0.22].map((oy) => (
                <mesh key={oy} position={[side * 0.004, LAMINATE_H * oy * 0.28, 0]} material={METAL}>
                  <boxGeometry args={[0.003, 0.008, length / LAMINATE_HEATER_N - 0.04]} />
                </mesh>
              ))}
            </group>
          ))}
          <mesh position={[LAMINATE_X, LAMINATE_Y0 + LAMINATE_H - 0.016, z]} material={topHeaterMats[i]}>
            <boxGeometry args={[0.048, 0.005, length / LAMINATE_HEATER_N - 0.028]} />
          </mesh>
        </group>
      ))}

      <mesh position={[LAMINATE_X, yMid, midZ]}>
        <boxGeometry args={[0.07, LAMINATE_H * 0.78, length * 0.92]} />
        <meshBasicMaterial
          ref={glowRef}
          color="#fb923c"
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <pointLight ref={lightRef} position={[LAMINATE_X, yMid, midZ]} color="#fb923c" intensity={0.4} distance={1.8} />

      <group ref={bookRef} visible={false}>
        {held ? <BookMesh color={held.color} title={held.title} /> : null}
        <group ref={pouchRef} visible={false}>
          <mesh>
            <boxGeometry args={[pouchT, pouchH, pouchDepth]} />
            <meshPhysicalMaterial
              ref={pouchMatRef}
              color="#e8f3ff"
              transparent
              opacity={0.18}
              roughness={0.12}
              metalness={0.05}
              transmission={0.55}
              thickness={0.35}
              ior={1.45}
              clearcoat={1}
              clearcoatRoughness={0.08}
              emissive="#93c5fd"
              emissiveIntensity={0.12}
              depthWrite={false}
            />
          </mesh>
          {/* 封口白边：塑封袋压合痕迹 */}
          <mesh position={[0, pouchH / 2 - 0.003, 0]}>
            <boxGeometry args={[pouchT + 0.001, 0.006, pouchDepth + 0.001]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.45} metalness={0.05} />
          </mesh>
          <mesh position={[0, -(pouchH / 2 - 0.003), 0]}>
            <boxGeometry args={[pouchT + 0.001, 0.006, pouchDepth + 0.001]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.45} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0, pouchDepth / 2 - 0.003]}>
            <boxGeometry args={[pouchT + 0.001, pouchH + 0.001, 0.006]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.45} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0, -(pouchDepth / 2 - 0.003)]}>
            <boxGeometry args={[pouchT + 0.001, pouchH + 0.001, 0.006]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.45} metalness={0.05} />
          </mesh>
          <mesh position={[pouchT / 2 + 0.0004, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[pouchDepth * 0.92, pouchH * 0.9]} />
            <meshBasicMaterial
              ref={shineRef}
              color="#ffffff"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>

      <sprite ref={doneTagRef} visible={false} scale={[0.5, 0.1, 1]}>
        <spriteMaterial map={tags.done} transparent depthWrite={false} />
      </sprite>

      {showTags ? (
        <group>
          <sprite position={[LAMINATE_X + 0.12, yMid + 0.12, heaters[2]?.z ?? midZ]} scale={[0.38, 0.076, 1]}>
            <spriteMaterial map={tags.heat} transparent depthWrite={false} />
          </sprite>
          <sprite position={[LAMINATE_X + 0.14, yMid + 0.16, LAMINATE_Z_FRONT - 0.02]} scale={[0.38, 0.076, 1]}>
            <spriteMaterial map={tags.roll} transparent depthWrite={false} />
          </sprite>
          <sprite position={[LAMINATE_X + 0.13, LAMINATE_Y0 + LAMINATE_H + 0.04, midZ]} scale={[0.34, 0.068, 1]}>
            <spriteMaterial map={tags.press} transparent depthWrite={false} />
          </sprite>
          <sprite position={[LAMINATE_X + 0.1, LAMINATE_Y0 + 0.06, LAMINATE_Z_FRONT - 0.12]} scale={[0.38, 0.076, 1]}>
            <spriteMaterial map={tags.belt} transparent depthWrite={false} />
          </sprite>
        </group>
      ) : null}
    </group>
  )
}
