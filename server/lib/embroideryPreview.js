import sharp from 'sharp';

/**
 * Geometry-first stitch PLAN visualization. This is not a machine-ready
 * digitization: paths have not been optimized for travel, tie-ins or pull.
 * Color regions are segmented independently; fill rows are explicit stitches.
 *
 * What makes it read as thread rather than as vector art:
 *
 *  • Rows are broken into individual stitches with a needle gap between
 *    them. One unbroken line per row is the single biggest tell — real
 *    fill is a run of 3-4mm stitches, and the penetrations are visible.
 *  • Every stitch is drawn four times — contact shadow, dark side, body,
 *    highlight — each offset a fraction of a pixel across the stitch. That
 *    is what gives thread its round, lit bead instead of a flat stroke.
 *  • Fill angle follows each region's own principal axis rather than a
 *    rotating 0/45/90/135 cycle, which is what a digitizer does and what
 *    stops neighbouring shapes looking like a quilt.
 *  • Thin regions become satin: stitches run across the short dimension,
 *    packed tight, with a stronger centre highlight.
 *  • Endpoints carry sub-pixel jitter. Machine-perfect spacing is the
 *    other tell; thread tension never is.
 *
 * The shading is drawn as four flat layers rather than SVG filters so the
 * output does not depend on which filter primitives the rasteriser
 * implements.
 */

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const hex = (rgb) => '#' + rgb.map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
const lighten = (rgb, amount) => rgb.map((v) => v + (255 - v) * amount);
const darken = (rgb, amount) => rgb.map((v) => v * (1 - amount));

/**
 * Dominant axis of a pixel cluster, from the covariance of its coordinates.
 * Fill runs along it; satin runs across it.
 */
function principalAngle(pixels, w) {
  let sx = 0, sy = 0;
  for (const i of pixels) { sx += i % w; sy += (i / w) | 0; }
  const n = pixels.length, mx = sx / n, my = sy / n;
  let xx = 0, yy = 0, xy = 0;
  for (const i of pixels) {
    const dx = (i % w) - mx, dy = ((i / w) | 0) - my;
    xx += dx * dx; yy += dy * dy; xy += dx * dy;
  }
  // Degenerate (a perfect circle or a single row) gives atan2(0,0) = 0,
  // which is a fine horizontal default.
  return 0.5 * Math.atan2(2 * xy, xx - yy);
}

