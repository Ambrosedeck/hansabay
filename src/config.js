require('dotenv').config();
const path = require('path');

const root = path.resolve(__dirname, '..');

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.join(root, p);
}

module.exports = {
  root,
  port: Number(process.env.PORT) || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  isProduction: process.env.NODE_ENV === 'production',

  seed: {
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    starterPassword: process.env.STARTER_PASSWORD || 'starter123',
    boosterPassword: process.env.BOOSTER_PASSWORD || 'booster123',
    premiumPassword: process.env.PREMIUM_PASSWORD || 'premium123',
  },

  databasePath: resolvePath(process.env.DATABASE_PATH || './data/app.db'),

  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    uploadDir: resolvePath(process.env.UPLOAD_DIR || './data/uploads'),
    maxUploadBytes: (Number(process.env.MAX_UPLOAD_MB) || 2048) * 1024 * 1024,
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  },
};
