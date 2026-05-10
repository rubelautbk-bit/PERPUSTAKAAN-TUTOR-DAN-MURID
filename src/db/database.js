const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Di Vercel, filesystem read-only kecuali /tmp.
// WARNING: /tmp bersifat ephemeral -> data akan hilang tiap cold start.
// Untuk production yang persistent, migrasi ke Postgres/MySQL.
const isVercel = !!process.env.VERCEL;
const dataDir = isVercel
  ? '/tmp/rubela-data'
  : path.join(__dirname, '../../data');

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
