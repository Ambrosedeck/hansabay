const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { hashPassword } = require('./passwords');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new DatabaseSync(config.databasePath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS packs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    price         REAL NOT NULL DEFAULT 0,
    currency      TEXT NOT NULL DEFAULT 'USD',
    password_hash TEXT NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id  INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id    INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    type           TEXT NOT NULL CHECK (type IN ('video', 'link')),
    title          TEXT NOT NULL,
    url            TEXT,                -- external link URL or external video URL
    storage_driver TEXT,                -- 'local' | 's3' when the video was uploaded
    storage_key    TEXT,                -- key/path inside the storage driver
    mime_type      TEXT,
    size_bytes     INTEGER,
    position       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_categories_pack ON categories(pack_id, position);
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id, position);
`);

// ---- Settings helpers ----
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// ---- Seed on first run ----
function seed() {
  if (!getSetting('admin_password_hash')) {
    setSetting('admin_password_hash', hashPassword(config.seed.adminPassword));
    console.log('[seed] Admin password initialised from ADMIN_PASSWORD (default "admin123").');
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM packs').get().n;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO packs (slug, name, description, price, password_hash, position) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insert.run('starter', 'Starter', 'Everything you need to get going.', 9.99, hashPassword(config.seed.starterPassword), 0);
    insert.run('booster', 'Booster', 'More content, more categories, more value.', 19.99, hashPassword(config.seed.boosterPassword), 1);
    insert.run('premium', 'Premium', 'The full library. All packs, all content.', 39.99, hashPassword(config.seed.premiumPassword), 2);
    console.log('[seed] Created Starter, Booster and Premium packs.');
  }
}

seed();

module.exports = { db, getSetting, setSetting };
