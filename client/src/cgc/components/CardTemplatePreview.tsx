// Renders a holiday-card template as an inline SVG from its data
// definition (palette, photo count, style) — stands in for real design
// artwork so the gallery works before any assets exist.

import type { CardTemplate } from '../lib/cardTemplates';

const SIZE_RATIOS: Record<CardTemplate['size'], number> = {
  '5" x 7"': 5 / 7,
  '6" x 9"': 6 / 9,
  '5.5" x 5.5"': 1,
  '4" x 8"': 4 / 8,
};

const FONT_FAMILIES: Record<CardTemplate['font'], string> = {
  serif: 'Georgia, "Times New Roman", serif',
  script: '"Snell Roundhand", "Brush Script MT", "Segoe Script", cursive',
  sans: '"Space Grotesk", Inter, sans-serif',
};

const FOIL_STOPS: Record<string, [string, string, string]> = {
  'Gold Foil': ['#e7c873', '#a97e28', '#f3dfa0'],
  'Silver Foil': ['#e6ebf2', '#8c99ab', '#f4f7fb'],
  'Red Foil': ['#e05a5a', '#8f1f2b', '#f0908f'],
};

// Photo slot rectangles (in a unit box) per photo count.
function photoSlots(count: number): Array<[number, number, number, number]> {
  const g = 0.035; // gutter
  const col = (n: number, i: number, y: number, h: number): [number, number, number, number] => {
    const w = (1 - g * (n - 1)) / n;
    return [i * (w + g), y, w, h];
  };
  switch (Math.min(count, 6)) {
    case 1: return [[0, 0, 1, 1]];
    case 2: return [0, 1].map((i) => col(2, i, 0, 1));
    case 3: return [0, 1, 2].map((i) => col(3, i, 0, 1));
    case 4: {
      const h = (1 - g) / 2;
      return [0, 1].flatMap((r) => [0, 1].map((i) => col(2, i, r * (h + g), h)));
    }
    case 5: {
      const h = (1 - g) / 2;
      return [
        ...[0, 1].map((i) => col(2, i, 0, h)),
        ...[0, 1, 2].map((i) => col(3, i, h + g, h)),
      ];
    }
    default: {
      const h = (1 - g) / 2;
      return [0, 1].flatMap((r) => [0, 1, 2].map((i) => col(3, i, r * (h + g), h)));
    }
  }
}

export default function CardTemplatePreview({ template, className }: {
  template: CardTemplate; className?: string;
}) {
  const t = template;
  const ratio = t.orientation === 'Horizontal' ? 1 / SIZE_RATIOS[t.size] : SIZE_RATIOS[t.size];
  const W = 480;
  const H = Math.round(W / ratio);
  const pad = W * 0.08;
  const foil = t.foil !== 'None' ? FOIL_STOPS[t.foil] : null;
  const foilId = `foil-${t.id}`;
  const headlineFill = foil ? `url(#${foilId})` : t.ink;
  const slots = t.photos > 0 ? photoSlots(t.photos) : [];

  // Photo area occupies the top of the card; headline sits below it.
  const photoTop = pad;
  const photoH = t.photos > 0 ? (H - pad * 2) * (t.orientation === 'Horizontal' ? 0.58 : 0.62) : 0;
  const photoW = W - pad * 2;
  const headlineY = t.photos > 0 ? photoTop + photoH + (H - photoTop - photoH) * 0.42 : H * 0.5;
  const headlineSize = Math.min(
    W / Math.max(6, t.headline.length * (t.font === 'script' ? 0.52 : 0.62)),
    t.photos > 0 ? H * 0.085 : H * 0.11,
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`${t.name} — ${t.fold.toLowerCase()} ${t.size} ${t.greeting.toLowerCase()} card template`}
    >
      {foil && (
        <defs>
          <linearGradient id={foilId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={foil[0]} />
            <stop offset="0.5" stopColor={foil[1]} />
            <stop offset="1" stopColor={foil[2]} />
          </linearGradient>
        </defs>
      )}

      <rect width={W} height={H} fill={t.bg} />

      {/* Style dressing */}
      {t.style === 'Elegant' || t.style === 'Minimal' ? (
        <rect
          x={pad * 0.45} y={pad * 0.45} width={W - pad * 0.9} height={H - pad * 0.9}
          fill="none" stroke={foil ? `url(#${foilId})` : t.accent} strokeWidth={W * 0.006}
        />
      ) : t.style === 'Classic Christmas' || t.style === 'Rustic' ? (
        <>
          <rect x={0} y={0} width={W} height={pad * 0.35} fill={t.accent} />
          <rect x={0} y={H - pad * 0.35} width={W} height={pad * 0.35} fill={t.accent} />
        </>
      ) : t.style === 'Bold & Colorful' ? (
        <>
          <circle cx={W * 0.06} cy={H * 0.94} r={W * 0.13} fill={t.accent} opacity={0.85} />
          <circle cx={W * 0.94} cy={H * 0.06} r={W * 0.1} fill={t.accent} opacity={0.85} />
        </>
      ) : t.style === 'Floral' ? (
        [0.14, 0.86].map((cx) => (
          <g key={cx}>
            {[-0.05, 0, 0.05].map((dx) => (
              <ellipse
                key={dx} cx={W * (cx + dx)} cy={H * 0.06} rx={W * 0.035} ry={W * 0.016}
                fill={t.accent} opacity={0.8}
                transform={`rotate(${dx * 600} ${W * (cx + dx)} ${H * 0.06})`}
              />
            ))}
          </g>
        ))
      ) : t.style === 'Whimsical' ? (
        [0.1, 0.3, 0.5, 0.7, 0.9].map((cx, i) => (
          <circle key={cx} cx={W * cx} cy={H * (i % 2 ? 0.045 : 0.065)} r={W * 0.014} fill={t.accent} />
        ))
      ) : null}

      {/* Photo wells */}
      {slots.map(([x, y, w, h], i) => {
        const px = photoTop === 0 ? 0 : pad + x * photoW;
        const py = photoTop + y * photoH;
        const pw = w * photoW;
        const ph = h * photoH;
        return (
          <g key={i}>
            <rect x={px} y={py} width={pw} height={ph} rx={W * 0.008} fill="#d9d4ca" />
            <circle cx={px + pw * 0.72} cy={py + ph * 0.3} r={Math.min(pw, ph) * 0.11} fill="#f3efe6" />
            <path
              d={`M ${px} ${py + ph} L ${px + pw * 0.38} ${py + ph * 0.45} L ${px + pw * 0.62} ${py + ph * 0.78} L ${px + pw * 0.82} ${py + ph * 0.55} L ${px + pw} ${py + ph} Z`}
              fill="#c2bcae"
            />
          </g>
        );
      })}

      {/* Headline + family line */}
      <text
        x={W / 2} y={headlineY} textAnchor="middle"
        fontFamily={FONT_FAMILIES[t.font]} fontSize={headlineSize}
        fontWeight={t.font === 'sans' ? 700 : 400} fill={headlineFill}
        letterSpacing={t.font === 'sans' ? headlineSize * 0.08 : 0}
      >
        {t.headline}
      </text>
      <text
        x={W / 2} y={headlineY + headlineSize * 1.35} textAnchor="middle"
        fontFamily={FONT_FAMILIES.sans} fontSize={headlineSize * 0.34}
        fill={t.ink} opacity={0.75} letterSpacing={headlineSize * 0.06}
      >
        {t.recipient === 'Business' ? 'FROM ALL OF US AT YOUR COMPANY' : 'THE JOHNSON FAMILY • 2026'}
      </text>
    </svg>
  );
}
