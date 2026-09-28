/**
 * Shared database queries used by both the public and admin APIs.
 */
const { db } = require('./db');

function listPacks() {
  return db
    .prepare('SELECT id, slug, name, description, price, currency, icon, position FROM packs ORDER BY position, id')
    .all();
}

function getPack(id) {
  return db.prepare('SELECT * FROM packs WHERE id = ?').get(Number(id));
}

function getCategory(id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id));
}

function getItem(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(Number(id));
}

/** Pack that an item ultimately belongs to (through its category). */
function getItemPackId(itemId) {
  const row = db
    .prepare('SELECT c.pack_id FROM items i JOIN categories c ON c.id = i.category_id WHERE i.id = ?')
    .get(Number(itemId));
  return row ? row.pack_id : null;
}

function listCategories(packId) {
  return db
    .prepare('SELECT id, pack_id, name, position FROM categories WHERE pack_id = ? ORDER BY position, id')
    .all(Number(packId));
}

function listItems(categoryId) {
  return db
    .prepare(
      `SELECT id, category_id, type, title, url, storage_driver, storage_key, mime_type, size_bytes, position, created_at
       FROM items WHERE category_id = ? ORDER BY position, id`
    )
    .all(Number(categoryId));
}

/** Full tree: pack -> categories -> items. */
function getPackTree(packId) {
  const pack = getPack(packId);
  if (!pack) return null;
  const categories = listCategories(pack.id).map((c) => ({ ...c, items: listItems(c.id) }));
  const { password_hash, ...safe } = pack;
  return { ...safe, categories };
}

function nextPosition(table, column, parentId) {
  const row = db
    .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE ${column} = ?`)
    .get(Number(parentId));
  return row.next;
}

/** Re-number positions 0..n-1 following the provided id order. */
function reorder(table, column, parentId, orderedIds) {
  const existing = db
    .prepare(`SELECT id FROM ${table} WHERE ${column} = ? ORDER BY position, id`)
    .all(Number(parentId))
    .map((r) => r.id);
  const wanted = orderedIds.map(Number).filter((id) => existing.includes(id));
  // Anything not mentioned keeps relative order at the end.
  const final = [...wanted, ...existing.filter((id) => !wanted.includes(id))];
  const update = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  db.exec('BEGIN');
  try {
    final.forEach((id, idx) => update.run(idx, id));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function nextPackPosition() {
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM packs').get();
  return row ? row.next : 0;
}

function generateUniqueSlug(name, excludeId = null) {
  const base = String(name || 'pack')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pack';
  let slug = base;
  let counter = 2;
  while (true) {
    const existing = excludeId
      ? db.prepare('SELECT id FROM packs WHERE slug = ? AND id != ?').get(slug, Number(excludeId))
      : db.prepare('SELECT id FROM packs WHERE slug = ?').get(slug);
    if (!existing) return slug;
    slug = `${base}-${counter++}`;
  }
}

module.exports = {
  listPacks,
  getPack,
  getCategory,
  getItem,
  getItemPackId,
  listCategories,
  listItems,
  getPackTree,
  nextPosition,
  nextPackPosition,
  generateUniqueSlug,
  reorder,
};
