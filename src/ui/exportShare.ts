import type { TwinSnapshot } from '../types'

export function exportKpiJson(snapshot: TwinSnapshot): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    mode: snapshot.mode,
    stats: snapshot.stats,
    telemetry: {
      temperature: snapshot.telemetry.temperature,
      humidity: snapshot.telemetry.humidity,
      climateSource: snapshot.telemetry.climateSource,
    },
    occupancy: {
      total: snapshot.compartments.length,
      used: snapshot.compartments.filter((c) => c.status === 'occupied').length,
    },
    links: snapshot.links,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shelf-twin-kpi-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function captureViewportPng(): boolean {
  const canvas = document.querySelector('.twin-scene-root canvas') as HTMLCanvasElement | null
  if (!canvas) return false
  try {
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `shelf-twin-${Date.now()}.png`
    a.click()
    return true
  } catch {
    return false
  }
}

/** 短录屏：优先 MediaRecorder；失败则回退连拍 PNG */
export async function recordViewportBrief(durationMs = 4000): Promise<'webm' | 'png' | 'fail'> {
  const canvas = document.querySelector('.twin-scene-root canvas') as HTMLCanvasElement | null
  if (!canvas) return 'fail'
  const stream = canvas.captureStream?.(30)
  if (!stream || typeof MediaRecorder === 'undefined') {
    return captureViewportPng() ? 'png' : 'fail'
  }
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : ''
  if (!mime) return captureViewportPng() ? 'png' : 'fail'

  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }))
  })
  recorder.start()
  await new Promise((r) => setTimeout(r, durationMs))
  recorder.stop()
  stream.getTracks().forEach((t) => t.stop())
  const blob = await done
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shelf-twin-${Date.now()}.webm`
  a.click()
  URL.revokeObjectURL(url)
  return 'webm'
}
