import { useEffect, useRef, useState } from 'react'
import { afterIdle, canRunHeavyVisuals } from '@/lib/capability'

// A slow, soft emerald "aurora" rendered in a tiny WebGL fragment shader, no
// libraries. It only starts on capable devices after idle, pauses when scrolled
// out of view, caps resolution for battery, and falls back to a CSS gradient.
const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`
const FRAG = `
precision mediump float;
uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.02;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
  float k=t*.06;
  float a=fbm(p*1.6+vec2(k,-k*.7));
  float b=fbm(p*2.4+a*1.7+vec2(-k*.8,k));
  float ridge=smoothstep(.35,.85,b)*(1.-smoothstep(.0,1.,length(p*vec2(.8,1.1))));
  vec3 base=vec3(.050,.059,.055);
  vec3 em=vec3(.102,.478,.369);
  vec3 jade=vec3(.373,.722,.604);
  vec3 col=base+em*ridge*.55+jade*pow(ridge,3.)*.35;
  col*=.55+.45*smoothstep(1.,.0,uv.y);
  gl_FragColor=vec4(col,1.);
}`

interface Props {
  className?: string
  // Overall strength, 0..1. Use a low value behind text.
  opacity?: number
}

export function ShaderBackdrop({ className = '', opacity = 0.5 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!canRunHeavyVisuals()) return
    return afterIdle(() => setLive(true))
  }, [])

  useEffect(() => {
    if (!live) return
    const el = canvas.current
    if (!el) return
    const gl = el.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) return

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uR = gl.getUniformLocation(prog, 'r')
    const uT = gl.getUniformLocation(prog, 't')

    // Half resolution is plenty for a soft blur and 4x cheaper to draw.
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5
      el.width = Math.max(2, Math.floor(el.clientWidth * scale))
      el.height = Math.max(2, Math.floor(el.clientHeight * scale))
      gl.viewport(0, 0, el.width, el.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    let visible = true
    const t0 = performance.now()
    const frame = () => {
      raf = 0
      if (!visible || document.hidden) return
      gl.uniform2f(uR, el.width, el.height)
      gl.uniform1f(uT, (performance.now() - t0) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(
      (e) => {
        visible = e[0]?.isIntersecting ?? true
        if (visible) start()
      },
      { threshold: 0 }
    )
    io.observe(el)
    const onVis = () => !document.hidden && start()
    document.addEventListener('visibilitychange', onVis)
    const onLost = (ev: Event) => {
      ev.preventDefault()
      setLive(false)
    }
    el.addEventListener('webglcontextlost', onLost)
    start()

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      el.removeEventListener('webglcontextlost', onLost)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [live])

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* CSS fallback shows instantly and on devices that skip WebGL */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,hsl(var(--primary)/0.18),transparent_60%),radial-gradient(ellipse_at_80%_80%,hsl(var(--accent)/0.10),transparent_55%)]" />
      {live && (
        <canvas
          ref={canvas}
          className="absolute inset-0 h-full w-full"
          style={{ opacity, transition: 'opacity 1200ms ease' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>
  )
}
