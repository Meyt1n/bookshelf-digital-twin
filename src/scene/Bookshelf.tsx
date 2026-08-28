import { lazy, Suspense, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { MeshoptGLTFLoader } from './loadGltf'
import { categoryColor } from '../catalog'
import { twinEngine, taskPhaseProgress } from '../twin/engine'
import type { BookInfo, Compartment, ModuleState, MotionTask } from '../types'
import { BookMesh } from './BookMesh'
import {
  BAY_CLAMP_STROKE,
  BAY_X,
  BELT_THICKNESS,
  LAYER_CLEAR,
  MODEL_H,
  MODEL_SCALE,
  MODEL_W,
  SLOT_DEPTH,
  SLOT_MOUTH_LOCAL_Z,
  SLOT_PARK_LOCAL_Z,
  SLOT_W,
  SLOT_Z,
  bookCenterY,
  cellX,
  clamp01,
  easeInOut,
  layerBottomY,
} from './layout'

const Laminator = lazy(() => import('./Laminator').then((m) => ({ default: m.Laminator })))


/** 柜体各部件材质 */
const BODY_MATERIALS: Record<string, THREE.MeshStandardMaterial> = {
  frame: new THREE.MeshStandardMaterial({
    color: '#41529e',
    metalness: 0.68,
    roughness: 0.32,
    emissive: '#2a3a86',
    emissiveIntensity: 0.62,
  }),
  shelf: new THREE.MeshStandardMaterial({
    color: '#54679e',
    metalness: 0.5,
    roughness: 0.42,
    emissive: '#35447e',
    emissiveIntensity: 0.55,
  }),
  belt: new THREE.MeshStandardMaterial({
    color: '#2b6478',
    metalness: 0.45,
    roughness: 0.5,
    emissive: '#1c5468',
    emissiveIntensity: 0.6,
  }),
  screen: new THREE.MeshStandardMaterial({
    color: '#101a3a',
    metalness: 0.2,
    roughness: 0.3,
    emissive: '#4a86ea',
    emissiveIntensity: 1.3,
  }),
  box: new THREE.MeshStandardMaterial({
    color: '#28325e',
    metalness: 0.4,
    roughness: 0.55,
    emissive: '#1b2450',
    emissiveIntensity: 0.5,
  }),
}

/** 未匹配部件的兜底材质 */
const BODY_FALLBACK = BODY_MATERIALS.frame

const CLAMP_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#3d8eaa',
  metalness: 0.48,
  roughness: 0.36,
  emissive: '#1a6d86',
  emissiveIntensity: 0.72,
})

/**
 * 柜座最左侧空腔（模型空间，低于第二层交接底板）。
 * 内部机构会挡住柜后小车，且没有存书用途，从 CAD 里剔除。
 */
const BOTTOM_LEFT_CAVITY = {
  xMin: -0.375,
  xMax: -0.155,
  yMax: 0.428,
}

function makeLabelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 56
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 128, 56)
  ctx.font = '600 28px "Space Grotesk", "Noto Sans SC", sans-serif'
  ctx.fillStyle = 'rgba(165, 180, 255, 0.95)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 30)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeTitleTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 72
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 320, 72)
  const label = text.length > 9 ? `${text.slice(0, 9)}…` : text
  ctx.font = '500 30px "Noto Sans SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = 14
  ctx.fillStyle = 'rgba(235, 240, 255, 0.96)'
  ctx.fillText(label, 160, 36)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 88
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 640, 88)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(140, 166, 255, 0.95)'
  ctx.shadowBlur = 18
  ctx.font = '700 40px "Noto Sans SC", sans-serif'
  ctx.fillStyle = 'rgba(238, 243, 255, 0.98)'
  ctx.fillText('智 慧 书 架', 320, 30)
  ctx.shadowBlur = 10
  ctx.font = '600 22px "Space Grotesk", sans-serif'
  ctx.fillStyle = 'rgba(140, 166, 255, 0.9)'
  ctx.fillText('S H E L F · T W I N', 320, 66)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeBeltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1a3140'
  ctx.fillRect(0, 0, 64, 256)
  for (let i = 0; i < 10; i++) {
    const y = i * 26
    ctx.fillStyle = i % 2 === 0 ? '#2f6f86' : '#24586a'
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(64, y + 10)
    ctx.lineTo(64, y + 20)
    ctx.lineTo(0, y + 10)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(6, 0)
  ctx.lineTo(6, 256)
  ctx.moveTo(58, 0)
  ctx.lineTo(58, 256)
  ctx.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const BELT_DECK = new THREE.MeshStandardMaterial({
  color: '#1d3a48',
  metalness: 0.2,
  roughness: 0.7,
  emissive: '#16323f',
  emissiveIntensity: 0.4,
})
const BELT_ROLLER = new THREE.MeshStandardMaterial({
  color: '#8ea0c8',
  metalness: 0.72,
  roughness: 0.28,
  emissive: '#314168',
  emissiveIntensity: 0.35,
})

/** 格口槽底履带：静止时可见，作业时滚动把书送出/送进 */
function SlotBelt({
  floor,
  running,
  outbound,
}: {
  floor: number
  running: boolean
  outbound: boolean
}) {
  const tex = useMemo(() => makeBeltTexture(), [])
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const rollerRefs = useRef<Array<THREE.Mesh | null>>([null, null])

  useFrame((_, dt) => {
    if (running) {
      tex.offset.y = (tex.offset.y + dt * (outbound ? 1.6 : -1.6)) % 1
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity = running ? 0.95 : 0.38
    }
    rollerRefs.current.forEach((roller) => {
      if (!roller) return
      if (running) roller.rotation.x += dt * (outbound ? 8 : -8)
    })
  })

  const y = layerBottomY(floor) + BELT_THICKNESS / 2
  const beltW = SLOT_W * 0.9
  const beltLen = SLOT_DEPTH * 0.92

  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[beltW, beltLen]} />
        <meshStandardMaterial
          ref={matRef}
          map={tex}
          color="#9fd7e8"
          metalness={0.15}
          roughness={0.55}
          emissive="#1c5468"
          emissiveIntensity={0.38}
        />
      </mesh>
      <mesh position={[0, -BELT_THICKNESS * 0.2, 0]} material={BELT_DECK}>
        <boxGeometry args={[beltW + 0.01, BELT_THICKNESS, beltLen + 0.02]} />
      </mesh>
      {[-beltLen / 2 + 0.03, beltLen / 2 - 0.03].map((z, i) => (
        <mesh
          key={z}
          ref={(node) => {
            rollerRefs.current[i] = node
          }}
          position={[0, 0.006, z]}
          rotation={[0, 0, Math.PI / 2]}
          material={BELT_ROLLER}
        >
          <cylinderGeometry args={[0.016, 0.016, beltW * 0.96, 14]} />
        </mesh>
      ))}
    </group>
  )
}

/** 从柜体履带网格中拆出第二层最左侧一对夹板（蓝色弹簧连接），作业时沿 X 合拢夹书 */
function extractBayClamps(root: THREE.Object3D): { left: THREE.Mesh; right: THREE.Mesh } | null {
  let left: THREE.Mesh | null = null
  let right: THREE.Mesh | null = null
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const name = `${mesh.name} ${mesh.parent?.name ?? ''}`
    if (!name.includes('belt')) return
    const src = mesh.geometry
    const pos = src.attributes.position
    const srcIndex = src.getIndex()
    if (!srcIndex) return
    const keepBody: number[] = []
    const keepLeft: number[] = []
    const keepRight: number[] = []
    const splitX = -0.265
    for (let i = 0; i < srcIndex.count; i += 3) {
      const a = srcIndex.getX(i)
      const b = srcIndex.getX(i + 1)
      const c = srcIndex.getX(i + 2)
      const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3
      const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3
      const inBay = x < -0.12 && x > -0.45 && y > 0.5 && y < 0.72
      if (inBay && x < splitX) keepLeft.push(a, b, c)
      else if (inBay && x >= splitX) keepRight.push(a, b, c)
      else keepBody.push(a, b, c)
    }
    const bodyGeo = src.clone()
    bodyGeo.setIndex(keepBody)
    bodyGeo.computeVertexNormals()
    mesh.geometry = bodyGeo
    const leftGeo = src.clone()
    leftGeo.setIndex(keepLeft)
    leftGeo.computeVertexNormals()
    left = new THREE.Mesh(leftGeo, mesh.material)
    left.name = 'bay-clamp-left'
    const rightGeo = src.clone()
    rightGeo.setIndex(keepRight)
    rightGeo.computeVertexNormals()
    right = new THREE.Mesh(rightGeo, mesh.material)
    right.name = 'bay-clamp-right'
  })
  if (!left || !right) return null
  return { left, right }
}

