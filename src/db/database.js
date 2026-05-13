const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Lokasi DB bisa di-override dengan env var DATA_DIR.
const isVercel = !!process.env.VERCEL;
const dataDir =
  process.env.DATA_DIR ||
  (isVercel ? '/tmp/rubela-data' : path.join(__dirname, '../../data'));

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'rubela.db');

// FORCE_RESEED: Hapus DB lama dan buat ulang (set env FORCE_RESEED=1 di Railway)
if (process.env.FORCE_RESEED === '1' && fs.existsSync(dbPath)) {
  console.log('[DB] FORCE_RESEED=1 detected. Deleting old database...');
  try {
    fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    console.log('[DB] Old database deleted. Will re-create with new schema.');
  } catch (e) {
    console.error('[DB] Failed to delete:', e.message);
  }
}

const db = new Database(dbPath);

// WAL tidak berfungsi optimal di /tmp Vercel, tetap aktifkan untuk local.
if (!isVercel) {
  db.pragma('journal_mode = WAL');
}
db.pragma('foreign_keys = ON');

module.exports = db;
