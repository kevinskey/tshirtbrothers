// Server-side mockup composite renderer.
//
// Takes a product image URL, a graphic URL, and a placement (in % of product
// dims), produces a single flattened PNG, uploads it to DO Spaces, and
// returns the public URL. This is the canonical mockup image that every
// page (admin grid, customer approval, quote view) renders, so sizes stay
// identical across flows.

import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Reference render size. All composites are produced at this size so the
// image looks identical regardless of the original product photo's pixel
// dimensions. Aspect is preserved by fitting the product into a square.
const RENDER_SIZE = 1200;

function s3Client() {
  const spacesKey = process.env.SPACES_KEY;
  const spacesSecret = process.env.SPACES_SECRET;
  if (!spacesKey || !spacesSecret) {
    throw new Error('SPACES_KEY / SPACES_SECRET not configured');
  }
  const region = process.env.SPACES_REGION || 'atl1';
  return new S3Client({
    endpoint: process.env.SPACES_ENDPOINT?.replace('nyc3', region) || `https://${region}.digitaloceanspaces.com`,
    region,
    credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
  });
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// placement: { x, y, width, rotation? } in % of product image dimensions.
// x/y is the top-left of the graphic. width is the graphic's width as a
// percent of the product width; height is derived from the graphic's
// natural aspect ratio.
export async function renderMockupComposite({ productImageUrl, graphicUrl, placement }) {
  if (!productImageUrl) throw new Error('productImageUrl required');
  if (!graphicUrl) throw new Error('graphicUrl required');
  const pl = placement || { x: 35, y: 30, width: 30, rotation: 0 };

  const [productBuf, graphicBuf] = await Promise.all([
    fetchBuffer(productImageUrl),
    fetchBuffer(graphicUrl),
  ]);

  // Normalize the product to a fixed square canvas, preserving aspect
  // (transparent letterbox). Doing this on the server means every page
  // ends up showing exactly the same composite at exactly the same size.
  const productPng = await sharp(productBuf)
    .resize({
      width: RENDER_SIZE,
      height: RENDER_SIZE,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  const graphicTargetWidth = Math.max(8, Math.round((pl.width / 100) * RENDER_SIZE));

  let graphic = sharp(graphicBuf).resize({ width: graphicTargetWidth });
  if (pl.rotation) {
    graphic = graphic.rotate(pl.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  const graphicBufResized = await graphic.png().toBuffer();
  const graphicMeta = await sharp(graphicBufResized).metadata();
  const gw = graphicMeta.width || graphicTargetWidth;
  const gh = graphicMeta.height || graphicTargetWidth;

  // Top-left placement in pixels
  const desiredLeft = Math.round((pl.x / 100) * RENDER_SIZE);
  const desiredTop = Math.round((pl.y / 100) * RENDER_SIZE);

  // Clip the graphic to the visible region so sharp's composite never
  // throws "image to composite must have same dimensions or smaller."
  const extractLeft = desiredLeft < 0 ? -desiredLeft : 0;
  const extractTop = desiredTop < 0 ? -desiredTop : 0;
  const extractWidth = Math.min(gw - extractLeft, RENDER_SIZE - Math.max(0, desiredLeft));
  const extractHeight = Math.min(gh - extractTop, RENDER_SIZE - Math.max(0, desiredTop));

  if (extractWidth <= 0 || extractHeight <= 0) {
    // Graphic placed entirely off-canvas; just return the product image.
    return uploadPng(productPng);
  }

  let placed = graphicBufResized;
  if (
    extractLeft !== 0 || extractTop !== 0 ||
    extractWidth !== gw || extractHeight !== gh
  ) {
    placed = await sharp(graphicBufResized)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: extractWidth,
        height: extractHeight,
      })
      .toBuffer();
  }

  const finalLeft = Math.max(0, desiredLeft);
  const finalTop = Math.max(0, desiredTop);

  const composedBuf = await sharp(productPng)
    .composite([{ input: placed, left: finalLeft, top: finalTop }])
    .png()
    .toBuffer();

  return uploadPng(composedBuf);
}

async function uploadPng(buffer) {
  const region = process.env.SPACES_REGION || 'atl1';
  const bucket = process.env.SPACES_BUCKET || 'tshirtbrothers';
  const key = `mockups/composites/composite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  await s3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    ACL: 'public-read',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${key}`;
}
