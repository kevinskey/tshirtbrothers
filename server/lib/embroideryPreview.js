import sharp from 'sharp';

/** Deterministic thread-style visualization, not digitized stitch geometry.
 *  Keep the source silhouette/alpha; never add a garment or background. */
export async function renderEmbroideryPreview(png, { widthIn, spacingMm = 0.42 }) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const output = Buffer.from(data);
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 245) { transparent = true; break; }
  // Match the estimator's treatment of an opaque white canvas.
  const alphaAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const i = (y * width + x) * 4;
    return !transparent && Math.min(data[i], data[i + 1], data[i + 2]) >= 245 ? 0 : data[i + 3];
  };
  const pixelsPerMm = width / (widthIn * 25.4);
  const rowPitch = Math.max(3, Math.min(8, pixelsPerMm * spacingMm));
  const stitchLength = Math.max(10, pixelsPerMm * 2.8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = alphaAt(x, y);
      output[i + 3] = alpha;
      if (!alpha) continue;
      // Diagonal fill rows with staggered stitch ends and fine thread fibers.
      // Light neutral lettering stitches across the colored fill direction.
      const neutral = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) < 24;
      const across = (x + (neutral ? -y : y)) / Math.SQRT2;
      const along = (x + (neutral ? y : -y)) / Math.SQRT2;
      const row = Math.floor(across / rowPitch);
      const phase = ((across / rowPitch) % 1 + 1) % 1;
      const end = ((along + (row % 2) * stitchLength / 2) % stitchLength + stitchLength) % stitchLength;
      const ridge = Math.sin(phase * Math.PI);
      const fiber = Math.sin(along * 2.4 + row * 0.7) * 0.025;
      const border = Math.min(alphaAt(x - 1, y - 1), alphaAt(x + 1, y + 1)) < alpha * 0.5;
      const shade = 0.74 + ridge * 0.28 + fiber - (end < 1 ? 0.16 : 0) - (border ? 0.10 : 0);
      const sheen = Math.max(0, Math.sin((phase - 0.12) * Math.PI * 2)) * 14;
      for (let channel = 0; channel < 3; channel++) {
        output[i + channel] = Math.max(0, Math.min(255, Math.round(data[i + channel] * shade + sheen)));
      }
    }
  }
  const rendered = await sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { data_url: `data:image/png;base64,${rendered.toString('base64')}`, width, height,
    disclaimer: 'Simulated thread texture for mockups; actual digitized embroidery will differ.' };
}
