const { getSetting } = require('./db');
const { verifyPassword } = require('./passwords');

function isAdmin(req) {
  return Boolean(req.session && req.session.admin === true);
}

function unlockedPackIds(req) {
  const list = req.session && Array.isArray(req.session.unlocked) ? req.session.unlocked : [];
  return list.map(Number);
}

function hasUnlocked(req, packId) {
  return isAdmin(req) || unlockedPackIds(req).includes(Number(packId));
}

function unlockPack(req, packId) {
  const set = new Set(unlockedPackIds(req));
  set.add(Number(packId));
  req.session.unlocked = [...set];
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(401).json({ error: 'Admin login required' });
}

function checkAdminPassword(password) {
  return verifyPassword(password, getSetting('admin_password_hash'));
}

module.exports = { isAdmin, hasUnlocked, unlockPack, unlockedPackIds, requireAdmin, checkAdminPassword };
