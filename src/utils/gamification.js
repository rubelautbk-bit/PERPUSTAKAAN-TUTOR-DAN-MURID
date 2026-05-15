// Sistem gamifikasi sederhana
// Poin: baca buku +10, kembalikan tepat waktu +5, quiz >=80 +20, rating +2
// Level: 1-10, threshold = level * 100 poin

const db = require('../db/database');

const LEVEL_THRESHOLD = 100; // tiap 100 poin = 1 level

const BADGES = {
  FIRST_BOOK: { kode: 'FIRST_BOOK', nama: 'Pembaca Pemula', deskripsi: 'Meminjam buku pertama kali.', icon: 'book' },
  FIVE_BOOKS: { kode: 'FIVE_BOOKS', nama: 'Kutu Buku', deskripsi: 'Telah membaca 5 buku.', icon: 'star' },
  TEN_BOOKS: { kode: 'TEN_BOOKS', nama: 'Maestro Baca', deskripsi: 'Telah membaca 10 buku.', icon: 'crown' },
  QUIZ_MASTER: { kode: 'QUIZ_MASTER', nama: 'Juara Quiz', deskripsi: 'Nilai quiz sempurna 100.', icon: 'trophy' },
  ACTIVE_REVIEWER: { kode: 'ACTIVE_REVIEWER', nama: 'Kritikus Aktif', deskripsi: 'Memberi 5 ulasan buku.', icon: 'pen' },
};

function addPoin(userId, jumlah, reason = '') {
  if (!userId || !jumlah) return;
  db.prepare('UPDATE users SET poin = poin + ? WHERE id = ?').run(jumlah, userId);
  recalcLevel(userId);
  // Bisa juga log ke tabel tersendiri kalau perlu riwayat
}

function recalcLevel(userId) {
  const u = db.prepare('SELECT poin, level FROM users WHERE id=?').get(userId);
  if (!u) return;
  const newLevel = Math.min(10, Math.max(1, Math.floor(u.poin / LEVEL_THRESHOLD) + 1));
  if (newLevel !== u.level) {
    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(newLevel, userId);
    db.prepare('INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)')
      .run(userId, 'Naik Level!', `Selamat! Kamu naik ke Level ${newLevel}`, 'sukses');
  }
}

function grantBadge(userId, kode) {
  const b = BADGES[kode];
  if (!b) return;
  try {
    db.prepare(
      'INSERT INTO badge (user_id, kode, nama, deskripsi, icon) VALUES (?,?,?,?,?)'
    ).run(userId, b.kode, b.nama, b.deskripsi, b.icon);
    db.prepare('INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)')
      .run(userId, 'Badge Baru!', `Kamu mendapatkan badge "${b.nama}"`, 'sukses');
  } catch (e) { /* sudah punya */ }
}

function checkAchievements(userId) {
  const pinjam = db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE user_id=?").get(userId).c;
  const selesai = db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE user_id=? AND status='dikembalikan'").get(userId).c;
  const ulasan = db.prepare("SELECT COUNT(*) c FROM rating WHERE user_id=?").get(userId).c;
  // Use ujian_peserta instead of non-existent quiz_jawaban table
  const quizSempurna = db.prepare("SELECT COUNT(*) c FROM ujian_peserta WHERE user_id=? AND nilai>=100 AND status='selesai'").get(userId).c;

  if (pinjam >= 1) grantBadge(userId, 'FIRST_BOOK');
  if (selesai >= 5) grantBadge(userId, 'FIVE_BOOKS');
  if (selesai >= 10) grantBadge(userId, 'TEN_BOOKS');
  if (quizSempurna >= 1) grantBadge(userId, 'QUIZ_MASTER');
  if (ulasan >= 5) grantBadge(userId, 'ACTIVE_REVIEWER');
}

function getLeaderboard(limit = 10) {
  return db.prepare(
    `SELECT id, name, poin, level, avatar FROM users
     WHERE role='murid' AND status='active'
     ORDER BY poin DESC, level DESC LIMIT ?`
  ).all(limit);
}

function getUserBadges(userId) {
  return db.prepare('SELECT * FROM badge WHERE user_id=? ORDER BY created_at DESC').all(userId);
}

module.exports = {
  addPoin, recalcLevel, grantBadge, checkAchievements, getLeaderboard, getUserBadges, BADGES
};
