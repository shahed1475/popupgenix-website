/**
 * Hero visual — an "agent mesh": a coordinating network of nodes.
 *
 * Replaces the 3D Spline scene, which cost ~1.4MB gzipped of JavaScript for
 * a decorative robot. This is inline SVG plus CSS keyframes: no runtime, no
 * network request, no main-thread cost, and it says what the company sells.
 *
 * All motion sits behind prefers-reduced-motion (see .mesh-* in index.css).
 */

const ORBIT = [
  { cx: 240, cy: 72, r: 15, delay: "0s" },
  { cx: 384, cy: 156, r: 11, delay: "-1.6s" },
  { cx: 384, cy: 324, r: 13, delay: "-3.2s" },
  { cx: 240, cy: 408, r: 11, delay: "-4.8s" },
  { cx: 96, cy: 324, r: 14, delay: "-6.4s" },
  { cx: 96, cy: 156, r: 11, delay: "-8s" },
];

export function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <svg
        viewBox="0 0 480 480"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="mesh-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary-glow))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
          </radialGradient>
          <linearGradient id="mesh-link" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary-glow))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Orbit rings — counter-rotating, very slow */}
        <g className="mesh-spin-slow" style={{ transformOrigin: "240px 240px" }}>
          <circle
            cx="240"
            cy="240"
            r="168"
            stroke="hsl(var(--foreground))"
            strokeOpacity="0.07"
            strokeWidth="1"
            strokeDasharray="3 9"
          />
        </g>
        <g className="mesh-spin-reverse" style={{ transformOrigin: "240px 240px" }}>
          <circle
            cx="240"
            cy="240"
            r="118"
            stroke="hsl(var(--foreground))"
            strokeOpacity="0.09"
            strokeWidth="1"
            strokeDasharray="2 7"
          />
        </g>
        <circle
          cx="240"
          cy="240"
          r="208"
          stroke="hsl(var(--foreground))"
          strokeOpacity="0.04"
          strokeWidth="1"
        />

        {/* Links from the core to each agent */}
        {ORBIT.map((n) => (
          <line
            key={`l-${n.cx}-${n.cy}`}
            x1="240"
            y1="240"
            x2={n.cx}
            y2={n.cy}
            stroke="url(#mesh-link)"
            strokeWidth="1.25"
            strokeDasharray="4 10"
            className="mesh-flow"
            style={{ animationDelay: n.delay }}
          />
        ))}

        {/* Core */}
        <circle cx="240" cy="240" r="62" fill="url(#mesh-core)" className="mesh-breathe" />
        <circle
          cx="240"
          cy="240"
          r="62"
          stroke="hsl(var(--primary-glow))"
          strokeOpacity="0.3"
          strokeWidth="1"
        />

        {/* The mark, at the centre of its own network */}
        <g transform="translate(240 240) scale(0.33) translate(-128 -128)">
          <rect x="39" y="39" width="106" height="58" rx="14" fill="hsl(var(--primary-glow))" />
          <rect x="159" y="39" width="58" height="106" rx="14" fill="hsl(var(--primary-glow))" />
          <rect x="111" y="159" width="106" height="58" rx="14" fill="hsl(var(--primary-glow))" />
          <rect x="39" y="111" width="58" height="106" rx="14" fill="hsl(var(--primary-glow))" />
        </g>

        {/* Agents */}
        {ORBIT.map((n) => (
          <g key={`n-${n.cx}-${n.cy}`} className="mesh-pulse" style={{ animationDelay: n.delay }}>
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.r + 9}
              fill="hsl(var(--primary))"
              fillOpacity="0.09"
            />
            <circle cx={n.cx} cy={n.cy} r={n.r} fill="hsl(var(--background))" />
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.r}
              stroke="hsl(var(--primary-glow))"
              strokeOpacity="0.65"
              strokeWidth="1.5"
            />
            <circle cx={n.cx} cy={n.cy} r={n.r / 3} fill="hsl(var(--primary-glow))" />
          </g>
        ))}
      </svg>
    </div>
  );
}

export default HeroVisual;