function dropBottomLeftInterior(x: number, y: number): boolean {
  return x > BOTTOM_LEFT_CAVITY.xMin && x < BOTTOM_LEFT_CAVITY.xMax && y < BOTTOM_LEFT_CAVITY.yMax
}

/** 掏空柜座最左侧隔间内部，保留左右立柱和第二层底板 */
function hollowBottomLeftBay(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const name = `${mesh.name} ${mesh.parent?.name ?? ''}`
    if (!name.includes('frame') && !name.includes('shelf')) return
    const src = mesh.geometry
    const pos = src.attributes.position
    const srcIndex = src.getIndex()
    if (!srcIndex) return
    const keep: number[] = []
    for (let i = 0; i < srcIndex.count; i += 3) {
      const a = srcIndex.getX(i)
      const b = srcIndex.getX(i + 1)
      const c = srcIndex.getX(i + 2)
      const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3
      const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3
      if (dropBottomLeftInterior(x, y)) continue
      keep.push(a, b, c)
    }
    const geo = src.clone()
    geo.setIndex(keep)
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    mesh.geometry = geo
  })
}

function applyInspect(mat: THREE.MeshStandardMaterial, inspect: boolean, dim: number): void {
  mat.transparent = inspect
  mat.opacity = inspect ? dim : 1
  mat.depthWrite = !inspect
}

/** 柜体主体：真实 STEP 模型（智能书柜.STEP → GLB，按部件染色） */
function CabinetBody({ inspect }: { inspect: boolean }) {
  const gltf = useLoader(MeshoptGLTFLoader, '/model/bookcase-body.glb')
  const leftRef = useRef<THREE.Group>(null)
  const rightRef = useRef<THREE.Group>(null)

  const { scene, clamps } = useMemo(() => {
    const scene = gltf.scene.clone(true)
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const key = Object.keys(BODY_MATERIALS).find(
        (k) => mesh.name.includes(k) || (mesh.parent?.name ?? '').includes(k),
      )
      mesh.material = key ? BODY_MATERIALS[key] : BODY_FALLBACK
    })
    const clamps = extractBayClamps(scene)
    if (clamps) {
      clamps.left.material = CLAMP_MATERIAL
      clamps.right.material = CLAMP_MATERIAL
    }
    hollowBottomLeftBay(scene)
    return { scene, clamps }
  }, [gltf])

  useFrame(() => {
    const pose = twinEngine.sampleBay(performance.now())
    const k = THREE.MathUtils.clamp(pose.clamp, 0, 1)
    if (leftRef.current) leftRef.current.position.x = k * BAY_CLAMP_STROKE
    if (rightRef.current) rightRef.current.position.x = -k * BAY_CLAMP_STROKE
    CLAMP_MATERIAL.emissiveIntensity = 0.55 + k * 0.55 + Math.abs(pose.belt) * 0.35
    applyInspect(BODY_MATERIALS.frame, inspect, 0.22)
    applyInspect(BODY_MATERIALS.shelf, inspect, 0.28)
    applyInspect(BODY_MATERIALS.belt, inspect, 0.42)
    applyInspect(BODY_MATERIALS.screen, inspect, 0.55)
    applyInspect(BODY_MATERIALS.box, inspect, 0.3)
    applyInspect(CLAMP_MATERIAL, inspect, 0.7)
    applyInspect(BODY_FALLBACK, inspect, 0.22)
  })

  return (
    <group scale={MODEL_SCALE}>
      <primitive object={scene} />
      {clamps ? (
        <>
          <group ref={leftRef}>
            <primitive object={clamps.left} />
          </group>
          <group ref={rightRef}>
            <primitive object={clamps.right} />
          </group>
        </>
      ) : null}
    </group>
  )
}

