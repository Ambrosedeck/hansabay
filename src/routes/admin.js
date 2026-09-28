const express = require('express');
const os = require('os');
const fsp = require('fs/promises');
const multer = require('multer');
const config = require('../config');
const { db, setSetting } = require('../db');
const { hashPassword } = require('../passwords');
const { requireAdmin, checkAdminPassword } = require('../auth');
const q = require('../queries');
const storage = require('../storage');

const router = express.Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: config.storage.maxUploadBytes },
  fileFilter(req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Only video files can be uploaded'));
  },
});

function text(v, max = 500) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function isValidUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------- Auth ----------
router.post('/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (!checkAdminPassword(password)) return res.status(401).json({ error: 'Incorrect admin password' });
  req.session.admin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  if (req.session) req.session.admin = false;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ admin: Boolean(req.session && req.session.admin) });
});

// Everything below needs admin
router.use(requireAdmin);

router.put('/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!checkAdminPassword(current || '')) return res.status(401).json({ error: 'Current password is incorrect' });
  if (!next || String(next).length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
  setSetting('admin_password_hash', hashPassword(next));
  res.json({ ok: true });
});

// ---------- Overview ----------
router.get('/overview', (req, res) => {
  const packs = q.listPacks().map((p) => q.getPackTree(p.id));
  res.json({ packs, storageDriver: config.storage.driver, maxUploadMb: config.storage.maxUploadBytes / 1024 / 1024 });
});

