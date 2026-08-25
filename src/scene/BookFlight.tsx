import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { categoryColor } from '../catalog'
import { twinEngine } from '../twin/engine'
import { BookMesh } from './BookMesh'

/** 书在机器人 / 大隔间 / 夹爪 / 格口之间交接时的世界坐标过渡 */
export function BookFlightMesh() {
  const ref = useRef<Group>(null)
  const lastId = useRef<number | null>(null)
  const [held, setHeld] = useState<{ title: string; color: string } | null>(null)

  useFrame(() => {
    const flight = twinEngine.sampleBookFlight(performance.now())
    if (ref.current) {
      ref.current.visible = flight.active
      if (flight.active) ref.current.position.set(flight.x, flight.y, flight.z)
    }
    if (flight.active && flight.bookId !== null && flight.bookId !== lastId.current) {
      lastId.current = flight.bookId
      const book = twinEngine.getSnapshot().booksById[flight.bookId]
      setHeld({ title: book?.title ?? '', color: categoryColor(book?.category) })
    }
    if (!flight.active) lastId.current = null
  })

  return (
    <group ref={ref} visible={false}>
      {held ? <BookMesh color={held.color} title={held.title} /> : null}
    </group>
  )
}
