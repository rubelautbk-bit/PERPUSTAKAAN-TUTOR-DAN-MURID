const express = require('express');
const db = require('../db/database');
const { ensureRole } = require('../middleware/auth');
const gami = require('../utils/gamification');
const { recommendForUser } = require('../utils/recommendation');

const router = express.Router();
router.use(ensureRole('murid'));

// DASHBOARD
router.get('/', (req, res) => {
  const uid = req.session.user.id;
  const s = {
    pinjam: db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE user_id=? AND status='dipinjam'").get(uid).c,
    wishlist: db.prepare('SELECT COUNT(*) c FROM wishlist WHERE user_id=?').get(uid).c,
    selesai: db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE user_id=? AND status='dikembalikan'").get(uid).c,
    quiz: db.prepare('SELECT COUNT(*) c FROM quiz_jawaban WHERE user_id=?').get(uid).c,
  };

  const bukuAktif = db.prepare(
    `SELECT p.*, b.judul, b.penulis FROM peminjaman p JOIN buku b ON b.id=p.buku_id
     WHERE p.user_id=? AND p.status='dipinjam' ORDER BY p.tanggal_kembali LIMIT 5`
  ).all(uid);

  // Gabung rekomendasi tutor + rekomendasi smart
  const rekomendasiTutor = db.prepare(
    `SELECT r.*, b.judul, b.penulis, u.name AS tutor_name FROM rekomendasi r
     JOIN buku b ON b.id=r.buku_id JOIN users u ON u.id=r.tutor_id
     WHERE r.kelas_id IS NULL OR r.kelas_id IN (
       SELECT kelas_id FROM kelas_member WHERE user_id=?
     ) ORDER BY r.created_at DESC LIMIT 4`
  ).all(uid);

  const rekomendasiSmart = recommendForUser(uid, 4);

  const notif = db.prepare(
    'SELECT * FROM notifikasi WHERE user_id=? ORDER BY created_at DESC LIMIT 5'
  ).all(uid);

  const progress = db.prepare(
    `SELECT pb.*, b.judul FROM progress_baca pb JOIN buku b ON b.id=pb.buku_id
     WHERE pb.user_id=? ORDER BY pb.updated_at DESC LIMIT 3`
  ).all(uid);

  const me = db.prepare('SELECT poin, level FROM users WHERE id=?').get(uid);

  res.render('murid/dashboard', {
    title: 'Dashboard Murid',
    s, bukuAktif,
    rekomendasi: rekomendasiTutor,
    rekomendasiSmart,
    notif, progress, me,
  });
});

// BUKU SAYA
router.get('/buku-saya', (req, res) => {
  const rows = db.prepare(
    `SELECT p.*, b.judul, b.penulis FROM peminjaman p JOIN buku b ON b.id=p.buku_id
     WHERE p.user_id=? ORDER BY p.created_at DESC`
  ).all(req.session.user.id);
  res.render('murid/buku-saya', { title: 'Buku Saya', rows });
});

// PINJAM
router.post('/pinjam/:bukuId', (req, res) => {
  const uid = req.session.user.id;
  const buku = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.bukuId);
  if (!buku || buku.stok_tersedia <= 0) {
    req.flash('error', 'Buku tidak tersedia.');
    return res.redirect('/buku/' + req.params.bukuId);
  }
  const today = new Date();
  const due = new Date();
  due.setDate(today.getDate() + 7);
  db.prepare(
    'INSERT INTO peminjaman (user_id,buku_id,tanggal_pinjam,tanggal_kembali,status) VALUES (?,?,?,?,?)'
  ).run(
    uid, buku.id,
    today.toISOString().slice(0,10),
    due.toISOString().slice(0,10),
    'menunggu'
  );
  db.prepare(
    'INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)'
  ).run(uid, 'Permintaan Peminjaman', `Permintaan pinjam "${buku.judul}" menunggu persetujuan admin.`, 'info');

  // Gamifikasi: +10 poin, check badge
  gami.addPoin(uid, 10);
  gami.checkAchievements(uid);

  req.flash('success', 'Permintaan peminjaman dikirim. +10 poin!');
  res.redirect('/murid/buku-saya');
});

