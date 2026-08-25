/** 前端表现档位：只影响渲染/动效，不改孪生逻辑 */

export type PerfTier = 'high' | 'mid' | 'low'

export type GraphicsProfile = {
  tier: PerfTier
  reducedMotion: boolean
  dprMax: number
  antialias: boolean
  starDust: boolean
  starCount: number
  envAnimate: boolean
}

function readReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function detectPerfTier(): PerfTier {
  if (typeof window === 'undefined') return 'high'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency || 8
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return 'low'
  if (cores <= 4 || (typeof mem === 'number' && mem <= 4) || (coarse && cores <= 6)) return 'low'
  if (cores <= 6 || coarse) return 'mid'
  return 'high'
}

export function buildGraphicsProfile(tier = detectPerfTier(), reducedMotion = readReducedMotion()): GraphicsProfile {
  if (reducedMotion || tier === 'low') {
    return {
      tier: reducedMotion ? tier : 'low',
      reducedMotion,
      dprMax: 1.25,
      antialias: false,
      starDust: !reducedMotion && tier !== 'low',
      starCount: 120,
      envAnimate: !reducedMotion,
    }
  }
  if (tier === 'mid') {
    return {
      tier,
      reducedMotion: false,
      dprMax: 1.5,
      antialias: true,
      starDust: true,
      starCount: 240,
      envAnimate: true,
    }
  }
  return {
    tier: 'high',
    reducedMotion: false,
    dprMax: 1.75,
    antialias: true,
    starDust: true,
    starCount: 480,
    envAnimate: true,
  }
}

export function applyDocumentPerfClass(profile: GraphicsProfile): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.perf = profile.tier
  root.classList.toggle('reduce-motion', profile.reducedMotion || profile.tier === 'low')
}
