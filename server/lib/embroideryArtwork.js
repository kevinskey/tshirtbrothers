import sharp from 'sharp';

// One explicit foreground mask shared by counting and previewing.
export async function prepareEmbroideryArtwork(source, { trim = true, background = 'remove_white_edges', widthIn, heightIn }) {
  const image = sharp(source, { limitInputPixels: 12_000_000, animated: false });
  const meta = await image.metadata();
  if (meta.format !== 'png' || (meta.pages || 1) > 1) throw new Error('Use a still PNG under 12 megapixels.');
  const { data, info: { width, height } } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (background === 'remove_white_edges') {
    // Flood only edge-connected white. Enclosed white lettering remains intact.
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0, tail = 0;
    const add = (p) => {
      if (visited[p]) return;
      visited[p] = 1;
      const i = p * 4;
      if (data[i + 3] < 8 || Math.min(data[i], data[i + 1], data[i + 2]) >= 245) queue[tail++] = p;
    };
    for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      data[p * 4 + 3] = 0;
      if (x) add(p - 1); if (x < width - 1) add(p + 1);
      if (y) add(p - width); if (y < height - 1) add(p + width);
    }
  }
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] >= 128) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error('No visible artwork. Try Keep all colors.');
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const crop = trim ? bounds : { left: 0, top: 0, width, height };
  const finishedHeight = heightIn ?? widthIn * crop.height / crop.width;
  if (finishedHeight < 0.25 || finishedHeight > 20) throw new Error('Finished height must be 0.25–20 inches.');
  const ratio = widthIn / finishedHeight;
  const maxEdge = heightIn == null ? Math.min(1200, Math.max(crop.width, crop.height)) : 1200;
  const outWidth = Math.max(1, Math.round(ratio >= 1 ? maxEdge : maxEdge * ratio));
  const outHeight = Math.max(1, Math.round(ratio >= 1 ? maxEdge / ratio : maxEdge));
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).extract(crop)
    .resize(outWidth, outHeight, { fit: 'fill' }).png().toBuffer();
  return { png, width_in: widthIn, height_in: finishedHeight, bounds, original: { width, height }, trim, background };
}
