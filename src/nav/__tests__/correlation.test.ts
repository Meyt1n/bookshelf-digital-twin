import { describe, expect, it } from 'vitest'
import { navSimulator } from '../simulator'

describe('导航任务联动 ID（correlationId）', () => {
  it('dispatchTo 携带联动 ID：快照可读，日志带联动标记', () => {
    navSimulator.dispatchTo('desk', 'T042')
    const ui = navSimulator.getUiSnapshot()
    expect(ui.phase).toBe('moving')
    expect(ui.correlationId).toBe('T042')
    expect(ui.events[0].text).toContain('联动 T042')
  })

  it('普通派送无联动 ID', () => {
    navSimulator.dispatchTo('stacks')
    expect(navSimulator.getUiSnapshot().correlationId).toBeNull()
  })

  it('放置小车清空任务与联动 ID', () => {
    navSimulator.dispatchTo('desk', 'T043')
    expect(navSimulator.getUiSnapshot().correlationId).toBe('T043')
    navSimulator.teleportRobot(9.0, 9.5)
    const ui = navSimulator.getUiSnapshot()
    expect(ui.phase).toBe('idle')
    expect(ui.correlationId).toBeNull()
  })
})
