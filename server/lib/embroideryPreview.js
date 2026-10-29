import sharp from 'sharp';

/**
 * Geometry-first stitch PLAN visualization. This is not a machine-ready
 * digitization: paths have not been optimized for travel, tie-ins or pull.
 * Color regions are segmented independently; fill rows are explicit lines.
 */
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
  const dominant = ranked.filter(p => p.n >= Math.max(24, w * h * .002)).slice(0, 12).map(p => p.id);
  const keep = new Set(dominant);
  // Representative RGB values are computed below from the source image.
  const representatives = dominant.map(id => {
    const p = palette[id];
    return [p.r / Math.max(1, p.n), p.g / Math.max(1, p.n), p.b / Math.max(1, p.n)];
  });
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
  const parts = [];
  let count = 0;
  const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  let groupIndex = 0;
  for (const [id, components] of groups) {
    
    
    const sample = components[0]?.pixels[0];
    if (sample === undefined) continue;
    const rgb = [data[sample * 4], data[sample * 4 + 1], data[sample * 4 + 2]];
    const color = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
    for (const component of components) {
      const { pixels, left, right, top, bottom } = component;
      const mask = new Set(pixels);
      const bw = right - left + 1, bh = bottom - top + 1;
      // Thin regions use closely spaced transverse segments (satin-like).
      // Broad regions use alternate 0/45/90 degree fill rows.
      const thin = Math.min(bw, bh) * mmPerPx < 2.8;
      const angle = thin ? (bw >= bh ? 90 : 0) : [0, 45, 90, 135][groupIndex % 4];
      groupIndex++;
      const radians = angle * Math.PI / 180;
      const dx = Math.cos(radians), dy = Math.sin(radians);
      const nx = -dy, ny = dx;
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      const radius = Math.hypot(bw, bh);
      const step = thin ? Math.max(1.5, pitch * .75) : pitch;
      const lineWidth = thin ? Math.max(.65, step * .42) : Math.max(.55, step * .3);
      const segments = [];
      for (let offset = -radius; offset <= radius; offset += step) {
        let start = null, last = null;
        for (let t = -radius; t <= radius; t += .8) {
          const px = cx + nx * offset + dx * t, py = cy + ny * offset + dy * t;
          const ix = Math.round(px), iy = Math.round(py);
          const inside = ix >= left && ix <= right && iy >= top && iy <= bottom && mask.has(iy * w + ix);
          if (inside) { if (!start) start = [px, py]; last = [px, py]; }
          else if (start && last) {
            if (Math.hypot(last[0] - start[0], last[1] - start[1]) >= 1.3)
              segments.push(`M${start[0].toFixed(1)},${start[1].toFixed(1)}L${last[0].toFixed(1)},${last[1].toFixed(1)}`);
            start = last = null;
          }
        }
        if (start && last) segments.push(`M${start[0].toFixed(1)},${start[1].toFixed(1)}L${last[0].toFixed(1)},${last[1].toFixed(1)}`);
      }
      if (segments.length) {
        parts.push(`<path d="${escape(segments.join(''))}" stroke="${color}" stroke-width="${lineWidth.toFixed(2)}" stroke-linecap="round" fill="none"/>`);
        count += segments.length;
      }
    }
  }
  parts.push('</svg>');
  const rendered = await sharp(Buffer.from(parts.join('')), { density: 144 }).png().toBuffer();
  return { data_url: `data:image/png;base64,${rendered.toString('base64')}`, width: w, height: h,
    stitch_segments: count, preview_mode: 'object-aware-stitch-plan',
    disclaimer: 'Illustrative stitch geometry, not sew-ready DST. Digitizing, underlay, travel, tie-ins, trims and pull compensation are not modeled.' };
}