router.post('/perpanjang/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM peminjaman WHERE id=? AND user_id=?')
    .get(req.params.id, req.session.user.id);
  if (p && p.status === 'dipinjam') {
    const d = new Date(p.tanggal_kembali);
    d.setDate(d.getDate() + 7);
    db.prepare('UPDATE peminjaman SET tanggal_kembali=? WHERE id=?')
      .run(d.toISOString().slice(0,10), p.id);
    req.flash('success', 'Peminjaman diperpanjang 7 hari.');
  }
  res.redirect('/murid/buku-saya');
});

// WISHLIST
router.get('/wishlist', (req, res) => {
  const rows = db.prepare(
    `SELECT w.id AS wid, b.* FROM wishlist w JOIN buku b ON b.id=w.buku_id
     WHERE w.user_id=? ORDER BY w.created_at DESC`
  ).all(req.session.user.id);
  res.render('murid/wishlist', { title: 'Wishlist', rows });
});

router.post('/wishlist/:bukuId', (req, res) => {
  try {
    db.prepare('INSERT INTO wishlist (user_id,buku_id) VALUES (?,?)')
      .run(req.session.user.id, req.params.bukuId);
    req.flash('success', 'Ditambahkan ke wishlist.');
  } catch (e) {
    req.flash('error', 'Sudah ada di wishlist.');
  }
  res.redirect('/buku/' + req.params.bukuId);
});

router.delete('/wishlist/:id', (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE id=? AND user_id=?')
    .run(req.params.id, req.session.user.id);
  res.redirect('/murid/wishlist');
});

// RATING
router.post('/rating/:bukuId', (req, res) => {
  const { nilai, ulasan } = req.body;
  const uid = req.session.user.id;
  const bukuId = req.params.bukuId;
  try {
    const exists = db.prepare('SELECT id FROM rating WHERE user_id=? AND buku_id=?')
      .get(uid, bukuId);
    db.prepare(
      `INSERT INTO rating (user_id,buku_id,nilai,ulasan) VALUES (?,?,?,?)
       ON CONFLICT(user_id,buku_id) DO UPDATE SET nilai=excluded.nilai, ulasan=excluded.ulasan`
    ).run(uid, bukuId, nilai, ulasan);
    const agg = db.prepare('SELECT AVG(nilai) a, COUNT(*) c FROM rating WHERE buku_id=?').get(bukuId);
    db.prepare('UPDATE buku SET rating=?, jumlah_rating=? WHERE id=?')
      .run(+agg.a.toFixed(1), agg.c, bukuId);
    if (!exists) {
      gami.addPoin(uid, 2);
      gami.checkAchievements(uid);
    }
    req.flash('success', 'Ulasan tersimpan.');
  } catch (e) {
    req.flash('error', 'Gagal menyimpan ulasan.');
  }
  res.redirect('/buku/' + bukuId);
});

// PROGRESS
router.get('/progress', (req, res) => {
  const rows = db.prepare(
    `SELECT pb.*, b.judul, b.jumlah_halaman FROM progress_baca pb
     JOIN buku b ON b.id=pb.buku_id WHERE pb.user_id=? ORDER BY pb.updated_at DESC`
  ).all(req.session.user.id);
  const bukuList = db.prepare('SELECT id,judul FROM buku ORDER BY judul').all();
  res.render('murid/progress', { title: 'Progress Belajar', rows, bukuList });
});

router.post('/progress', (req, res) => {
  const { buku_id, halaman_terakhir } = req.body;
  const uid = req.session.user.id;
  const buku = db.prepare('SELECT jumlah_halaman FROM buku WHERE id=?').get(buku_id);
  const persentase = buku && buku.jumlah_halaman > 0
    ? Math.min(100, Math.round((halaman_terakhir / buku.jumlah_halaman) * 100))
    : 0;
  db.prepare(
    `INSERT INTO progress_baca (user_id,buku_id,halaman_terakhir,persentase,updated_at)
     VALUES (?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(user_id,buku_id) DO UPDATE SET halaman_terakhir=excluded.halaman_terakhir,
     persentase=excluded.persentase, updated_at=CURRENT_TIMESTAMP`
  ).run(uid, buku_id, halaman_terakhir, persentase);
  req.flash('success', 'Progress diperbarui.');
  res.redirect('/murid/progress');
});

