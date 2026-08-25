import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { categoryColor } from '../catalog'
import { twinEngine } from '../twin/engine'
import { BookMesh } from './BookMesh'
import {
  BAY_PARK_Z,
  BAY_W,
  BAY_X,
  BELT_THICKNESS,
  HOME_FLOOR,
  SLOT_DEPTH,
  SLOT_Z,
  bookCenterY,
  layerBottomY,
} from './layout'

function makeBayBeltTexture(): THREE.CanvasTexture {
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
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const DECK = new THREE.MeshStandardMaterial({
  color: '#1d3a48',
  metalness: 0.2,
  roughness: 0.7,
})

/** 第二层最左侧大隔间：书到位后 CAD 夹板合拢，底部履带把书送到夹爪 */
export function TransferBay() {
  const tex = useMemo(() => makeBayBeltTexture(), [])
  const bookRef = useRef<THREE.Group>(null)
  const beltMat = useRef<THREE.MeshStandardMaterial>(null)
  const lastBookId = useRef<number | null>(null)
  const [book, setBook] = useState<{ title: string; color: string } | null>(null)

  const bookY = bookCenterY(HOME_FLOOR)
  const bottomY = layerBottomY(HOME_FLOOR)
  const beltLen = SLOT_DEPTH * 0.9

  useFrame((_, dt) => {
    const pose = twinEngine.sampleBay(performance.now())
    const snapshot = twinEngine.getSnapshot()
    if (bookRef.current) {
      bookRef.current.visible = pose.bookVisible
      bookRef.current.position.z = pose.bookLocalZ
    }
    if (pose.bookVisible && pose.bookId !== null && pose.bookId !== lastBookId.current) {
      lastBookId.current = pose.bookId
      const info = snapshot.booksById[pose.bookId]
      setBook({ title: info?.title ?? '', color: categoryColor(info?.category) })
    }
    if (!pose.bookVisible) lastBookId.current = null

    if (pose.belt !== 0) tex.offset.y = (tex.offset.y + dt * pose.belt * 1.4) % 1
    if (beltMat.current) {
      beltMat.current.emissiveIntensity = pose.scanFlash > 0 ? 0.4 + pose.scanFlash * 1.6 : pose.belt !== 0 ? 0.95 : 0.38
    }
  })

  return (
    <group position={[BAY_X, 0, SLOT_Z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, bottomY + BELT_THICKNESS / 2, 0]}>
        <planeGeometry args={[BAY_W * 0.55, beltLen]} />
        <meshStandardMaterial
          ref={beltMat}
          map={tex}
          color="#9fd7e8"
          metalness={0.15}
          roughness={0.55}
          emissive="#1c5468"
          emissiveIntensity={0.38}
        />
      </mesh>
      <mesh position={[0, bottomY + 0.004, 0]} material={DECK}>
        <boxGeometry args={[BAY_W * 0.58, BELT_THICKNESS, beltLen + 0.02]} />
      </mesh>

      <group ref={bookRef} position={[0, bookY, BAY_PARK_Z]} visible={false}>
        {book ? <BookMesh color={book.color} title={book.title} /> : null}
      </group>
    </group>
  )
}
