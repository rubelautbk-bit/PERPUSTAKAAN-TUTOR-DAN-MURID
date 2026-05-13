const express = require('express');
const QRCode = require('qrcode');
const db = require('../db/database');
const { resolvePdfUrl, resolveCoverUrl, isPdfJsCompatible, getDriveEmbed } = require('../utils/bookFile');

const router = express.Router();

router.get('/', (req, res) => {
  const totalBuku = db.prepare('SELECT COUNT(*) c FROM buku').get().c;
  const totalMurid = db.prepare("SELECT COUNT(*) c FROM users WHERE role='murid'").get().c;
  const totalTutor = db.prepare("SELECT COUNT(*) c FROM users WHERE role='tutor'").get().c;
  const totalKategori = db.prepare('SELECT COUNT(*) c FROM kategori').get().c;

  const bukuPopuler = db
    .prepare('SELECT * FROM buku ORDER BY dibaca DESC, rating DESC LIMIT 8')
    .all();
  const bukuTerbaru = db
    .prepare('SELECT * FROM buku ORDER BY created_at DESC LIMIT 6')
    .all();
  const pengumumanTerbaru = db
    .prepare('SELECT * FROM pengumuman ORDER BY created_at DESC LIMIT 3')
    .all();

  res.render('public/landing', {
    title: 'Beranda',
    totalBuku,
    totalMurid,
    totalTutor,
    totalKategori,
    bukuPopuler,
    bukuTerbaru,
    pengumumanTerbaru,
  });
});

router.get('/katalog', (req, res) => {
  const {
    q = '',
    kategori = '',
    tahun = '',
    bahasa = '',
    status = '',
    penulis = '',
    isbn = '',
  } = req.query;

  let sql = `SELECT b.*, k.nama AS kategori_nama FROM buku b LEFT JOIN kategori k ON b.kategori_id = k.id WHERE 1=1`;
  const params = [];

  if (q) {
    sql += ' AND (b.judul LIKE ? OR b.penulis LIKE ? OR b.sinopsis LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (kategori) { sql += ' AND k.nama = ?'; params.push(kategori); }
  if (tahun) { sql += ' AND b.tahun = ?'; params.push(tahun); }
  if (bahasa) { sql += ' AND b.bahasa = ?'; params.push(bahasa); }
  if (penulis) { sql += ' AND b.penulis LIKE ?'; params.push(`%${penulis}%`); }
  if (isbn) { sql += ' AND b.isbn LIKE ?'; params.push(`%${isbn}%`); }
  if (status === 'tersedia') sql += ' AND b.stok_tersedia > 0';
  if (status === 'habis') sql += ' AND b.stok_tersedia = 0';

  sql += ' ORDER BY b.judul ASC';

  const buku = db.prepare(sql).all(...params);
  const kategoriList = db.prepare('SELECT * FROM kategori ORDER BY nama').all();

  res.render('public/katalog', {
    title: 'Katalog Buku',
    buku,
    kategoriList,
    filters: { q, kategori, tahun, bahasa, status, penulis, isbn },
  });
});

router.get('/buku/:id', (req, res) => {
  const buku = db
    .prepare(
      `SELECT b.*, k.nama AS kategori_nama FROM buku b LEFT JOIN kategori k ON b.kategori_id=k.id WHERE b.id=?`
    )
    .get(req.params.id);

  if (!buku) {
    req.flash('error', 'Buku tidak ditemukan.');
    return res.redirect('/katalog');
  }

  const ulasan = db
    .prepare(
      `SELECT r.*, u.name FROM rating r JOIN users u ON r.user_id=u.id WHERE r.buku_id=? ORDER BY r.created_at DESC`
    )
    .all(buku.id);

  const rekomendasi = db
    .prepare(
      `SELECT b.* FROM buku b WHERE b.kategori_id=? AND b.id != ? ORDER BY b.rating DESC LIMIT 4`
    )
    .all(buku.kategori_id, buku.id);

  const pdfUrl = resolvePdfUrl(buku);
  const coverUrl = resolveCoverUrl(buku);

  res.render('public/detail-buku', {
    title: buku.judul,
    buku,
    ulasan,
    rekomendasi,
    pdfUrl,
    coverUrl,
  });
});

// ===== PDF READER =====
router.get('/buku/:id/baca', (req, res) => {
  const buku = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.id);
  if (!buku) return res.redirect('/katalog');

  const rawUrl = resolvePdfUrl(buku);
  let pdfMode = 'none';
  let pdfUrl = null;

  if (rawUrl) {
    if (rawUrl.includes('drive.google.com')) {
      pdfMode = 'iframe';
      pdfUrl = getDriveEmbed(rawUrl);
    } else if (isPdfJsCompatible(rawUrl)) {
      pdfMode = 'pdfjs';
      pdfUrl = rawUrl;
    } else {
      pdfMode = 'iframe';
      pdfUrl = rawUrl;
    }
  }

  // Tambahkan counter dibaca (cuma kalau login)
  if (req.session.user && req.session.user.role === 'murid') {
    db.prepare('UPDATE buku SET dibaca = dibaca + 1 WHERE id=?').run(buku.id);
  }

  // Ambil bookmark + highlights + progress existing (cuma kalau login murid)
  let bookmarks = [];
  let highlights = [];
  let initialPage = 1;
  if (req.session.user && req.session.user.role === 'murid') {
    bookmarks = db
      .prepare('SELECT * FROM bookmark WHERE user_id=? AND buku_id=? ORDER BY halaman')
      .all(req.session.user.id, buku.id);
    highlights = db
      .prepare('SELECT * FROM highlight WHERE user_id=? AND buku_id=? ORDER BY halaman, created_at')
      .all(req.session.user.id, buku.id);
    const prog = db
      .prepare('SELECT halaman_terakhir FROM progress_baca WHERE user_id=? AND buku_id=?')
      .get(req.session.user.id, buku.id);
    if (prog && prog.halaman_terakhir) initialPage = prog.halaman_terakhir;
  }

  res.render('public/reader', {
    title: 'Baca: ' + buku.judul,
    buku,
    pdfUrl,
    pdfMode,
    bookmarks,
    highlights,
    initialPage,
  });
});

