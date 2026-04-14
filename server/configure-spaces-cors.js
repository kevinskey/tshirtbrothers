// One-time setup: configure CORS on the DO Spaces bucket so that the admin
// gang-sheet builder can load images with crossOrigin="anonymous" (required
// for canvas PNG export).
//
// Run on the droplet:
//   cd /var/www/tshirtbrothers/server
//   node configure-spaces-cors.js
//
// Safe to re-run; PutBucketCors overwrites the existing rules.

import 'dotenv/config';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

const bucket = process.env.SPACES_BUCKET || 'tshirtbrothers';
const region = process.env.SPACES_REGION || 'atl1';
const key = process.env.SPACES_KEY;
const secret = process.env.SPACES_SECRET;

if (!key || !secret) {
  console.error('Missing SPACES_KEY / SPACES_SECRET in env.');
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: `https://${region}.digitaloceanspaces.com`,
  region,
  credentials: { accessKeyId: key, secretAccessKey: secret },
});

const rules = {
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
        MaxAgeSeconds: 3600,
      },
    ],
  },
};

async function main() {
  console.log(`Applying CORS to bucket "${bucket}" in region "${region}"...`);
  await s3.send(new PutBucketCorsCommand(rules));
  console.log('✓ Applied.');

  const current = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log('Current CORS config:');
  console.log(JSON.stringify(current.CORSRules, null, 2));
}

main().catch((err) => {
  console.error('Failed to apply CORS:', err.message);
  process.exit(1);
});