export async function renderEmbroideryPreview(png, { widthIn = 3.5, spacingMm = 0.42 } = {}) {
  const { data, info } = await sharp(png).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const mmPerPx = Number(widthIn) * 25.4 / w;
  const pitch = Math.max(2, Math.min(12, Number(spacingMm) / mmPerPx));
  const cell = new Int16Array(w * h).fill(-1);
  const palette = [];
  const bins = new Map();
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 128) continue;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    let id = bins.get(key);
    if (id === undefined) {
      id = palette.length;
      bins.set(key, id);
      palette.push({ r, g, b, n: 0 });
    }
    cell[i] = id;
    const p = palette[id]; p.n++; p.r += r; p.g += g; p.b += b;
  }
  // Retain dominant color bins; remap JPEG/antialias fringe colors to them.
  // This avoids treating edge noise as independent embroidery thread colors.
  const ranked = palette.map((p, id) => ({ id, n: p.n })).sort((a, b) => b.n - a.n);
  const dominant = ranked.filter((p) => p.n >= Math.max(24, w * h * 0.002)).slice(0, 12).map((p) => p.id);
  const keep = new Set(dominant);
  const representatives = dominant.map((id) => {
    const p = palette[id];
    return [p.r / Math.max(1, p.n), p.g / Math.max(1, p.n), p.b / Math.max(1, p.n)];
  });
  // Thread colour per region, keyed by palette id. Sampling one pixel of the
  // region picks up whatever that pixel happened to be — frequently an
  // antialiased edge, which is why a navy badge previewed olive-grey.
  const threadColor = new Map(dominant.map((id, j) => [id, representatives[j]]));
  for (let i = 0; i < cell.length; i++) {
    if (cell[i] < 0 || keep.has(cell[i]) || !dominant.length) continue;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    let best = 0, distance = Infinity;
    for (let j = 0; j < representatives.length; j++) {
      const p = representatives[j], d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
      if (d < distance) { distance = d; best = j; }
    }
    cell[i] = dominant[best];
  }
  const groups = new Map();
  for (const id of keep) groups.set(id, []);
  // Connected components prevent distant objects of the same color sharing a fill angle.
  const visited = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const start = y * w + x, id = cell[start];
    if (id < 0 || !keep.has(id) || visited[start]) continue;
    const queue = [start]; visited[start] = 1;
    let left = x, right = x, top = y, bottom = y;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], px = i % w, py = (i / w) | 0;
      left = Math.min(left, px); right = Math.max(right, px);
      top = Math.min(top, py); bottom = Math.max(bottom, py);
      for (const j of [px > 0 ? i - 1 : -1, px + 1 < w ? i + 1 : -1, py > 0 ? i - w : -1, py + 1 < h ? i + w : -1]) {
        if (j >= 0 && !visited[j] && cell[j] === id) { visited[j] = 1; queue.push(j); }
      }
    }
    if (queue.length >= 5) groups.get(id).push({ pixels: queue, left, right, top, bottom });
  }

  // Deterministic jitter: the same artwork must preview identically every
  // time, so this is a hash of the position rather than Math.random().
  const wobble = (a, b) => {
    const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return (s - Math.floor(s)) - 0.5;
  };

  // A real fill stitch is about 3.5mm; clamp so tiny art still gets several
  // stitches per row and huge art does not explode the element count.
  const stitchPx = Math.max(3, Math.min(22, 3.5 / mmPerPx));
  const shadowLayer = [];
  let count = 0;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  const bodyLayers = [];

  for (const [id, components] of groups) {
    if (!components.length) continue;
    const rgb = threadColor.get(id) ?? [0, 0, 0];

    for (const component of components) {
      const { pixels, left, right, top, bottom } = component;
      const mask = new Set(pixels);
      const bw = right - left + 1, bh = bottom - top + 1;
      const thin = Math.min(bw, bh) * mmPerPx < 2.8;

      // Fill runs along the shape; satin runs across it.
      const axis = principalAngle(pixels, w);
      const radians = thin ? axis + Math.PI / 2 : axis;
      const dx = Math.cos(radians), dy = Math.sin(radians);
      const nx = -dy, ny = dx;
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      const radius = Math.hypot(bw, bh);
      // Satin packs tighter than fill — that density is what gives it sheen.
      const step = thin ? Math.max(1.4, pitch * 0.62) : pitch;
      const lineWidth = thin ? Math.max(0.8, step * 1.05) : Math.max(0.7, step * 0.92);

      const body = [], high = [], dark = [];
      for (let offset = -radius; offset <= radius; offset += step) {
        // Walk the row, collecting inside spans.
        const spans = [];
        let spanStart = null, spanEnd = null;
        for (let t = -radius; t <= radius; t += 0.8) {
          const px = cx + nx * offset + dx * t, py = cy + ny * offset + dy * t;
          const ix = Math.round(px), iy = Math.round(py);
          const inside = ix >= left && ix <= right && iy >= top && iy <= bottom && mask.has(iy * w + ix);
          if (inside) { if (spanStart === null) spanStart = t; spanEnd = t; }
          else if (spanStart !== null) { spans.push([spanStart, spanEnd]); spanStart = spanEnd = null; }
        }
        if (spanStart !== null) spans.push([spanStart, spanEnd]);

        for (const [t0, t1] of spans) {
          const length = t1 - t0;
          if (length < 1.2) continue;
          // Satin crosses the shape in ONE stitch; fill is broken into a run
          // of them with a needle gap, which is what you actually see.
          const perStitch = thin ? length : Math.min(length, stitchPx);
          const stitches = Math.max(1, Math.round(length / perStitch));
          const span = length / stitches;
          for (let s = 0; s < stitches; s++) {
            const gap = thin ? 0 : Math.min(0.5, span * 0.12);
            const a = t0 + s * span;
            const b = a + span - gap;
            if (b - a < 0.8) continue;
            const j1 = wobble(offset, a) * 0.3, j2 = wobble(offset, b) * 0.3;
            const ax = cx + nx * (offset + j1) + dx * a, ay = cy + ny * (offset + j1) + dy * a;
            const bx = cx + nx * (offset + j2) + dx * b, by = cy + ny * (offset + j2) + dy * b;
            const seg = (ox, oy) =>
              `M${(ax + ox).toFixed(1)},${(ay + oy).toFixed(1)}L${(bx + ox).toFixed(1)},${(by + oy).toFixed(1)}`;
            // Offsets are across the stitch, so the lit edge is always the
            // same side of the thread no matter which way the row runs.
            dark.push(seg(nx * lineWidth * 0.22, ny * lineWidth * 0.22));
            body.push(seg(0, 0));
            high.push(seg(-nx * lineWidth * 0.26, -ny * lineWidth * 0.26));
            shadowLayer.push(seg(0.55, 0.8));
            count++;
          }
        }
      }
      if (!body.length) continue;
      // Painted dark → body → highlight so the lit edge survives overlap.
      bodyLayers.push(
        `<path d="${dark.join('')}" stroke="${hex(darken(rgb, 0.42))}" stroke-width="${(lineWidth * 1.04).toFixed(2)}" stroke-linecap="round" fill="none"/>`,
        `<path d="${body.join('')}" stroke="${hex(rgb)}" stroke-width="${(lineWidth * 0.86).toFixed(2)}" stroke-linecap="round" fill="none"/>`,
        `<path d="${high.join('')}" stroke="${hex(lighten(rgb, 0.45))}" stroke-width="${(lineWidth * 0.3).toFixed(2)}" stroke-linecap="round" stroke-opacity="0.75" fill="none"/>`,
      );
    }
  }

  // Contact shadow first, so the stitching sits proud of the garment
  // instead of looking printed onto it.
  if (shadowLayer.length) {
    parts.push(`<path d="${shadowLayer.join('')}" stroke="#000000" stroke-width="${Math.max(0.9, pitch * 0.95).toFixed(2)}" stroke-opacity="0.22" stroke-linecap="round" fill="none"/>`);
  }
  parts.push(...bodyLayers);
  parts.push('</svg>');

  const rendered = await sharp(Buffer.from(parts.join('')), { density: 144 }).png().toBuffer();
  return {
    data_url: `data:image/png;base64,${rendered.toString('base64')}`,
    width: w,
    height: h,
    stitch_segments: count,
    preview_mode: 'object-aware-stitch-plan',
    disclaimer: 'Illustrative stitch geometry, not sew-ready DST. Digitizing, underlay, travel, tie-ins, trims and pull compensation are not modeled.',
  };
}
