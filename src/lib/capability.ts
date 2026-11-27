// Decides whether this visitor's device should get heavy visuals (3D robot,
// WebGL backdrops). Everyone else keeps the light SVG / CSS version, so a
// phone on a slow connection never downloads the 3D runtime.
type Nav = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string }
  deviceMemory?: number
}

export function canRunHeavyVisuals(opts: { minWidth?: number } = {}): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Nav
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  if (nav.connection?.saveData) return false
  if (['slow-2g', '2g', '3g'].includes(nav.connection?.effectiveType ?? '')) return false
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 4) return false
  if (opts.minWidth && window.innerWidth < opts.minWidth) return false
  return true
}

// Run work after the page has painted and the browser is idle, so heavy
// visuals never compete with first paint or the hero text.
export function afterIdle(fn: () => void, timeout = 2500): () => void {
  let cancelled = false
  const run = () => {
    if (!cancelled) fn()
  }
  const schedule = () => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback && w.cancelIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout })
      return () => w.cancelIdleCallback!(id)
    }
    const t = window.setTimeout(run, 1200)
    return () => window.clearTimeout(t)
  }
  let cancelIdle = () => {}
  if (document.readyState === 'complete') cancelIdle = schedule()
  else {
    const onLoad = () => {
      cancelIdle = schedule()
    }
    window.addEventListener('load', onLoad, { once: true })
    return () => {
      cancelled = true
      window.removeEventListener('load', onLoad)
      cancelIdle()
    }
  }
  return () => {
    cancelled = true
    cancelIdle()
  }
}