/** 顶部发光铭牌 */
function ShelfSign() {
  const tex = useMemo(() => makeSignTexture(), [])
  const barRef = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    if (barRef.current) {
      barRef.current.opacity = 0.6 + 0.25 * Math.sin(performance.now() / 640)
    }
  })
  return (
    <group position={[0, MODEL_H + 0.34, 0]}>
      <sprite scale={[2.1, 0.29, 1]} position={[0, 0.1, 0]}>
        <spriteMaterial map={tex} transparent opacity={0.95} depthWrite={false} />
      </sprite>
      <mesh position={[0, -0.14, 0]}>
        <boxGeometry args={[MODEL_W * 0.9, 0.012, 0.012]} />
        <meshBasicMaterial ref={barRef} color="#8ca6ff" transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

type SlotProps = {
  comp: Compartment
  book: BookInfo | null
  selected: boolean
  hovered: boolean
  task: MotionTask | null
}

/** 书槽交互层：占用书本 + 状态光效 + 点击热区（立式：上下两层） */
function BookSlot({ comp, book, selected, hovered, task }: SlotProps) {
  const x = cellX(comp.cell)
  const bottomY = layerBottomY(comp.floor)
  const slotH = LAYER_CLEAR * 0.82
  const centerY = bottomY + slotH / 2
  const isTaskTarget = task !== null && task.cid === comp.cid && task.phase !== 'done'

  const glowRef = useRef<THREE.MeshBasicMaterial>(null)
  const rimRef = useRef<THREE.LineBasicMaterial>(null)
  const bookGroupRef = useRef<THREE.Group>(null)
  const labelTex = useMemo(() => makeLabelTexture(`${comp.floor}-${comp.cell}`), [comp.floor, comp.cell])
  const titleTex = useMemo(
    () => (book ? makeTitleTexture(book.title, categoryColor(book.category)) : null),
    [book],
  )

  const rimGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(SLOT_W + 0.02, slotH, SLOT_DEPTH + 0.04)),
    [slotH],
  )

  useFrame(() => {
    const now = performance.now()
    const pulse = 0.5 + 0.5 * Math.sin(now / 260)
    if (glowRef.current) {
      let opacity = comp.status === 'occupied' ? 0.14 : 0.04
      let color = comp.status === 'occupied' ? '#7c8cf8' : '#232a4d'
      if (isTaskTarget) {
        opacity = 0.24 + pulse * 0.26
        color = task!.action === 'store' ? '#34d399' : '#fbbf24'
      } else if (selected) {
        opacity = 0.2 + pulse * 0.18
        color = '#22d3ee'
      } else if (hovered) {
        opacity = 0.18
        color = '#8ca6ff'
      }
      glowRef.current.opacity = opacity
      glowRef.current.color.set(color)
    }
    if (rimRef.current) {
      if (isTaskTarget) {
        rimRef.current.opacity = 0.7 + pulse * 0.3
        rimRef.current.color.set(task!.action === 'store' ? '#6ee7b7' : '#fcd34d')
      } else if (selected) {
        rimRef.current.opacity = 0.55 + pulse * 0.4
        rimRef.current.color.set('#7ae7f7')
      } else if (hovered) {
        rimRef.current.opacity = 0.6
        rimRef.current.color.set('#a5b4ff')
      } else {
        rimRef.current.opacity = comp.status === 'occupied' ? 0.26 : 0.12
        rimRef.current.color.set('#4c5c9e')
      }
    }

    if (bookGroupRef.current) {
      const parkedZ = SLOT_PARK_LOCAL_Z
      const mouthZ = SLOT_MOUTH_LOCAL_Z
      let visible = comp.status === 'occupied'
      let beltZ = parkedZ
      if (task && task.cid === comp.cid && task.phase !== 'done' && task.phase !== 'fault') {
        const p = taskPhaseProgress(task, now)
        const carrier = twinEngine.sampleBookCarrier(now)
        visible = carrier === 'slot'
        if (task.action === 'take') {
          if (task.phase === 'operate') {
            beltZ = parkedZ + easeInOut(clamp01(p / 0.34)) * (mouthZ - parkedZ)
          } else if (task.phase === 'dispatch' || task.phase === 'ack' || task.phase === 'lift' || task.phase === 'traverse') {
            beltZ = parkedZ
          }
        } else if (task.action === 'store') {
          if (task.phase === 'operate') {
            const slide = easeInOut(clamp01((p - 0.58) / 0.36))
            beltZ = mouthZ - slide * (mouthZ - parkedZ)
          } else if (task.phase === 'retract' || task.phase === 'return') {
            beltZ = parkedZ
          }
        }
      }
      if (book && twinEngine.sampleLaminate(now).bookId === book.id) visible = false
      bookGroupRef.current.visible = visible && book !== null
      bookGroupRef.current.position.z = beltZ
    }
  })

  const bookColor = book ? categoryColor(book.category) : '#8b93b8'
  const bookY = bookCenterY(comp.floor)
  const frontZ = SLOT_Z + SLOT_DEPTH / 2 + 0.08
  const beltRunning = isTaskTarget && task?.phase === 'operate'
  const beltOutbound = task?.action === 'take'

  return (
    <group position={[x, 0, SLOT_Z]}>
      <SlotBelt floor={comp.floor} running={!!beltRunning} outbound={!!beltOutbound} />
      {/* 槽位辉光体 */}
      <mesh position={[0, centerY, 0]}>
        <boxGeometry args={[SLOT_W - 0.015, slotH - 0.03, SLOT_DEPTH - 0.03]} />
        <meshBasicMaterial ref={glowRef} transparent opacity={0.06} color="#232a4d" blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* 槽位描边 */}
      <lineSegments geometry={rimGeo} position={[0, centerY, 0]}>
        <lineBasicMaterial ref={rimRef} transparent opacity={0.12} color="#4c5c9e" />
      </lineSegments>

      {/* 点击热区 */}
      <mesh
        position={[0, centerY, 0]}
        onClick={(e) => {
          e.stopPropagation()
          twinEngine.setSelected(comp.cid)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
          twinEngine.setHovered(comp.cid)
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default'
          twinEngine.setHovered(null)
        }}
      >
        <boxGeometry args={[SLOT_W + 0.02, slotH + 0.06, SLOT_DEPTH + 0.06]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 槽位编号（柜体正面悬浮） */}
      <sprite scale={[0.24, 0.11, 1]} position={[0, bottomY + slotH + 0.06, frontZ - SLOT_Z]}>
        <spriteMaterial map={labelTex} transparent opacity={0.8} depthWrite={false} />
      </sprite>

      {/* 在架图书（立插在履带上，作业时沿 Z 进出） */}
      {book && (
        <group ref={bookGroupRef} position={[0, bookY, SLOT_PARK_LOCAL_Z]} visible={comp.status === 'occupied'}>
          <BookMesh color={bookColor} title={book.title} />
          {titleTex && (
            <sprite scale={[0.56, 0.126, 1]} position={[0, 0.02, frontZ - SLOT_Z]}>
              <spriteMaterial map={titleTex} transparent opacity={0.88} depthWrite={false} />
            </sprite>
          )}
        </group>
      )}
    </group>
  )
}

