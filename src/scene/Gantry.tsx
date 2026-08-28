import { useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { categoryColor } from '../catalog'
import { twinEngine } from '../twin/engine'
import { BookMesh } from './BookMesh'
import {
  GANTRY_BOOK_Z,
  GANTRY_GRIP_CLOSE,
  GANTRY_HOME,
  HEAD_REST,
  MODEL_SCALE,
  gantryHoldBookY,
} from './layout'

/** 去掉丝杆中间那块不随夹爪横移的置物方板，只留两侧滑座 */
function stripLeadScrewPlate(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.geometry
    const pos = src.attributes.position
    const srcIndex = src.getIndex()
    if (!srcIndex) return
    const isPlate = (i: number) => {
      const x = pos.getX(i)
      return x > -0.14 && x < 0.08
    }
    const keep: number[] = []
    for (let i = 0; i < srcIndex.count; i += 3) {
      const a = srcIndex.getX(i)
      const b = srcIndex.getX(i + 1)
      const c = srcIndex.getX(i + 2)
      if (isPlate(a) && isPlate(b) && isPlate(c)) continue
      keep.push(a, b, c)
    }
    const geo = src.clone()
    geo.setIndex(keep)
    geo.computeVertexNormals()
    mesh.geometry = geo
  })
}

type Spring = { p: number; v: number }

/** 无回弹跟随：指数平滑，到位后锁死，避免夹爪来回晃 */
function follow(s: Spring, target: number, dt: number, rate: number): void {
  const err = target - s.p
  if (Math.abs(err) < 0.0006 && Math.abs(s.v) < 0.008) {
    s.p = target
    s.v = 0
    return
  }
  const k = 1 - Math.exp(-rate * dt)
  s.p += err * k
  s.v = (1 - k) * s.v
}

/** 只补左右滑座之间的空档，不要伸进 CAD 滑座里的原有丝杆残段 */
const SCREW = { x: 0.04, y: 0.801, z: 0.357, r: 0.007, length: 0.74, pitch: 0.008 }
const GUIDE = { x: 0.04, y: 0.756, z: 0.349, r: 0.0056, length: 0.74 }

function makeThreadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, '#8e98a8')
  g.addColorStop(0.45, '#e8edf4')
  g.addColorStop(1, '#6f7888')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 256)
  ctx.strokeStyle = 'rgba(28, 34, 46, 0.55)'
  ctx.lineWidth = 4
  for (let y = -40; y < 300; y += 11) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(64, y + 16)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, Math.round(SCREW.length / SCREW.pitch))
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const BEAM_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#3a4890',
  metalness: 0.78,
  roughness: 0.28,
  emissive: '#26348a',
  emissiveIntensity: 0.28,
})

const CROSSBEAM_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#343f7a',
  metalness: 0.7,
  roughness: 0.34,
  emissive: '#1c2758',
  emissiveIntensity: 0.22,
})

const GUIDE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#b7c0cc',
  metalness: 0.96,
  roughness: 0.1,
  emissive: '#2a3344',
  emissiveIntensity: 0.08,
})

const HEAD_CORE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#2b5e74',
  metalness: 0.62,
  roughness: 0.32,
  emissive: '#1e9ab8',
  emissiveIntensity: 0.42,
})

const GRIPPER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#e65c2a',
  metalness: 0.42,
  roughness: 0.34,
  emissive: '#c2410c',
  emissiveIntensity: 0.55,
})

const TRAIL_LEN = 42

