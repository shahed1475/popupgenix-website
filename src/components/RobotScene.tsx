import { Component, Suspense, lazy, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { afterIdle, canRunHeavyVisuals } from '@/lib/capability'

// The Spline runtime is large, so it is a separate chunk that is requested only
// on capable devices, after the page has loaded and gone idle.
const Spline = lazy(() => import('@splinetool/react-spline'))

const SCENE = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onFail()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface Props {
  className?: string
  // Called when the robot has rendered, so the page can dim the SVG poster.
  onReady?: (ready: boolean) => void
  // Smallest screen width that gets the robot (default: desktop only).
  minWidth?: number
}

export function RobotScene({ className, onReady, minWidth = 1024 }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!canRunHeavyVisuals({ minWidth })) return
    return afterIdle(() => setEnabled(true))
  }, [])

  if (!enabled) return null

  return (
    <div
      className={className}
      style={{ opacity: shown ? 1 : 0, transition: 'opacity 900ms cubic-bezier(0.23,1,0.32,1)' }}
      aria-hidden="true"
    >
      <Boundary onFail={() => onReady?.(false)}>
        <Suspense fallback={null}>
          <Spline
            scene={SCENE}
            onLoad={() => {
              setShown(true)
              onReady?.(true)
            }}
            style={{ width: '100%', height: '100%' }}
          />
        </Suspense>
      </Boundary>
    </div>
  )
}
