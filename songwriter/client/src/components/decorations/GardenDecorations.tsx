// Reusable SVG decorations for the garden / life-giving theme.
// Each is designed to be layered as a background behind content.

export function Sun({ className = '', size = 200 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Outer rays */}
      <g stroke="#f5c842" strokeWidth="3" strokeLinecap="round" opacity="0.85">
        {Array.from({ length: 16 }, (_, i) => {
          const angle = (i * 360) / 16;
          const rad = (angle * Math.PI) / 180;
          const x1 = 100 + 60 * Math.cos(rad);
          const y1 = 100 + 60 * Math.sin(rad);
          const x2 = 100 + 88 * Math.cos(rad);
          const y2 = 100 + 88 * Math.sin(rad);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      {/* Sun body */}
      <circle cx="100" cy="100" r="48" fill="#f5c842" />
      <circle cx="100" cy="100" r="48" fill="url(#sunGradient)" />
      <defs>
        <radialGradient id="sunGradient" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f5c842" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function GrassStrip({ className = '' }: { className?: string }) {
  // Wavy grass strip intended to sit at the bottom of a section
  return (
    <svg
      viewBox="0 0 1200 80"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {/* Back layer — softer, lighter */}
      <path
        d="M0 80 L0 55 Q 20 30 40 55 Q 60 25 80 55 Q 100 35 120 55 Q 140 22 160 55 Q 180 30 200 55 Q 220 20 240 55 Q 260 35 280 55 Q 300 28 320 55 Q 340 22 360 55 Q 380 30 400 55 Q 420 20 440 55 Q 460 35 480 55 Q 500 22 520 55 Q 540 28 560 55 Q 580 18 600 55 Q 620 30 640 55 Q 660 22 680 55 Q 700 35 720 55 Q 740 20 760 55 Q 780 28 800 55 Q 820 22 840 55 Q 860 30 880 55 Q 900 22 920 55 Q 940 28 960 55 Q 980 20 1000 55 Q 1020 30 1040 55 Q 1060 22 1080 55 Q 1100 30 1120 55 Q 1140 22 1160 55 Q 1180 30 1200 55 L 1200 80 Z"
        fill="#b9cc98"
      />
      {/* Front layer — darker, more prominent blades */}
      <path
        d="M0 80 L0 62 Q 30 30 60 62 Q 90 25 120 62 Q 150 35 180 62 Q 210 28 240 62 Q 270 22 300 62 Q 330 32 360 62 Q 390 25 420 62 Q 450 35 480 62 Q 510 22 540 62 Q 570 30 600 62 Q 630 20 660 62 Q 690 32 720 62 Q 750 25 780 62 Q 810 35 840 62 Q 870 28 900 62 Q 930 22 960 62 Q 990 32 1020 62 Q 1050 25 1080 62 Q 1110 35 1140 62 Q 1170 28 1200 62 L 1200 80 Z"
        fill="#8eb063"
      />
    </svg>
  );
}

export function Leaf({
  className = '',
  color = '#6b8f42',
  rotate = 0,
  size = 40,
}: { className?: string; color?: string; rotate?: number; size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      <path
        d="M20 2 C 6 10 4 28 20 38 C 36 28 34 10 20 2 Z"
        fill={color}
      />
      <path d="M20 4 L20 36" stroke={color} strokeOpacity="0.35" strokeWidth="1" />
      <path d="M20 12 Q 14 15 10 22" stroke={color} strokeOpacity="0.25" strokeWidth="0.8" fill="none" />
      <path d="M20 12 Q 26 15 30 22" stroke={color} strokeOpacity="0.25" strokeWidth="0.8" fill="none" />
      <path d="M20 22 Q 15 25 12 30" stroke={color} strokeOpacity="0.25" strokeWidth="0.8" fill="none" />
      <path d="M20 22 Q 25 25 28 30" stroke={color} strokeOpacity="0.25" strokeWidth="0.8" fill="none" />
    </svg>
  );
}

export function Flower({
  className = '',
  petal = '#e89b9b',
  center = '#f5c842',
  size = 36,
}: { className?: string; petal?: string; center?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {Array.from({ length: 6 }, (_, i) => {
        const angle = (i * 360) / 6;
        return (
          <ellipse
            key={i}
            cx="20"
            cy="10"
            rx="6"
            ry="10"
            fill={petal}
            transform={`rotate(${angle} 20 20)`}
            opacity="0.9"
          />
        );
      })}
      <circle cx="20" cy="20" r="5" fill={center} />
    </svg>
  );
}

export function Branch({ className = '', size = 200 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 200 60" width={size} height={(size * 60) / 200} className={className} aria-hidden="true">
      <path
        d="M5 40 Q 50 5 100 30 T 195 25"
        stroke="#527132"
        strokeWidth="2"
        fill="none"
      />
      {/* leaves */}
      {[[30, 25], [70, 18], [115, 35], [155, 20], [180, 30]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="0" rx="8" ry="4" fill="#8eb063" transform={`rotate(${-30 + i * 15})`} />
        </g>
      ))}
    </svg>
  );
}

// Scatter of floating leaves/flowers — nice as an absolute-positioned overlay.
export function FloatingGarden({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <Leaf className="absolute top-[8%] left-[6%] opacity-50" color="#8eb063" rotate={-20} size={32} />
      <Leaf className="absolute top-[22%] right-[10%] opacity-60" color="#6b8f42" rotate={35} size={28} />
      <Flower className="absolute top-[50%] left-[4%] opacity-70" petal="#f2c6c6" center="#f5c842" size={30} />
      <Leaf className="absolute bottom-[28%] right-[6%] opacity-50" color="#b9cc98" rotate={-45} size={36} />
      <Flower className="absolute bottom-[18%] left-[12%] opacity-60" petal="#cfe7f2" center="#f5c842" size={24} />
    </div>
  );
}
