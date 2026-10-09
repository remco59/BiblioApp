/**
 * Decoratieve kamerplanten aan de zijkanten van een plank. Alleen sfeer: aria-hidden, en op
 * smalle schermen verborgen (zie .shelf-plant in styles.css). Vervang de SVG's gerust door foto's.
 */
type Leaf = { x: number; y: number; r: number; s: number; tone: 0 | 1 | 2 };

function LeafShape({ x, y, r, s, tone }: Leaf) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path
        d="M0 0C-9 -8 -10 -24 0 -36C10 -24 9 -8 0 0Z"
        fill={`url(#leaf-${tone})`}
        stroke="rgb(0 0 0 / 25%)"
        strokeWidth="0.6"
      />
      <path d="M0 -2V-31" stroke="rgb(255 255 255 / 22%)" strokeWidth="0.8" fill="none" />
    </g>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="leaf-0" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4d8a4a" />
        <stop offset="1" stopColor="#1f4d2c" />
      </linearGradient>
      <linearGradient id="leaf-1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6fa95a" />
        <stop offset="1" stopColor="#2c6335" />
      </linearGradient>
      <linearGradient id="leaf-2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#365f35" />
        <stop offset="1" stopColor="#173a22" />
      </linearGradient>
      <linearGradient id="pot-grey" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8c8a84" />
        <stop offset="0.45" stopColor="#6d6b66" />
        <stop offset="1" stopColor="#403f3c" />
      </linearGradient>
      <linearGradient id="pot-sand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#d8c7ab" />
        <stop offset="0.5" stopColor="#b9a687" />
        <stop offset="1" stopColor="#8b7a5f" />
      </linearGradient>
    </defs>
  );
}

const POTHOS: Leaf[] = [
  { x: 52, y: 70, r: -70, s: 0.9, tone: 0 },
  { x: 54, y: 60, r: 60, s: 0.95, tone: 1 },
  { x: 50, y: 48, r: -48, s: 1, tone: 2 },
  { x: 56, y: 40, r: 40, s: 1.05, tone: 0 },
  { x: 48, y: 30, r: -28, s: 1.05, tone: 1 },
  { x: 58, y: 24, r: 22, s: 1.1, tone: 2 },
  { x: 52, y: 14, r: -8, s: 1.1, tone: 0 },
  { x: 40, y: 78, r: -95, s: 0.8, tone: 1 },
  { x: 68, y: 78, r: 95, s: 0.8, tone: 2 },
  { x: 45, y: 90, r: -130, s: 0.75, tone: 0 },
  { x: 62, y: 92, r: 128, s: 0.75, tone: 1 },
];

/** Kamerplant in grijze pot met overhangende ranken. */
export function PottedPlant({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-24 -40 140 240" aria-hidden="true" focusable="false">
      <Defs />
      <path d="M52 112C52 90 52 80 52 70" stroke="#2c5a30" strokeWidth="2" fill="none" />
      <path d="M44 112C34 90 30 80 40 78" stroke="#2c5a30" strokeWidth="2" fill="none" />
      <path d="M62 112C72 90 76 82 68 78" stroke="#2c5a30" strokeWidth="2" fill="none" />
      {POTHOS.map((l, i) => (
        <LeafShape key={i} {...l} />
      ))}
      <path
        d="M28 118h54l-6 70H34z"
        fill="url(#pot-grey)"
        stroke="rgb(0 0 0 / 30%)"
        strokeWidth="0.8"
      />
      <ellipse cx="55" cy="118" rx="27" ry="5" fill="#2a2018" />
      <path d="M26 114h58v8H26z" fill="url(#pot-grey)" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${30 + i * 4} 124q-${18 + i * 6} ${20 + i * 8} -${10 + i * 4} ${44 + i * 10}`}
          stroke="#2c5a30"
          strokeWidth="1.6"
          fill="none"
        />
      ))}
      <LeafShape x={14} y={150} r={-160} s={0.7} tone={1} />
      <LeafShape x={8} y={176} r={-170} s={0.65} tone={0} />
    </svg>
  );
}

const SPROUT: Leaf[] = [
  { x: 40, y: 70, r: -35, s: 0.8, tone: 1 },
  { x: 40, y: 70, r: 30, s: 0.85, tone: 0 },
  { x: 40, y: 72, r: -75, s: 0.65, tone: 2 },
  { x: 40, y: 72, r: 78, s: 0.65, tone: 1 },
  { x: 40, y: 68, r: 2, s: 0.9, tone: 0 },
];

/** Kleine plant in een beige vaas. */
export function VasePlant({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-8 -12 96 148" aria-hidden="true" focusable="false">
      <Defs />
      {SPROUT.map((l, i) => (
        <LeafShape key={i} {...l} />
      ))}
      <path
        d="M22 78h36c4 10 6 22 2 40-1 6-6 9-20 9s-19-3-20-9c-4-18-2-30 2-40z"
        fill="url(#pot-sand)"
        stroke="rgb(0 0 0 / 25%)"
        strokeWidth="0.8"
      />
      <ellipse cx="40" cy="78" rx="18" ry="3.5" fill="#33271c" />
    </svg>
  );
}