// ===== QR CODE BUKU =====
router.get('/buku/:id/qr', async (req, res, next) => {
  try {
    const buku = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.id);
    if (!buku) return res.redirect('/katalog');
    const url = `${req.protocol}://${req.get('host')}/buku/${buku.id}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    res.render('public/qr', { title: 'QR Code', buku, qrDataUrl, url });
  } catch (e) {
    next(e);
  }
});

router.get('/pengumuman', (req, res) => {
  const list = db
    .prepare(
      `SELECT p.*, u.name AS author FROM pengumuman p LEFT JOIN users u ON p.author_id=u.id ORDER BY p.created_at DESC`
    )
    .all();
  res.render('public/pengumuman', { title: 'Pengumuman', list });
});

router.get('/pengumuman/:id', (req, res) => {
  const item = db
    .prepare(
      `SELECT p.*, u.name AS author FROM pengumuman p LEFT JOIN users u ON p.author_id=u.id WHERE p.id=?`
    )
    .get(req.params.id);
  if (!item) return res.redirect('/pengumuman');
  res.render('public/pengumuman-detail', { title: item.judul, item });
});

router.get('/tentang', (req, res) => {
  res.render('public/tentang', { title: 'Tentang Kami' });
});

// Multi-bahasa switcher
router.get('/bahasa/:lang', (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'id';
  req.session.lang = lang;
  if (req.session.user) {
    db.prepare('UPDATE users SET bahasa=? WHERE id=?').run(lang, req.session.user.id);
  }
  res.redirect(req.get('Referer') || '/');
});

module.exports = router;