/** 真实机械零件龙门（立式）：横梁组沿竖直导轨升降（Y）+ 抓取头沿丝杆左右横移（X），不前后移动 */
export function Gantry() {
  const beamGltf = useLoader(GLTFLoader, '/model/bookcase-beam.glb')
  const headGltf = useLoader(GLTFLoader, '/model/bookcase-head.glb')

  const beamScene = useMemo(() => {
    const scene = beamGltf.scene.clone(true)
    stripLeadScrewPlate(scene)
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) mesh.material = BEAM_MATERIAL
    })
    return scene
  }, [beamGltf])

  const gripperRefs = useRef<{ left: THREE.Group | null; right: THREE.Group | null }>({
    left: null,
    right: null,
  })
  const gripperRestX = useRef({ left: 0, right: 0 })

  /**
   * 实机抓取头是电推杆+连杆的自适应夹具：两爪绕前端铰点摆动，
   * 后方喇叭口从宽到窄合拢。给两爪各包一个前端铰点组来复现。
   */
  const headScene = useMemo(() => {
    gripperRefs.current = { left: null, right: null }
    const claws: Array<{ mesh: THREE.Mesh; side: 'left' | 'right' }> = []
    headGltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const name = `${mesh.name} ${mesh.parent?.name ?? ''}`
      if (name.includes('gripper-left')) {
        mesh.material = GRIPPER_MATERIAL
        claws.push({ mesh, side: 'left' })
      } else if (name.includes('gripper-right')) {
        mesh.material = GRIPPER_MATERIAL
        claws.push({ mesh, side: 'right' })
      } else {
        mesh.material = HEAD_CORE_MATERIAL
      }
    })
    for (const { mesh, side } of claws) {
      let pivot: THREE.Group
      if (mesh.parent?.name === 'claw-pivot') {
        pivot = mesh.parent as THREE.Group
      } else {
        mesh.geometry.computeBoundingBox()
        const bb = mesh.geometry.boundingBox!
        pivot = new THREE.Group()
        pivot.name = 'claw-pivot'
        // 铰点在爪根（头部深处），爪尖朝柜体摆动：书先停爪尖，尖端合拢再送入
        pivot.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.max.z - 0.006)
        mesh.parent!.add(pivot)
        pivot.add(mesh)
        mesh.position.set(-pivot.position.x, -pivot.position.y, -pivot.position.z)
      }
      gripperRefs.current[side] = pivot
      gripperRestX.current[side] = pivot.position.x
    }
    return headGltf.scene
  }, [headGltf])

  const beamRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const bookRef = useRef<THREE.Group>(null)
  const beaconRef = useRef<THREE.MeshStandardMaterial>(null)
  const workLightRef = useRef<THREE.PointLight>(null)
  const lastBookId = useRef<number | null>(null)
  const wasCarrying = useRef(false)
  const [heldBook, setHeldBook] = useState<{ title: string; color: string } | null>(null)

  const springX = useRef<Spring>({ p: GANTRY_HOME.x, v: 0 })
  const springY = useRef<Spring>({ p: GANTRY_HOME.y, v: 0 })
  const springZ = useRef<Spring>({ p: HEAD_REST.z, v: 0 })
  const springOpen = useRef<Spring>({ p: 0, v: 0 })
  const springSwing = useRef<Spring>({ p: 0.035, v: 0 })
  const springShift = useRef<Spring>({ p: 0, v: 0 })
  const lastTime = useRef(performance.now())
  const threadTex = useMemo(() => makeThreadTexture(), [])

  // 运动轨迹：光带 + 渐隐光点
  const trail = useMemo(() => {
    const positions = new Float32Array(TRAIL_LEN * 3)
    const colors = new Float32Array(TRAIL_LEN * 3)
    const base = new THREE.Color('#7ae7f7')
    for (let i = 0; i < TRAIL_LEN; i++) {
      const k = 1 - i / (TRAIL_LEN - 1)
      colors[i * 3] = base.r * k * k
      colors[i * 3 + 1] = base.g * k * k
      colors[i * 3 + 2] = base.b * k * k
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const line = new THREE.Line(geometry, lineMat)
    line.frustumCulled = false
    const pointsMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.045,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    const dots = new THREE.Points(geometry, pointsMat)
    dots.frustumCulled = false
    const points: THREE.Vector3[] = Array.from(
      { length: TRAIL_LEN },
          () => new THREE.Vector3(GANTRY_HOME.x, GANTRY_HOME.y, HEAD_REST.z),
    )
    return { line, dots, geometry, points }
  }, [])

  useFrame(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - lastTime.current) / 1000)
    lastTime.current = now

    const pose = twinEngine.sampleGantry(now)
    const snapshot = twinEngine.getSnapshot()
    const task = snapshot.task

    // 夹爪只沿丝杆横移、随梁升降；到位锁死，不回弹晃动
    follow(springX.current, pose.x, dt, 11)
    follow(springY.current, pose.y, dt, 9)
    follow(springZ.current, HEAD_REST.z, dt, 14)

    // 夹爪始终在丝杆上。CAD 闭合位已经贴住书厚，开合只在 rest X 上加减，不要把爪心当成原点。
    if (pose.carrying && !wasCarrying.current) {
      springShift.current = { p: pose.bookShiftZ, v: 0 }
    }
    wasCarrying.current = pose.carrying
    follow(springShift.current, pose.bookShiftZ, dt, 16)

    // 摆角与收拢由引擎按阶段给出：爪尖合拢为负角，持书位平行压紧
    follow(springSwing.current, pose.swing, dt, 7)
    const openTarget = pose.squeeze ? -GANTRY_GRIP_CLOSE : 0
    follow(springOpen.current, openTarget, dt, 9)

    const dx = springX.current.p - HEAD_REST.x
    const dy = springY.current.p - HEAD_REST.y
    const dz = springZ.current.p - HEAD_REST.z

    if (beamRef.current) beamRef.current.position.y = dy
    if (headRef.current) headRef.current.position.set(dx, dy, dz)

    if (gripperRefs.current.left) {
      gripperRefs.current.left.position.x = gripperRestX.current.left - springOpen.current.p
      gripperRefs.current.left.rotation.y = springSwing.current.p
    }
    if (gripperRefs.current.right) {
      gripperRefs.current.right.position.x = gripperRestX.current.right + springOpen.current.p
      gripperRefs.current.right.rotation.y = -springSwing.current.p
    }

    // 轨迹光带：移动时记录，静止时收敛消散
    const speed = Math.abs(springX.current.v) + Math.abs(springY.current.v)
    const headPos = new THREE.Vector3(springX.current.p, springY.current.p, springZ.current.p)
    if (speed > 0.04) {
      trail.points.pop()
      trail.points.unshift(headPos)
    } else {
      for (let i = trail.points.length - 1; i > 0; i--) {
        trail.points[i].lerp(trail.points[i - 1], 0.25)
      }
      trail.points[0] = headPos
    }
    const attr = trail.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < TRAIL_LEN; i++) {
      const p = trail.points[i]
      attr.setXYZ(i, p.x, p.y, p.z)
    }
    attr.needsUpdate = true

    // 夹取的书
    if (bookRef.current) {
      bookRef.current.visible = pose.carrying
      bookRef.current.position.z = HEAD_REST.z + GANTRY_BOOK_Z + springShift.current.p
      if (pose.carrying && pose.carryBookId !== null && pose.carryBookId !== lastBookId.current) {
        lastBookId.current = pose.carryBookId
        const book = snapshot.booksById[pose.carryBookId]
        setHeldBook({ title: book?.title ?? '', color: categoryColor(book?.category) })
      }
      if (!pose.carrying) lastBookId.current = null
    }

    const pulse = 0.5 + 0.5 * Math.sin(now / 170)

    if (workLightRef.current) {
      const busy = Boolean(task && ['deliver', 'handoff', 'traverse', 'operate'].includes(task.phase))
      workLightRef.current.intensity = busy ? 4.5 + pulse * 3 : 0
    }

    // 状态灯
    if (beaconRef.current) {
      if (task && task.phase === 'fault') {
        beaconRef.current.emissive.set('#fb7185')
        beaconRef.current.emissiveIntensity = 1.2 + pulse * 1.6
      } else if (task && task.phase === 'operate') {
        beaconRef.current.emissive.set('#fbbf24')
        beaconRef.current.emissiveIntensity = 1 + pulse * 1.4
      } else if (pose.moving || task) {
        beaconRef.current.emissive.set('#7ae7f7')
        beaconRef.current.emissiveIntensity = 1 + pulse * 1.2
      } else {
        beaconRef.current.emissive.set('#34d399')
        beaconRef.current.emissiveIntensity = 0.7 + pulse * 0.3
      }
    }
  })

  return (
    <group>
      {/* 悬梁臂横梁组（真实零件，沿竖直导轨升降） */}
      <group ref={beamRef}>
        <primitive object={beamScene} scale={MODEL_SCALE} />
        <group scale={MODEL_SCALE}>
          {/* 补中间横梁，只填滑座之间的空档 */}
          <mesh position={[0.04, 0.808, 0.158]} material={CROSSBEAM_MATERIAL}>
            <boxGeometry args={[0.72, 0.026, 0.072]} />
          </mesh>
          {/* 丝杆：仅中间空档，不与两端 CAD 残段重叠，也不旋转 */}
          <mesh position={[SCREW.x, SCREW.y, SCREW.z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[SCREW.r, SCREW.r, SCREW.length, 20]} />
            <meshStandardMaterial
              map={threadTex}
              color="#d5dce6"
              metalness={0.9}
              roughness={0.24}
              emissive="#3a4458"
              emissiveIntensity={0.1}
            />
          </mesh>
          <mesh position={[GUIDE.x, GUIDE.y, GUIDE.z]} rotation={[0, 0, Math.PI / 2]} material={GUIDE_MATERIAL}>
            <cylinderGeometry args={[GUIDE.r, GUIDE.r, GUIDE.length, 16]} />
          </mesh>
        </group>
      </group>

      {/* 抓取头总成（真实柔性夹爪：沿丝杆左右横移 + 开合，不前后移动） */}
      <group ref={headRef}>
        <primitive object={headScene} scale={MODEL_SCALE} />
        {/* 状态灯 */}
        <mesh position={[HEAD_REST.x, HEAD_REST.y + 0.048, HEAD_REST.z + 0.012]}>
          <sphereGeometry args={[0.016, 16, 16]} />
          <meshStandardMaterial ref={beaconRef} color="#0e1226" emissive="#34d399" emissiveIntensity={0.8} />
        </mesh>
        {/* 夹取中的书：卡在两爪之间，沿内履带平移 */}
        <group
          ref={bookRef}
          position={[HEAD_REST.x, gantryHoldBookY(), HEAD_REST.z + GANTRY_BOOK_Z]}
          visible={false}
        >
          {heldBook ? <BookMesh color={heldBook.color} title={heldBook.title} /> : null}
        </group>
        {/* 作业照明 */}
        <pointLight ref={workLightRef} position={[HEAD_REST.x, HEAD_REST.y - 0.15, HEAD_REST.z - 0.3]} color="#7ae7f7" intensity={0} distance={2.6} />
      </group>

      {/* 运动轨迹光带 + 光点 */}
      <primitive object={trail.line} />
      <primitive object={trail.dots} />
    </group>
  )
}