function UvEffect({ uv }: { uv: ModuleState }) {
  const sweepRefs = useRef<Array<THREE.Mesh | null>>([null, null])
  const lightRef = useRef<THREE.PointLight>(null)
  const slotZoneCenterX = (cellX(1) + cellX(4)) / 2
  const slotZoneW = cellX(4) - cellX(1) + SLOT_W * 3

  useFrame(() => {
    const running = uv.status === 'running'
    const now = performance.now()
    const progress = running ? clamp01((now - uv.startedAt) / uv.duration) : 0
    const pulse = 0.5 + 0.5 * Math.sin(now / 140)

    sweepRefs.current.forEach((sweep) => {
      if (!sweep) return
      sweep.visible = running
      if (running) {
        const leg = (progress * 2) % 1
        const dir = progress < 0.5 ? 1 : -1
        const from = dir === 1 ? -slotZoneW / 2 : slotZoneW / 2
        sweep.position.x = slotZoneCenterX + from + dir * leg * slotZoneW
      }
    })
    if (lightRef.current) {
      lightRef.current.intensity = running ? 15 + pulse * 11 : 0
    }
  })

  return (
    <group>
      {[1, 2].map((floor, i) => {
        const lampY = layerBottomY(floor) + LAYER_CLEAR - 0.06
        return (
          <group key={floor}>
            {/* 层顶灯管（正面前沿） */}
            <mesh position={[slotZoneCenterX, lampY, SLOT_Z + SLOT_DEPTH / 2 - 0.06]}>
              <boxGeometry args={[slotZoneW, 0.024, 0.024]} />
              <meshStandardMaterial color="#241b3f" emissive="#a78bfa" emissiveIntensity={uv.status === 'running' ? 2.4 : 0.14} />
            </mesh>
            {/* 扫描面（沿 X 扫过整层） */}
            <mesh
              ref={(m) => {
                sweepRefs.current[i] = m
              }}
              visible={false}
              position={[slotZoneCenterX, layerBottomY(floor) + LAYER_CLEAR / 2, SLOT_Z]}
            >
              <planeGeometry args={[0.1, LAYER_CLEAR - 0.06]} />
              <meshBasicMaterial color="#c4b5fd" transparent opacity={0.4} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
      <pointLight ref={lightRef} position={[slotZoneCenterX, layerBottomY(1), SLOT_Z + 0.3]} color="#a78bfa" intensity={0} distance={5} />
    </group>
  )
}

function makeHint(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(8, 12, 32, 0.8)'
  ctx.fillRect(8, 8, 304, 48)
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.65)'
  ctx.lineWidth = 2
  ctx.strokeRect(8, 8, 304, 48)
  ctx.fillStyle = '#e0f2fe'
  ctx.font = '600 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 160, 34)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function CabinetHints() {
  const labels = useMemo(
    () => ({
      clamp: makeHint('弹簧夹板'),
      belt: makeHint('隔间履带'),
      screw: makeHint('横移丝杆'),
      rail: makeHint('升降导轨'),
    }),
    [],
  )
  return (
    <group>
      <sprite position={[BAY_X - 0.28, layerBottomY(2) + 0.28, SLOT_Z]} scale={[0.42, 0.084, 1]}>
        <spriteMaterial map={labels.clamp} transparent depthWrite={false} />
      </sprite>
      <sprite position={[BAY_X, layerBottomY(2) + 0.04, SLOT_Z + 0.12]} scale={[0.42, 0.084, 1]}>
        <spriteMaterial map={labels.belt} transparent depthWrite={false} />
      </sprite>
      <sprite position={[0.08, 1.62, 0.72]} scale={[0.42, 0.084, 1]}>
        <spriteMaterial map={labels.screw} transparent depthWrite={false} />
      </sprite>
      <sprite position={[-MODEL_W / 2 + 0.06, 1.35, 0.32]} scale={[0.42, 0.084, 1]}>
        <spriteMaterial map={labels.rail} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

type BookshelfProps = {
  compartments: Compartment[]
  booksById: Record<number, BookInfo>
  selectedCid: number | null
  hoveredCid: number | null
  task: MotionTask | null
  uv: ModuleState
  laminate: ModuleState
  inspect?: boolean
}

export function Bookshelf({
  compartments,
  booksById,
  selectedCid,
  hoveredCid,
  task,
  uv,
  laminate,
  inspect = false,
}: BookshelfProps) {
  return (
    <group>
      <CabinetBody inspect={inspect} />
      {inspect ? <CabinetHints /> : null}

      {/* 书槽交互层 */}
      {compartments.map((comp) => (
        <BookSlot
          key={comp.cid}
          comp={comp}
          book={
            comp.bookId !== null
              ? (booksById[comp.bookId] ?? null)
              : task?.cid === comp.cid && task.action === 'store'
                ? (booksById[task.bookId] ?? null)
                : null
          }
          selected={selectedCid === comp.cid}
          hovered={hoveredCid === comp.cid}
          task={task}
        />
      ))}

      <ShelfSign />
      <UvEffect uv={uv} />
      <Suspense fallback={null}>
        <Laminator laminate={laminate} inspect={inspect} />
      </Suspense>
    </group>
  )
}
