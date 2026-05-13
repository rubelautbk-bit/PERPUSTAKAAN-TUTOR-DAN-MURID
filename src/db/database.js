const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Lokasi DB bisa di-override dengan env var DATA_DIR.
// - Local / Railway (dengan volume): set DATA_DIR=/data
// - Vercel: paksa ke /tmp (ephemeral)
// - Default: ./data relative ke project
const isVercel = !!process.env.VERCEL;
const dataDir =
  process.env.DATA_DIR ||
  (isVercel ? '/tmp/rubela-data' : path.join(__dirname, '../../data'));

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'rubela.db');
const db = new Database(dbPath);

// WAL tidak berfungsi optimal di /tmp Vercel, tetap aktifkan untuk local.
if (!isVercel) {
  db.pragma('journal_mode = WAL');
}
db.pragma('foreign_keys = ON');

module.exports = db;
