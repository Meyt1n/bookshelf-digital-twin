/** 联机 API 载荷的轻量运行时校验（不改孪生状态机，只守边界） */

export type DeviceBorrowLog = {
  id: number
  action: 'store' | 'take'
  compartment_id: number | null
  action_time: string | null
  title: string | null
  user_name: string | null
}

export type DeviceClimate = {
  temperature: number
  humidity: number
  source: string
}

export type StreamPayload = {
  type?: string
  role?: string
  text?: string
  source?: string
  action?: string
  title?: string
  cid?: number | string
}

export type LiveCompartmentRow = {
  cid: number
  x: number
  y: number
  status: string
  book: string | null
}

export type ApiEnvelope<T> = {
  ok: boolean
  message?: string
  data?: T
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  return null
}

export function parseClimateEnvelope(raw: unknown): DeviceClimate | null {
  if (!isRecord(raw) || raw.ok !== true || !isRecord(raw.data)) return null
  const temperature = asFiniteNumber(raw.data.temperature)
  const humidity = asFiniteNumber(raw.data.humidity)
  if (temperature === null || humidity === null) return null
  const source = typeof raw.data.source === 'string' ? raw.data.source : 'unknown'
  return { temperature, humidity, source }
}

export function parseBorrowLogsEnvelope(raw: unknown): DeviceBorrowLog[] {
  if (!isRecord(raw) || !Array.isArray(raw.data)) return []
  const out: DeviceBorrowLog[] = []
  for (const item of raw.data) {
    if (!isRecord(item)) continue
    const id = asFiniteNumber(item.id)
    const action = item.action
    if (id === null || (action !== 'store' && action !== 'take')) continue
    const compartmentRaw = item.compartment_id
    const compartment_id =
      compartmentRaw == null ? null : asFiniteNumber(compartmentRaw)
    if (compartmentRaw != null && compartment_id === null) continue
    out.push({
      id,
      action,
      compartment_id,
      action_time: asNullableString(item.action_time),
      title: asNullableString(item.title),
      user_name: asNullableString(item.user_name),
    })
  }
  return out
}

export function parseStreamPayload(raw: string): StreamPayload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const payload: StreamPayload = {}
  if (typeof parsed.type === 'string') payload.type = parsed.type
  if (typeof parsed.role === 'string') payload.role = parsed.role
  if (typeof parsed.text === 'string') payload.text = parsed.text
  if (typeof parsed.source === 'string') payload.source = parsed.source
  if (typeof parsed.action === 'string') payload.action = parsed.action
  if (typeof parsed.title === 'string') payload.title = parsed.title
  if (parsed.cid !== undefined && parsed.cid !== null) {
    if (typeof parsed.cid === 'number' || typeof parsed.cid === 'string') {
      payload.cid = parsed.cid
    }
  }
  return payload
}

export function parseLiveCompartments(raw: unknown): LiveCompartmentRow[] | null {
  if (!Array.isArray(raw)) return null
  const out: LiveCompartmentRow[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const cid = asFiniteNumber(item.cid)
    const x = asFiniteNumber(item.x)
    const y = asFiniteNumber(item.y)
    if (cid === null || x === null || y === null) continue
    if (typeof item.status !== 'string') continue
    const book = item.book == null ? null : typeof item.book === 'string' ? item.book : null
    out.push({ cid, x, y, status: item.status, book })
  }
  return out
}

export function parseOkEnvelope(raw: unknown): ApiEnvelope<Record<string, unknown>> | null {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') return null
  const message = typeof raw.message === 'string' ? raw.message : undefined
  const data = isRecord(raw.data) ? raw.data : undefined
  return { ok: raw.ok, message, data }
}

export function isTaskAction(v: unknown): v is 'store' | 'take' {
  return v === 'store' || v === 'take'
}
