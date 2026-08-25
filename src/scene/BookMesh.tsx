import { useMemo } from 'react'
import * as THREE from 'three'
import { BOOK_DEPTH, BOOK_HEIGHT, BOOK_THICK } from './layout'

function makeSpineTexture(title: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 768
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 96, 0)
  g.addColorStop(0, shade(color, 0.72))
  g.addColorStop(0.45, color)
  g.addColorStop(1, shade(color, 0.55))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 96, 768)
  ctx.fillStyle = 'rgba(255,248,235,0.18)'
  ctx.fillRect(8, 0, 2, 768)
  ctx.fillRect(86, 0, 2, 768)
  ctx.save()
  ctx.translate(48, 384)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = 'rgba(255,252,245,0.96)'
  ctx.font = '700 36px "Noto Sans SC", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = title.length > 10 ? `${title.slice(0, 10)}…` : title
  ctx.fillText(label, 0, 0)
  ctx.restore()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function makeCoverTexture(title: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 1024
  const ctx = canvas.getContext('2d')!
  const bg = ctx.createLinearGradient(0, 0, 0, 1024)
  bg.addColorStop(0, shade(color, 1.12))
  bg.addColorStop(0.55, color)
  bg.addColorStop(1, shade(color, 0.62))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 384, 1024)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(28, 28, 328, 968)
  ctx.strokeStyle = 'rgba(255,248,235,0.28)'
  ctx.lineWidth = 3
  ctx.strokeRect(40, 48, 304, 928)
  ctx.fillStyle = 'rgba(255,252,245,0.96)'
  ctx.font = '700 44px "Noto Sans SC", serif'
  ctx.textAlign = 'center'
  wrapTitle(ctx, title, 192, 280, 260, 56)
  ctx.fillStyle = 'rgba(255,248,235,0.45)'
  ctx.fillRect(120, 520, 144, 3)
  ctx.font = '500 22px "Noto Sans SC", sans-serif'
  ctx.fillStyle = 'rgba(255,248,235,0.7)'
  ctx.fillText('SMART SHELF', 192, 860)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function wrapTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): void {
  const chars = [...title]
  const lines: string[] = []
  let line = ''
  for (const ch of chars) {
    const next = line + ch
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line)
      line = ch
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  const shown = lines.slice(0, 4)
  shown.forEach((text, i) => ctx.fillText(text, x, y + i * lineH))
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex)
  c.r = Math.min(1, Math.max(0, c.r * k))
  c.g = Math.min(1, Math.max(0, c.g * k))
  c.b = Math.min(1, Math.max(0, c.b * k))
  return `#${c.getHexString()}`
}

type BookMeshProps = {
  color: string
  title?: string
}

/** 立插精装书：封面夹持面朝 ±X，书脊朝柜门 +Z，厚度与夹爪闭合间距一致 */
export function BookMesh({ color, title }: BookMeshProps) {
  const spineTex = useMemo(
    () => (title ? makeSpineTexture(title, color) : null),
    [title, color],
  )
  const coverTex = useMemo(
    () => (title ? makeCoverTexture(title, color) : null),
    [title, color],
  )
  const coverDark = shade(color, 0.68)
  const hx = BOOK_THICK / 2
  const coverT = Math.max(0.0011, BOOK_THICK * 0.11)
  const pagesW = Math.max(0.004, BOOK_THICK - coverT * 2)

  return (
    <group>
      {/* 纸页块：填满两封面之间，避免夹爪看起来夹空 */}
      <mesh>
        <boxGeometry args={[pagesW, BOOK_HEIGHT * 0.972, BOOK_DEPTH * 0.965]} />
        <meshStandardMaterial color="#f3ead6" roughness={0.96} metalness={0.01} />
      </mesh>
      {/* 切口页边 */}
      {[-0.32, 0, 0.32].map((oy) => (
        <mesh key={oy} position={[0, BOOK_HEIGHT * oy, -BOOK_DEPTH * 0.486]}>
          <boxGeometry args={[pagesW * 0.92, BOOK_HEIGHT * 0.018, 0.0012]} />
          <meshStandardMaterial color="#fff8ee" roughness={1} />
        </mesh>
      ))}
      {/* 前封面（+X，夹爪右爪贴住） */}
      <mesh position={[hx - coverT / 2, 0, 0]}>
        <boxGeometry args={[coverT, BOOK_HEIGHT, BOOK_DEPTH]} />
        <meshStandardMaterial
          color={color}
          roughness={0.34}
          metalness={0.08}
          emissive={color}
          emissiveIntensity={0.12}
        />
      </mesh>
      {coverTex && (
        <mesh position={[hx + 0.0002, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[BOOK_DEPTH * 0.92, BOOK_HEIGHT * 0.9]} />
          <meshBasicMaterial map={coverTex} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={1} />
        </mesh>
      )}
      {/* 后封面（-X，夹爪左爪贴住） */}
      <mesh position={[-(hx - coverT / 2), 0, 0]}>
        <boxGeometry args={[coverT, BOOK_HEIGHT, BOOK_DEPTH]} />
        <meshStandardMaterial color={coverDark} roughness={0.4} metalness={0.06} />
      </mesh>
      {/* 书脊 */}
      <mesh position={[0, 0, BOOK_DEPTH / 2 - 0.002]}>
        <boxGeometry args={[BOOK_THICK, BOOK_HEIGHT, 0.004]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.1}
          emissive={color}
          emissiveIntensity={0.16}
        />
      </mesh>
      {spineTex && (
        <mesh position={[0, 0, BOOK_DEPTH / 2 + 0.0002]}>
          <planeGeometry args={[BOOK_THICK * 0.92, BOOK_HEIGHT * 0.82]} />
          <meshBasicMaterial map={spineTex} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={1} />
        </mesh>
      )}
      {/* 天头切口 */}
      <mesh position={[0, BOOK_HEIGHT / 2 - 0.001, 0]}>
        <boxGeometry args={[pagesW * 0.9, 0.002, BOOK_DEPTH * 0.9]} />
        <meshStandardMaterial color="#fffaf2" roughness={1} />
      </mesh>
    </group>
  )
}