// Auto-save progress dari PDF Reader (AJAX)
router.post('/progress/reader', express.json(), (req, res) => {
  const { buku_id, halaman, total } = req.body;
  const uid = req.session.user.id;
  if (!buku_id || !halaman) return res.json({ ok: false });
  const pct = total > 0 ? Math.min(100, Math.round((halaman / total) * 100)) : 0;
  db.prepare(
    `INSERT INTO progress_baca (user_id,buku_id,halaman_terakhir,persentase,updated_at)
     VALUES (?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(user_id,buku_id) DO UPDATE SET halaman_terakhir=excluded.halaman_terakhir,
     persentase=excluded.persentase, updated_at=CURRENT_TIMESTAMP`
  ).run(uid, buku_id, halaman, pct);
  // Reward saat tamat
  if (pct >= 100) {
    gami.addPoin(uid, 15);
    gami.checkAchievements(uid);
  }
  res.json({ ok: true });
});

// BOOKMARK
router.post('/bookmark/:bukuId', (req, res) => {
  const uid = req.session.user.id;
  const { halaman, catatan } = req.body;
  if (!halaman) {
    req.flash('error', 'Halaman tidak valid.');
    return res.redirect('/buku/' + req.params.bukuId + '/baca');
  }
  db.prepare(
    'INSERT INTO bookmark (user_id,buku_id,halaman,catatan) VALUES (?,?,?,?)'
  ).run(uid, req.params.bukuId, halaman, catatan || null);
  req.flash('success', `Bookmark hal. ${halaman} disimpan.`);
  res.redirect('/buku/' + req.params.bukuId + '/baca');
});

router.delete('/bookmark/:id', (req, res) => {
  const bm = db.prepare('SELECT buku_id FROM bookmark WHERE id=? AND user_id=?')
    .get(req.params.id, req.session.user.id);
  db.prepare('DELETE FROM bookmark WHERE id=? AND user_id=?')
    .run(req.params.id, req.session.user.id);
  res.redirect('/buku/' + (bm ? bm.buku_id : '') + '/baca');
});

// HIGHLIGHT (via AJAX dari reader)
router.post('/highlight/:bukuId', express.json(), (req, res) => {
  const uid = req.session.user.id;
  const { halaman, teks, warna, rects, catatan } = req.body;
  if (!halaman || !teks) return res.status(400).json({ ok: false, error: 'Data tidak lengkap.' });
  const info = db.prepare(
    'INSERT INTO highlight (user_id,buku_id,halaman,teks,warna,rects_json,catatan) VALUES (?,?,?,?,?,?,?)'
  ).run(uid, req.params.bukuId, halaman, teks, warna || 'yellow', JSON.stringify(rects || []), catatan || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/highlight/:id', express.json(), (req, res) => {
  const uid = req.session.user.id;
  db.prepare('DELETE FROM highlight WHERE id=? AND user_id=?').run(req.params.id, uid);
  res.json({ ok: true });
});

// TUGAS / QUIZ
router.get('/tugas', (req, res) => {
  const uid = req.session.user.id;
  const list = db.prepare(
    `SELECT q.*, u.name AS tutor,
      (SELECT nilai FROM quiz_jawaban qj WHERE qj.quiz_id=q.id AND qj.user_id=?) nilai,
      (SELECT selesai FROM quiz_jawaban qj WHERE qj.quiz_id=q.id AND qj.user_id=?) selesai
     FROM quiz q JOIN users u ON u.id=q.tutor_id
     WHERE q.kelas_id IS NULL OR q.kelas_id IN (
       SELECT kelas_id FROM kelas_member WHERE user_id=?
     ) ORDER BY q.deadline ASC`
  ).all(uid, uid, uid);
  res.render('murid/tugas', { title: 'Tugas & Quiz', list });
});

router.get('/tugas/:id', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quiz WHERE id=?').get(req.params.id);
  if (!quiz) return res.redirect('/murid/tugas');
  const soal = db.prepare('SELECT * FROM quiz_soal WHERE quiz_id=?').all(quiz.id);
  res.render('murid/tugas-kerjakan', { title: quiz.judul, quiz, soal });
});

