import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const Spline = lazy(() => import('@splinetool/react-spline'))

// If the 3D scene cannot load (weak network, ad blocker), show the logo
// poster instead of letting the error blank the whole page.
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const Poster = () => (
  <div className="w-full h-full flex items-center justify-center">
    <img src="/popupgenix-logo.svg" alt="PopupGenix" width={120} height={126} className="opacity-80" />
  </div>
)

interface SplineSceneProps {
  scene: string
  className?: string
}

// Loads the heavy 3D scene only when it is on screen, and shows a light
// logo poster instead when the visitor prefers reduced motion or has data
// saver on. This keeps the phone experience fast.
export function SplineScene({ scene, className }: SplineSceneProps) {
  const holder = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [lite, setLite] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData
    if (reduced || saveData) {
      setLite(true)
      return
    }
    const node = holder.current
    if (!node || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    let observer: IntersectionObserver
    try {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setVisible(true)
            observer.disconnect()
          }
        },
        { rootMargin: '200px' }
      )
      observer.observe(node)
    } catch {
      // Old or unusual browsers: just load the scene.
      setVisible(true)
      return
    }
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={holder} className={className}>
      {lite ? (
        <Poster />
      ) : visible ? (
        <SceneBoundary fallback={<Poster />}>
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center">
              <span className="loader"></span>
            </div>
          }
        >
          <Spline scene={scene} className="w-full h-full" />
        </Suspense>
        </SceneBoundary>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="loader"></span>
        </div>
      )}
    </div>
  )
}