// ---------- Packs ----------
router.put('/packs/:id', (req, res) => {
  const pack = q.getPack(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  const body = req.body || {};

  const name = body.name !== undefined ? text(body.name, 80) : pack.name;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const description = body.description !== undefined ? text(body.description, 1000) : pack.description;
  let price = pack.price;
  if (body.price !== undefined) {
    price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be a non-negative number' });
  }
  const currency = body.currency !== undefined ? text(body.currency, 8).toUpperCase() || pack.currency : pack.currency;

  let passwordHash = pack.password_hash;
  if (body.password) {
    if (String(body.password).length < 3) return res.status(400).json({ error: 'Pack password must be at least 3 characters' });
    passwordHash = hashPassword(body.password);
  }

  db.prepare(
    'UPDATE packs SET name = ?, description = ?, price = ?, currency = ?, password_hash = ? WHERE id = ?'
  ).run(name, description, price, currency, passwordHash, pack.id);

  res.json({ pack: q.getPackTree(pack.id) });
});

// ---------- Categories ----------
router.post('/categories', (req, res) => {
  const { pack_id, name } = req.body || {};
  const pack = q.getPack(pack_id);
  if (!pack) return res.status(400).json({ error: 'Choose a valid pack' });
  const cleanName = text(name, 80);
  if (!cleanName) return res.status(400).json({ error: 'Category name is required' });

  const info = db
    .prepare('INSERT INTO categories (pack_id, name, position) VALUES (?, ?, ?)')
    .run(pack.id, cleanName, q.nextPosition('categories', 'pack_id', pack.id));
  res.status(201).json({ category: q.getCategory(info.lastInsertRowid) });
});

router.put('/categories/:id', (req, res) => {
  const cat = q.getCategory(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const body = req.body || {};

  const name = body.name !== undefined ? text(body.name, 80) : cat.name;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  let packId = cat.pack_id;
  let position = cat.position;
  if (body.pack_id !== undefined && Number(body.pack_id) !== cat.pack_id) {
    const pack = q.getPack(body.pack_id);
    if (!pack) return res.status(400).json({ error: 'Choose a valid pack' });
    packId = pack.id;
    position = q.nextPosition('categories', 'pack_id', packId); // moved categories go to the end
  }

  db.prepare('UPDATE categories SET name = ?, pack_id = ?, position = ? WHERE id = ?').run(name, packId, position, cat.id);
  res.json({ category: q.getCategory(cat.id) });
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const cat = q.getCategory(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const items = q.listItems(cat.id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id); // cascades to items
    // Remove uploaded files after the DB row is gone
    for (const item of items) {
      if (item.storage_key) await storage.getDriver(item.storage_driver || 'local').delete(item.storage_key);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /categories/reorder { pack_id, order: [categoryId, ...] }
router.post('/categories/reorder', (req, res) => {
  const { pack_id, order } = req.body || {};
  if (!q.getPack(pack_id)) return res.status(400).json({ error: 'Choose a valid pack' });
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });
  q.reorder('categories', 'pack_id', pack_id, order);
  res.json({ categories: q.listCategories(pack_id) });
});

// ---------- Items (videos & links) ----------
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Max is ${config.storage.maxUploadBytes / 1024 / 1024} MB` });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

async function discardTemp(file) {
  if (file && file.path) await fsp.unlink(file.path).catch(() => {});
}

// POST /items  (multipart or JSON)
// fields: type ('video'|'link'), title, category_id, url (link / external video), file (uploaded video)
router.post('/items', handleUpload, async (req, res, next) => {
  try {
    const body = req.body || {};
    const type = body.type === 'link' ? 'link' : body.type === 'video' ? 'video' : null;
    if (!type) {
      await discardTemp(req.file);
      return res.status(400).json({ error: 'type must be "video" or "link"' });
    }
    const category = q.getCategory(body.category_id);
    if (!category) {
      await discardTemp(req.file);
      return res.status(400).json({ error: 'Choose a valid category' });
    }
    const title = text(body.title, 200);
    if (!title) {
      await discardTemp(req.file);
      return res.status(400).json({ error: 'Title is required' });
    }

    let url = null;
    let storageDriver = null;
    let storageKey = null;
    let mimeType = null;
    let size = null;

    if (type === 'link') {
      await discardTemp(req.file);
      url = text(body.url, 2000);
      if (!isValidUrl(url)) return res.status(400).json({ error: 'Enter a valid http(s) URL' });
    } else if (req.file) {
      const driver = storage.active;
      const saved = await driver.save(req.file.path, { originalName: req.file.originalname, mimeType: req.file.mimetype });
      storageDriver = driver.name;
      storageKey = saved.key;
      mimeType = req.file.mimetype;
      size = saved.size;
    } else {
      url = text(body.url, 2000);
      if (!isValidUrl(url)) return res.status(400).json({ error: 'Upload a video file or enter a valid video URL' });
    }

    const info = db
      .prepare(
        `INSERT INTO items (category_id, type, title, url, storage_driver, storage_key, mime_type, size_bytes, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(category.id, type, title, url, storageDriver, storageKey, mimeType, size, q.nextPosition('items', 'category_id', category.id));

    res.status(201).json({ item: q.getItem(info.lastInsertRowid) });
  } catch (err) {
    await discardTemp(req.file);
    next(err);
  }
});

// PUT /items/:id  (multipart or JSON) – edit title/url/category, optionally replace the video file
router.put('/items/:id', handleUpload, async (req, res, next) => {
  try {
    const item = q.getItem(req.params.id);
    if (!item) {
      await discardTemp(req.file);
      return res.status(404).json({ error: 'Item not found' });
    }
    const body = req.body || {};

    const title = body.title !== undefined ? text(body.title, 200) : item.title;
    if (!title) {
      await discardTemp(req.file);
      return res.status(400).json({ error: 'Title is required' });
    }

    let categoryId = item.category_id;
    let position = item.position;
    if (body.category_id !== undefined && Number(body.category_id) !== item.category_id) {
      const cat = q.getCategory(body.category_id);
      if (!cat) {
        await discardTemp(req.file);
        return res.status(400).json({ error: 'Choose a valid category' });
      }
      categoryId = cat.id;
      position = q.nextPosition('items', 'category_id', categoryId); // moved items go to the end
    }

    let { url, storage_driver: storageDriver, storage_key: storageKey, mime_type: mimeType, size_bytes: size } = item;
    let oldFile = null;

    if (item.type === 'link') {
      await discardTemp(req.file);
      if (body.url !== undefined) {
        url = text(body.url, 2000);
        if (!isValidUrl(url)) return res.status(400).json({ error: 'Enter a valid http(s) URL' });
      }
    } else if (req.file) {
      // Replace the video with a new upload
      const driver = storage.active;
      const saved = await driver.save(req.file.path, { originalName: req.file.originalname, mimeType: req.file.mimetype });
      if (storageKey) oldFile = { driver: storageDriver, key: storageKey };
      storageDriver = driver.name;
      storageKey = saved.key;
      mimeType = req.file.mimetype;
      size = saved.size;
      url = null;
    } else if (body.url !== undefined && text(body.url)) {
      // Switch to (or update) an external video URL
      const newUrl = text(body.url, 2000);
      if (!isValidUrl(newUrl)) return res.status(400).json({ error: 'Enter a valid http(s) video URL' });
      if (storageKey) oldFile = { driver: storageDriver, key: storageKey };
      url = newUrl;
      storageDriver = null;
      storageKey = null;
      mimeType = null;
      size = null;
    }

    db.prepare(
      `UPDATE items SET title = ?, category_id = ?, position = ?, url = ?, storage_driver = ?, storage_key = ?, mime_type = ?, size_bytes = ?
       WHERE id = ?`
    ).run(title, categoryId, position, url, storageDriver, storageKey, mimeType, size, item.id);

    if (oldFile) await storage.getDriver(oldFile.driver || 'local').delete(oldFile.key);

    res.json({ item: q.getItem(item.id) });
  } catch (err) {
    await discardTemp(req.file);
    next(err);
  }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const item = q.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
    if (item.storage_key) await storage.getDriver(item.storage_driver || 'local').delete(item.storage_key);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /items/reorder { category_id, order: [itemId, ...] }
router.post('/items/reorder', (req, res) => {
  const { category_id, order } = req.body || {};
  if (!q.getCategory(category_id)) return res.status(400).json({ error: 'Choose a valid category' });
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });
  q.reorder('items', 'category_id', category_id, order);
  res.json({ items: q.listItems(category_id) });
});

module.exports = router;
