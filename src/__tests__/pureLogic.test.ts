import { describe, expect, it } from 'vitest'
import { categoryColor } from '../catalog'
import { fmtRelative, fmtTime, hex2 } from '../format'
import {
  cellX,
  clamp01,
  easeInOut,
  lerpPath,
  lerpVec3,
  MODEL_SCALE,
} from '../scene/layout'
import { cameraForTask } from '../scene/cameraPresets'
import {
  isTaskAction,
  parseBorrowLogsEnvelope,
  parseClimateEnvelope,
  parseLiveCompartments,
  parseOkEnvelope,
  parseStreamPayload,
} from '../twin/liveApi'

describe('format', () => {
  it('fmtTime pads hh:mm:ss', () => {
    const ts = new Date(2026, 0, 1, 9, 5, 7).getTime()
    expect(fmtTime(ts)).toBe('09:05:07')
  })

  it('fmtRelative handles null and recent', () => {
    expect(fmtRelative(null)).toBe('—')
    expect(fmtRelative(Date.now() - 30_000)).toBe('刚刚')
    expect(fmtRelative(Date.now() - 5 * 60_000)).toBe('5 分钟前')
  })

  it('hex2 formats byte', () => {
    expect(hex2(0)).toBe('0x00')
    expect(hex2(255)).toBe('0xFF')
  })
})

describe('layout pure math', () => {
  it('cellX maps 1..4 slots', () => {
    expect(cellX(1)).toBeCloseTo(0.0055 * MODEL_SCALE)
    expect(cellX(4)).toBeCloseTo(0.2545 * MODEL_SCALE)
    expect(cellX(99)).toBe(0)
  })

  it('clamp01 / easeInOut stay in range', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })

  it('lerpPath follows polyline arc length', () => {
    const p = lerpPath(
      [
        { x: 0, z: 0 },
        { x: 0, z: 10 },
        { x: 10, z: 10 },
      ],
      0.25,
    )
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(5)
  })

  it('lerpVec3 eases toward target', () => {
    const a = { x: 0, y: 0, z: 0 }
    const b = { x: 10, y: 10, z: 10 }
    const mid = lerpVec3(a, b, 0.5)
    expect(mid.x).toBeGreaterThan(0)
    expect(mid.x).toBeLessThan(10)
  })
})

describe('catalog', () => {
  it('categoryColor falls back', () => {
    expect(categoryColor('科普')).toBe('#5eb3f6')
    expect(categoryColor('不存在')).toBe('#8b93b8')
    expect(categoryColor(undefined)).toBe('#8b93b8')
  })
})

describe('cameraForTask', () => {
  it('maps store/take phases', () => {
    expect(cameraForTask('store', 'deliver')).toBe('cart')
    expect(cameraForTask('store', 'scan')).toBe('scan-cam')
    expect(cameraForTask('take', 'operate')).toBe('gantry')
    expect(cameraForTask('take', 'ack')).toBe('front')
  })
})

describe('liveApi validators', () => {
  it('parseClimateEnvelope', () => {
    expect(parseClimateEnvelope({ ok: true, data: { temperature: 22.5, humidity: 48, source: 'sensor' } })).toEqual({
      temperature: 22.5,
      humidity: 48,
      source: 'sensor',
    })
    expect(parseClimateEnvelope({ ok: false, data: { temperature: 1, humidity: 2 } })).toBeNull()
    expect(parseClimateEnvelope({ ok: true, data: { temperature: 'x', humidity: 2 } })).toBeNull()
  })

  it('parseBorrowLogsEnvelope filters bad rows', () => {
    const logs = parseBorrowLogsEnvelope({
      ok: true,
      data: [
        { id: 1, action: 'store', compartment_id: 3, action_time: '2026-01-01 00:00:00', title: 'A', user_name: '周妈妈' },
        { id: 2, action: 'drop', compartment_id: 1 },
        { id: 'bad' },
      ],
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('store')
  })

  it('parseStreamPayload / compartments / envelope', () => {
    expect(parseStreamPayload('{bad')).toBeNull()
    expect(parseStreamPayload('{"type":"connected"}')).toEqual({ type: 'connected' })
    expect(isTaskAction('store')).toBe(true)
    expect(isTaskAction('noop')).toBe(false)

    const rows = parseLiveCompartments([
      { cid: 1, x: 1, y: 2, status: 'occupied', book: '小王子' },
      { cid: 'x', x: 1, y: 1, status: 'free', book: null },
    ])
    expect(rows).toHaveLength(1)
    expect(rows?.[0].book).toBe('小王子')
    expect(parseLiveCompartments({})).toBeNull()

    const env = parseOkEnvelope({ ok: true, data: { commit_request: { a: 1 }, msg: 'ok' } })
    expect(env?.ok).toBe(true)
    expect(env?.data?.commit_request).toEqual({ a: 1 })
  })
})
