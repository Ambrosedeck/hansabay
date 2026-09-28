const crypto = require('crypto');
const config = require('./config');
const { db, getSetting } = require('./db');
const { verifyPassword } = require('./passwords');

function getPackPasswordHashShort(packId) {
  try {
    const row = db.prepare('SELECT password_hash FROM packs WHERE id = ?').get(Number(packId));
    return row ? row.password_hash.slice(-10) : '';
  } catch {
    return '';
  }
}

function createUnlockToken(packsMap) {
  // packsMap is { [packId]: hashShort }
  const payload = {
    p: packsMap || {},
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const dataB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

function verifyUnlockToken(token) {
  if (!token || typeof token !== 'string') return {};
  const parts = token.split('.');
  if (parts.length !== 2) return {};
  const [dataB64, sig] = parts;
  if (!dataB64 || !sig) return {};
  const expectedSig = crypto.createHmac('sha256', config.sessionSecret).update(dataB64).digest('base64url');
  if (sig !== expectedSig) return {};
  try {
    const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return {};
    return payload.p && typeof payload.p === 'object' ? payload.p : {};
  } catch {
    return {};
  }
}

function isAdmin(req) {
  return Boolean(req.session && req.session.admin === true);
}

function getUnlockedMap(req) {
  const map = {};

  // From session
  if (req.session && req.session.unlocked_packs && typeof req.session.unlocked_packs === 'object') {
    Object.assign(map, req.session.unlocked_packs);
  } else if (req.session && Array.isArray(req.session.unlocked)) {
    // Backwards compatibility with array of ids
    for (const id of req.session.unlocked) {
      map[id] = getPackPasswordHashShort(id);
    }
  }

  // From X-Pack-Token header or query param
  const token = (req.headers && req.headers['x-pack-token']) || (req.query && req.query.token);
  if (token) {
    const fromToken = verifyUnlockToken(token);
    Object.assign(map, fromToken);
  }

  return map;
}

function unlockedPackIds(req) {
  const map = getUnlockedMap(req);
  const validIds = [];

  for (const [idStr, hashShort] of Object.entries(map)) {
    const id = Number(idStr);
    if (!id) continue;
    // Check if pack still exists and password has not been changed by admin
    const currentHash = getPackPasswordHashShort(id);
    if (currentHash && (!hashShort || hashShort === currentHash)) {
      validIds.push(id);
    }
  }

  return validIds;
}

function hasUnlocked(req, packId) {
  if (isAdmin(req)) return true;
  return unlockedPackIds(req).includes(Number(packId));
}

function unlockPack(req, packId) {
  const id = Number(packId);
  const map = getUnlockedMap(req);
  map[id] = getPackPasswordHashShort(id);

  if (req.session) {
    req.session.unlocked_packs = map;
    req.session.unlocked = Object.keys(map).map(Number);
  }

  return createUnlockToken(map);
}

function lockPack(req, packId) {
  const id = Number(packId);
  const map = getUnlockedMap(req);
  delete map[id];

  if (req.session) {
    req.session.unlocked_packs = map;
    req.session.unlocked = Object.keys(map).map(Number);
  }

  return createUnlockToken(map);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(401).json({ error: 'Admin login required' });
}

function checkAdminPassword(password) {
  return verifyPassword(password, getSetting('admin_password_hash'));
}

module.exports = {
  isAdmin,
  hasUnlocked,
  unlockPack,
  lockPack,
  unlockedPackIds,
  requireAdmin,
  checkAdminPassword,
  createUnlockToken,
  verifyUnlockToken,
};