router.post('/tugas/:id/submit', (req, res) => {
  const uid = req.session.user.id;
  const quizId = req.params.id;
  const soal = db.prepare('SELECT * FROM quiz_soal WHERE quiz_id=?').all(quizId);
  let benar = 0;
  soal.forEach((s) => {
    if (req.body['soal_' + s.id] === s.jawaban) benar++;
  });
  const nilai = soal.length > 0 ? Math.round((benar / soal.length) * 100) : 0;
  db.prepare(
    `INSERT INTO quiz_jawaban (quiz_id,user_id,nilai,selesai) VALUES (?,?,?,1)
     ON CONFLICT(quiz_id,user_id) DO UPDATE SET nilai=excluded.nilai, selesai=1`
  ).run(quizId, uid, nilai);
  // Gamifikasi
  if (nilai >= 80) {
    gami.addPoin(uid, 20);
  }
  gami.checkAchievements(uid);
  req.flash('success', `Nilai kamu: ${nilai} (${benar}/${soal.length} benar)${nilai >= 80 ? ' +20 poin!' : ''}`);
  res.redirect('/murid/tugas');
});

// LEADERBOARD + BADGE
router.get('/leaderboard', (req, res) => {
  const leaderboard = gami.getLeaderboard(20);
  const me = db.prepare('SELECT poin, level FROM users WHERE id=?').get(req.session.user.id);
  const badges = gami.getUserBadges(req.session.user.id);
  res.render('murid/leaderboard', { title: 'Leaderboard', leaderboard, me, badges });
});

// FORUM
router.get('/forum', (req, res) => {
  const list = db.prepare(
    `SELECT f.*, u.name, (SELECT COUNT(*) FROM forum_komentar WHERE forum_id=f.id) komentar
     FROM forum f JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC`
  ).all();
  res.render('murid/forum', { title: 'Forum Diskusi', list });
});

router.post('/forum', (req, res) => {
  const { judul, isi, kategori } = req.body;
  db.prepare(
    'INSERT INTO forum (user_id,judul,isi,kategori) VALUES (?,?,?,?)'
  ).run(req.session.user.id, judul, isi, kategori || 'umum');
  req.flash('success', 'Topik diposting.');
  res.redirect('/murid/forum');
});

router.get('/forum/:id', (req, res) => {
  const item = db.prepare(
    'SELECT f.*, u.name FROM forum f JOIN users u ON u.id=f.user_id WHERE f.id=?'
  ).get(req.params.id);
  if (!item) return res.redirect('/murid/forum');
  const komentar = db.prepare(
    'SELECT k.*, u.name FROM forum_komentar k JOIN users u ON u.id=k.user_id WHERE k.forum_id=? ORDER BY k.created_at'
  ).all(item.id);
  res.render('murid/forum-detail', { title: item.judul, item, komentar, backPath: '/murid/forum' });
});

router.post('/forum/:id/komentar', (req, res) => {
  db.prepare('INSERT INTO forum_komentar (forum_id,user_id,isi) VALUES (?,?,?)')
    .run(req.params.id, req.session.user.id, req.body.isi);
  res.redirect('/murid/forum/' + req.params.id);
});

// NOTIFIKASI
router.get('/notifikasi', (req, res) => {
  const list = db.prepare('SELECT * FROM notifikasi WHERE user_id=? ORDER BY created_at DESC')
    .all(req.session.user.id);
  db.prepare('UPDATE notifikasi SET dibaca=1 WHERE user_id=?').run(req.session.user.id);
  res.render('murid/notifikasi', { title: 'Notifikasi', list });
});

// PROFILE
router.get('/profile', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user.id);
  const badges = gami.getUserBadges(req.session.user.id);
  res.render('murid/profile', { title: 'Profile Saya', u, badges });
});

router.post('/profile', (req, res) => {
  const { name, email, phone } = req.body;
  db.prepare('UPDATE users SET name=?, email=?, phone=? WHERE id=?')
    .run(name, email, phone, req.session.user.id);
  req.session.user.name = name;
  req.session.user.email = email;
  req.flash('success', 'Profile diperbarui.');
  res.redirect('/murid/profile');
});

module.exports = router;
