/**
 * S3-compatible storage driver (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, ...).
 *
 * Requires the optional packages:
 *   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 *
 * Videos are uploaded privately and served by redirecting the (already
 * authorised) viewer to a short-lived presigned URL, so the bucket never
 * needs to be public.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

let client = null;
let sdk = null;

function load() {
  if (client) return;
  try {
    sdk = {
      ...require('@aws-sdk/client-s3'),
      ...require('@aws-sdk/s3-request-presigner'),
    };
  } catch {
    throw new Error(
      'S3 storage driver selected but AWS SDK is missing. Run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner'
    );
  }
  const s3 = config.storage.s3;
  if (!s3.bucket) throw new Error('S3_BUCKET is not configured');
  client = new sdk.S3Client({
    region: s3.region,
    endpoint: s3.endpoint,
    forcePathStyle: s3.forcePathStyle,
    credentials: s3.accessKeyId
      ? { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey }
      : undefined,
  });
}

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

module.exports = {
  name: 's3',

  async save(tempFilePath, { originalName, mimeType }) {
    load();
    const key = `videos/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt(originalName)}`;
    const { size } = await fsp.stat(tempFilePath);
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: key,
        Body: fs.createReadStream(tempFilePath),
        ContentType: mimeType || 'video/mp4',
        ContentLength: size,
      })
    );
    await fsp.unlink(tempFilePath).catch(() => {});
    return { key, size };
  },

  async delete(key) {
    if (!key) return;
    load();
    await client
      .send(new sdk.DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }))
      .catch(() => {});
  },

  async serve(key, req, res) {
    load();
    const url = await sdk.getSignedUrl(
      client,
      new sdk.GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
      { expiresIn: 60 * 60 } // 1 hour
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(302, url);
  },
};
