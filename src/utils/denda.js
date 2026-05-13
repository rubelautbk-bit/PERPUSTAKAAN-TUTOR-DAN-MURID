// Sistem denda otomatis
// Rp500/hari setelah masa pinjam 2 minggu, perpanjangan minimal H-2
const db = require('../db/database');

function getSetting(key) {
  const row = db.prepare('SELECT value FROM setting WHERE key=?').get(key);
  return row ? row.value : null;
}

function hitungDenda(tanggalKembali) {
  const today = new Date();
  const due = new Date(tanggalKembali);
  const lateMs = today - due;
  if (lateMs <= 0) return 0;
  const lateDays = Math.ceil(lateMs / (1000 * 60 * 60 * 24));
  const perHari = parseInt(getSetting('denda_per_hari')) || 500;
  return lateDays * perHari;
}

function bolehPerpanjang(tanggalKembali) {
  const today = new Date();
  const due = new Date(tanggalKembali);
  const minHari = parseInt(getSetting('min_hari_perpanjangan')) || 2;
  const diffMs = due - today;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  // Boleh perpanjang jika sisa waktu >= minHari (H-2 artinya masih 2 hari sebelum deadline)
  return diffDays >= 0 && diffDays <= minHari;
}

// Update denda otomatis untuk semua peminjaman yang terlambat
function updateDendaOtomatis() {
  const rows = db.prepare(
    `SELECT id, tanggal_kembali FROM peminjaman WHERE status='dipinjam'`
  ).all();
  let updated = 0;
  rows.forEach(r => {
    const denda = hitungDenda(r.tanggal_kembali);
    if (denda > 0) {
      db.prepare('UPDATE peminjaman SET denda=? WHERE id=?').run(denda, r.id);
      updated++;
    }
  });
  return updated;
}

module.exports = { hitungDenda, bolehPerpanjang, updateDendaOtomatis, getSetting };
