const express = require('express');
const { verifyPassword } = require('../passwords');
const { hasUnlocked, unlockPack, isAdmin } = require('../auth');
const q = require('../queries');

const router = express.Router();

/** Shape an item for the public site – never expose storage keys. */
function publicItem(item) {
  const base = { id: item.id, type: item.type, title: item.title, position: item.position };
  if (item.type === 'link') return { ...base, url: item.url };
  // video: uploaded videos are streamed via the protected media route
  return {
    ...base,
    source: item.storage_key ? 'upload' : 'external',
    url: item.storage_key ? `/media/${item.id}` : item.url,
    mime_type: item.mime_type || null,
  };
}

// GET /api/packs -> pack cards for the homepage
router.get('/packs', (req, res) => {
  const packs = q.listPacks().map((p) => ({
    ...p,
    unlocked: hasUnlocked(req, p.id),
    category_count: q.listCategories(p.id).length,
  }));
  res.json({ packs, admin: isAdmin(req) });
});

// POST /api/packs/:id/unlock { password }
router.post('/packs/:id/unlock', (req, res) => {
  const pack = q.getPack(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  const password = (req.body && req.body.password) || '';
  if (!verifyPassword(password, pack.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  unlockPack(req, pack.id);
  res.json({ ok: true });
});

// POST /api/packs/:id/lock -> forget the unlock for this session
router.post('/packs/:id/lock', (req, res) => {
  const id = Number(req.params.id);
  req.session.unlocked = (req.session.unlocked || []).filter((x) => Number(x) !== id);
  res.json({ ok: true });
});

// GET /api/packs/:id -> full content, only when unlocked
router.get('/packs/:id', (req, res) => {
  const pack = q.getPack(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  if (!hasUnlocked(req, pack.id)) return res.status(403).json({ error: 'Pack is locked', locked: true });

  const tree = q.getPackTree(pack.id);
  res.json({
    id: tree.id,
    slug: tree.slug,
    name: tree.name,
    description: tree.description,
    price: tree.price,
    currency: tree.currency,
    icon: tree.icon || '📦',
    categories: tree.categories.map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      items: c.items.map(publicItem),
    })),
  });
});

module.exports = router;
