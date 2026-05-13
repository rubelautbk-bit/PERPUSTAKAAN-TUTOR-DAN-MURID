// Log aktivitas user
const db = require('../db/database');

function logAktivitas(userId, aksi, detail = '', refType = null, refId = null) {
  db.prepare(
    'INSERT INTO aktivitas (user_id, aksi, detail, ref_type, ref_id) VALUES (?,?,?,?,?)'
  ).run(userId, aksi, detail, refType, refId);
}

function getAktivitas(userId, limit = 50) {
  return db.prepare(
    'SELECT * FROM aktivitas WHERE user_id=? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);
}

module.exports = { logAktivitas, getAktivitas };
