// Shared DO Spaces client + uploader.
//
// The previous setup had three copies of "build an S3Client and assemble a
// public URL" scattered across quotes.js, designs.js, and composite.js. Two
// of them used the SPACES_ENDPOINT env var raw; one of them (quotes.js) had
// learned to swap "nyc3" -> the configured region because the env was left
// pointing at DO's default endpoint. Result: uploads through some routes
// went to the wrong region and the public URLs we stored 404'd. This module
// resolves the endpoint once, consistently, so every uploader behaves the
// same way.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const SPACES_REGION = process.env.SPACES_REGION || 'atl1';
export const SPACES_BUCKET = process.env.SPACES_BUCKET || 'tshirtbrothers';

// Force the endpoint to match SPACES_REGION even if the env var still points
// at DO's nyc3 default. Falls back to a sane regional endpoint if unset.
export const SPACES_ENDPOINT = (() => {
  const raw = process.env.SPACES_ENDPOINT;
  if (!raw) return `https://${SPACES_REGION}.digitaloceanspaces.com`;
  return raw.replace(/\b(nyc3|nyc1|nyc2|sfo2|sfo3|ams3|sgp1|fra1|syd1|blr1|atl1)\b/, SPACES_REGION);
})();

let _client = null;
export function getSpacesClient() {
  const accessKeyId = process.env.SPACES_KEY;
  const secretAccessKey = process.env.SPACES_SECRET;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('SPACES_KEY / SPACES_SECRET not configured');
  }
  if (!_client) {
    _client = new S3Client({
      endpoint: SPACES_ENDPOINT,
      region: SPACES_REGION,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

// Build the public CDN URL for a given key. All callers should use this so
// the URL we hand out always matches the bucket the file actually went to.
export function publicUrl(key) {
  return `https://${SPACES_BUCKET}.${SPACES_REGION}.cdn.digitaloceanspaces.com/${key}`;
}

// Upload a Buffer or base64 data URL to a given key under the configured
// bucket and return the public CDN URL. Always public-read; everything in
// this app is meant to be embeddable in customer-facing pages.
export async function uploadObject({
  key,
  body,
  contentType = 'image/png',
  cacheControl,
}) {
  if (!key) throw new Error('key required');
  if (!body) throw new Error('body required');

  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(String(body).replace(/^data:[^;]+;base64,/, ''), 'base64');

  await getSpacesClient().send(new PutObjectCommand({
    Bucket: SPACES_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
  }));

  return publicUrl(key);
}
