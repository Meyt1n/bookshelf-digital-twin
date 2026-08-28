import { describe, expect, it } from 'vitest'

describe('simulator end-to-end smoke', () => {
  it('tours every station with pedestrians enabled', async () => {
    let frame: FrameRequestCallback | null = null
    ;(globalThis as Record<string, unknown>).requestAnimationFrame = (fn: FrameRequestCallback) => {
      frame = fn
      return 1
    }
    ;(globalThis as Record<string, unknown>).cancelAnimationFrame = () => {
      frame = null
    }

    const { navSimulator } = await import('../simulator')
    navSimulator.start()

    let t = 0
    const runUntilArrived = (label: string) => {
      let frames = 0
      while (frames < 4000) {
        const f = frame
        if (!f) break
        frame = null
        t += 33
        f(t)
        frames++
        const phase = navSimulator.getUiSnapshot().phase
        if (phase === 'arrived') return
        if (phase === 'blocked' || phase === 'unreachable') {
          throw new Error(`${label}: phase=${phase} after ${frames} frames`)
        }
      }
      throw new Error(`${label}: did not arrive (phase=${navSimulator.getUiSnapshot().phase})`)
    }

    for (const id of ['desk', 'returns', 'reading', 'elevator', 'stacks', 'charge']) {
      navSimulator.dispatchTo(id)
      expect(navSimulator.getUiSnapshot().phase).toBe('moving')
      runUntilArrived(id)
      const st = navSimulator.stations.find((s) => s.id === id)!
      const rs = navSimulator.getRenderState()
      expect(Math.hypot(rs.pose.x - st.pos.x, rs.pose.y - st.pos.y)).toBeLessThan(0.3)
    }

    const ui = navSimulator.getUiSnapshot()
    navSimulator.stop()
    expect(ui.traveled).toBeGreaterThan(3)
    expect(ui.speed).toBe(0)
  })
})
