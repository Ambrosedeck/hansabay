/**
 * Local disk storage driver.
 * Files are stored under UPLOAD_DIR and streamed through the protected
 * /media/:id route with HTTP Range support so <video> can seek.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const uploadDir = config.storage.uploadDir;
fs.mkdirSync(uploadDir, { recursive: true });

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

function resolveKey(key) {
  // Prevent path traversal – keys are always flat file names we generated.
  const full = path.join(uploadDir, path.basename(key));
  if (!full.startsWith(uploadDir)) throw new Error('Invalid storage key');
  return full;
}

module.exports = {
  name: 'local',

  async save(tempFilePath, { originalName }) {
    const key = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt(originalName)}`;
    const dest = resolveKey(key);
    try {
      await fsp.rename(tempFilePath, dest);
    } catch {
      // rename fails across devices/partitions – fall back to copy + unlink
      await fsp.copyFile(tempFilePath, dest);
      await fsp.unlink(tempFilePath).catch(() => {});
    }
    const { size } = await fsp.stat(dest);
    return { key, size };
  },

  async delete(key) {
    if (!key) return;
    await fsp.unlink(resolveKey(key)).catch(() => {});
  },

  async serve(key, req, res, { mimeType } = {}) {
    const filePath = resolveKey(key);
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    const total = stat.size;
    const contentType = mimeType || 'video/mp4';
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      let start = match[1] === '' ? 0 : parseInt(match[1], 10);
      let end = match[2] === '' ? total - 1 : parseInt(match[2], 10);
      if (match[1] === '' && match[2] !== '') {
        // suffix range: last N bytes
        start = Math.max(total - parseInt(match[2], 10), 0);
        end = total - 1;
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      end = Math.min(end, total - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', total);
      fs.createReadStream(filePath).pipe(res);
    }
  },
};
