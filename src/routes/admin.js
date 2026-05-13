const express = require('express');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const db = require('../db/database');
const upload = require('../middleware/upload');
const { ensureRole } = require('../middleware/auth');
const gami = require('../utils/gamification');

const router = express.Router();
router.use(ensureRole('admin'));

// DASHBOARD
router.get('/', (req, res) => {
  const s = {
    totalBuku: db.prepare('SELECT COUNT(*) c FROM buku').get().c,
    totalUser: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    totalMurid: db.prepare("SELECT COUNT(*) c FROM users WHERE role='murid'").get().c,
    totalTutor: db.prepare("SELECT COUNT(*) c FROM users WHERE role='tutor'").get().c,
    totalPinjam: db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE status='dipinjam'").get().c,
    totalMenunggu: db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE status='menunggu'").get().c,
    totalDenda: db.prepare("SELECT COALESCE(SUM(denda),0) c FROM peminjaman").get().c,
  };

  const bukuPopuler = db.prepare(
    'SELECT judul, dibaca FROM buku ORDER BY dibaca DESC LIMIT 5'
  ).all();

  const userAktif = db.prepare(
    `SELECT u.name, COUNT(p.id) total FROM users u LEFT JOIN peminjaman p ON u.id=p.user_id
     WHERE u.role='murid' GROUP BY u.id ORDER BY total DESC LIMIT 5`
  ).all();

  const tutorAktif = db.prepare(
    `SELECT u.name,
      (SELECT COUNT(*) FROM kelas WHERE tutor_id=u.id) kelas,
      (SELECT COUNT(*) FROM materi WHERE tutor_id=u.id) materi
     FROM users u WHERE u.role='tutor' ORDER BY kelas+materi DESC LIMIT 5`
  ).all();

  const peminjamanTerbaru = db.prepare(
    `SELECT p.*, u.name AS user_name, b.judul FROM peminjaman p
     JOIN users u ON p.user_id=u.id JOIN buku b ON p.buku_id=b.id
     ORDER BY p.created_at DESC LIMIT 8`
  ).all();

  res.render('admin/dashboard', {
    title: 'Dashboard Admin',
    s,
    bukuPopuler,
    userAktif,
    tutorAktif,
    peminjamanTerbaru,
  });
});

// USERS
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.render('admin/users', { title: 'Manajemen User', users });
});

router.get('/users/new', (req, res) => {
  res.render('admin/user-form', { title: 'Tambah User', u: null });
});

router.post('/users', (req, res) => {
  const { name, email, phone, password, role } = req.body;
  const hashed = bcrypt.hashSync(password || 'password123', 10);
  db.prepare(
    'INSERT INTO users (name,email,phone,password,role) VALUES (?,?,?,?,?)'
  ).run(name, email, phone, hashed, role);
  req.flash('success', 'User ditambahkan.');
  res.redirect('/admin/users');
});

router.get('/users/:id/edit', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  res.render('admin/user-form', { title: 'Edit User', u });
});

router.put('/users/:id', (req, res) => {
  const { name, email, phone, role, status, password } = req.body;
  if (password && password.trim()) {
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare(
      'UPDATE users SET name=?, email=?, phone=?, role=?, status=?, password=? WHERE id=?'
    ).run(name, email, phone, role, status, hashed, req.params.id);
  } else {
    db.prepare(
      'UPDATE users SET name=?, email=?, phone=?, role=?, status=? WHERE id=?'
    ).run(name, email, phone, role, status, req.params.id);
  }
  req.flash('success', 'User diperbarui.');
  res.redirect('/admin/users');
});

router.delete('/users/:id', (req, res) => {
  if (+req.params.id === req.session.user.id) {
    req.flash('error', 'Tidak bisa menghapus akun sendiri.');
    return res.redirect('/admin/users');
  }
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  req.flash('success', 'User dihapus.');
  res.redirect('/admin/users');
});

// BUKU
router.get('/buku', (req, res) => {
  const buku = db.prepare(
    `SELECT b.*, k.nama AS kategori_nama FROM buku b LEFT JOIN kategori k ON b.kategori_id=k.id ORDER BY b.created_at DESC`
  ).all();
  res.render('admin/buku', { title: 'Manajemen Buku', buku });
});

router.get('/buku/new', (req, res) => {
  const kategoriList = db.prepare('SELECT * FROM kategori ORDER BY nama').all();
  res.render('admin/buku-form', { title: 'Tambah Buku', b: null, kategoriList });
});

router.post('/buku', upload.fields([{ name: 'cover' }, { name: 'file_pdf' }]), (req, res) => {
  const { judul, penulis, penerbit, tahun, isbn, bahasa, kategori_id, sinopsis, jumlah_halaman, stok, cover_url, pdf_url } = req.body;
  const cover = req.files?.cover?.[0]?.filename || null;
  const file_pdf = req.files?.file_pdf?.[0]?.filename || null;
  db.prepare(
    `INSERT INTO buku (judul,penulis,penerbit,tahun,isbn,bahasa,kategori_id,sinopsis,jumlah_halaman,stok,stok_tersedia,cover,cover_url,file_pdf,pdf_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    judul, penulis, penerbit, tahun || null, isbn || null, bahasa || 'Indonesia',
    kategori_id || null, sinopsis, jumlah_halaman || 0, stok || 1, stok || 1,
    cover, cover_url || null, file_pdf, pdf_url || null
  );
  req.flash('success', 'Buku ditambahkan.');
  res.redirect('/admin/buku');
});

router.get('/buku/:id/edit', (req, res) => {
  const b = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.id);
  if (!b) return res.redirect('/admin/buku');
  const kategoriList = db.prepare('SELECT * FROM kategori ORDER BY nama').all();
  res.render('admin/buku-form', { title: 'Edit Buku', b, kategoriList });
});

router.put('/buku/:id', upload.fields([{ name: 'cover' }, { name: 'file_pdf' }]), (req, res) => {
  const existing = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.id);
  if (!existing) return res.redirect('/admin/buku');
  const { judul, penulis, penerbit, tahun, isbn, bahasa, kategori_id, sinopsis, jumlah_halaman, stok, cover_url, pdf_url } = req.body;
  const cover = req.files?.cover?.[0]?.filename || existing.cover;
  const file_pdf = req.files?.file_pdf?.[0]?.filename || existing.file_pdf;
  db.prepare(
    `UPDATE buku SET judul=?, penulis=?, penerbit=?, tahun=?, isbn=?, bahasa=?, kategori_id=?, sinopsis=?, jumlah_halaman=?, stok=?, stok_tersedia=?, cover=?, cover_url=?, file_pdf=?, pdf_url=? WHERE id=?`
  ).run(
    judul, penulis, penerbit, tahun || null, isbn || null, bahasa, kategori_id || null,
    sinopsis, jumlah_halaman || 0, stok || 1, stok || 1,
    cover, cover_url || null, file_pdf, pdf_url || null, req.params.id
  );
  req.flash('success', 'Buku diperbarui.');
  res.redirect('/admin/buku');
});

router.delete('/buku/:id', (req, res) => {
  db.prepare('DELETE FROM buku WHERE id=?').run(req.params.id);
  req.flash('success', 'Buku dihapus.');
  res.redirect('/admin/buku');
});

// KATEGORI
router.get('/kategori', (req, res) => {
  const kategori = db.prepare('SELECT * FROM kategori ORDER BY nama').all();
  res.render('admin/kategori', { title: 'Kategori', kategori });
});

router.post('/kategori', (req, res) => {
  const { nama, deskripsi } = req.body;
  try {
    db.prepare('INSERT INTO kategori (nama, deskripsi) VALUES (?,?)').run(nama, deskripsi);
    req.flash('success', 'Kategori ditambahkan.');
  } catch (e) {
    req.flash('error', 'Kategori sudah ada.');
  }
  res.redirect('/admin/kategori');
});

router.delete('/kategori/:id', (req, res) => {
  db.prepare('DELETE FROM kategori WHERE id=?').run(req.params.id);
  req.flash('success', 'Kategori dihapus.');
  res.redirect('/admin/kategori');
});

// PEMINJAMAN
router.get('/peminjaman', (req, res) => {
  const rows = db.prepare(
    `SELECT p.*, u.name AS user_name, b.judul FROM peminjaman p
     JOIN users u ON u.id=p.user_id JOIN buku b ON b.id=p.buku_id
     ORDER BY p.created_at DESC`
  ).all();
  res.render('admin/peminjaman', { title: 'Peminjaman', rows });
});

router.post('/peminjaman/:id/approve', (req, res) => {
  const p = db.prepare('SELECT * FROM peminjaman WHERE id=?').get(req.params.id);
  if (p && p.status === 'menunggu') {
    db.prepare("UPDATE peminjaman SET status='dipinjam' WHERE id=?").run(p.id);
    db.prepare('UPDATE buku SET stok_tersedia = stok_tersedia - 1 WHERE id=? AND stok_tersedia > 0').run(p.buku_id);
    db.prepare(
      "INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)"
    ).run(p.user_id, 'Peminjaman Disetujui', 'Peminjaman buku Anda telah disetujui.', 'sukses');
  }
  req.flash('success', 'Peminjaman disetujui.');
  res.redirect('/admin/peminjaman');
});

router.post('/peminjaman/:id/reject', (req, res) => {
  db.prepare("UPDATE peminjaman SET status='ditolak' WHERE id=?").run(req.params.id);
  req.flash('success', 'Peminjaman ditolak.');
  res.redirect('/admin/peminjaman');
});

router.post('/peminjaman/:id/return', (req, res) => {
  const p = db.prepare('SELECT * FROM peminjaman WHERE id=?').get(req.params.id);
  if (p && p.status === 'dipinjam') {
    const today = new Date();
    const due = new Date(p.tanggal_kembali);
    const late = Math.max(0, Math.ceil((today - due) / (1000 * 60 * 60 * 24)));
    const denda = late * 1000;
    db.prepare(
      "UPDATE peminjaman SET status='dikembalikan', tanggal_dikembalikan=?, denda=? WHERE id=?"
    ).run(today.toISOString().slice(0,10), denda, p.id);
    db.prepare('UPDATE buku SET stok_tersedia = stok_tersedia + 1 WHERE id=?').run(p.buku_id);

    // Gamifikasi: +5 poin kalau tepat waktu
    if (late === 0) {
      gami.addPoin(p.user_id, 5);
    }
    gami.checkAchievements(p.user_id);
  }
  req.flash('success', 'Buku ditandai dikembalikan.');
  res.redirect('/admin/peminjaman');
});

// DENDA
router.get('/denda', (req, res) => {
  const rows = db.prepare(
    `SELECT p.*, u.name AS user_name, b.judul FROM peminjaman p
     JOIN users u ON u.id=p.user_id JOIN buku b ON b.id=p.buku_id
     WHERE p.denda > 0 ORDER BY p.denda DESC`
  ).all();
  const total = rows.reduce((a, b) => a + b.denda, 0);
  res.render('admin/denda', { title: 'Denda', rows, total });
});

// PENGUMUMAN
router.get('/pengumuman', (req, res) => {
  const list = db.prepare('SELECT * FROM pengumuman ORDER BY created_at DESC').all();
  res.render('admin/pengumuman', { title: 'Pengumuman', list });
});

router.post('/pengumuman', (req, res) => {
  const { judul, isi, tipe } = req.body;
  db.prepare(
    'INSERT INTO pengumuman (judul,isi,tipe,author_id) VALUES (?,?,?,?)'
  ).run(judul, isi, tipe || 'berita', req.session.user.id);
  req.flash('success', 'Pengumuman dipublikasikan.');
  res.redirect('/admin/pengumuman');
});

router.delete('/pengumuman/:id', (req, res) => {
  db.prepare('DELETE FROM pengumuman WHERE id=?').run(req.params.id);
  req.flash('success', 'Pengumuman dihapus.');
  res.redirect('/admin/pengumuman');
});

// LAPORAN
router.get('/laporan', (req, res) => {
  const bukuTop = db.prepare('SELECT judul, dibaca, rating FROM buku ORDER BY dibaca DESC LIMIT 10').all();
  const muridTop = db.prepare(
    `SELECT u.name, COUNT(p.id) total FROM users u
     LEFT JOIN peminjaman p ON p.user_id=u.id
     WHERE u.role='murid' GROUP BY u.id ORDER BY total DESC LIMIT 10`
  ).all();
  res.render('admin/laporan', { title: 'Laporan', bukuTop, muridTop });
});

router.get('/laporan/export.csv', (req, res) => {
  const rows = db.prepare(
    `SELECT b.judul, b.penulis, b.tahun, b.stok, b.dibaca, b.rating,
     (SELECT COUNT(*) FROM peminjaman p WHERE p.buku_id=b.id) total_dipinjam
     FROM buku b ORDER BY b.judul`
  ).all();
  let csv = 'Judul,Penulis,Tahun,Stok,Dibaca,Rating,Total Dipinjam\n';
  rows.forEach((r) => {
    csv += `"${r.judul}","${r.penulis}",${r.tahun},${r.stok},${r.dibaca},${r.rating},${r.total_dipinjam}\n`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-buku.csv"');
  res.send(csv);
});

// SETTINGS
router.get('/settings', (req, res) => {
  res.render('admin/settings', { title: 'Pengaturan Website' });
});

router.post('/settings', (req, res) => {
  req.flash('success', 'Pengaturan disimpan (demo).');
  res.redirect('/admin/settings');
});

// IMPORT EXCEL
router.get('/buku/import', (req, res) => {
  res.render('admin/buku-import', { title: 'Import Buku dari Excel' });
});

router.post('/buku/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'File Excel wajib diupload.');
    return res.redirect('/admin/buku/import');
  }
  try {
    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const getKat = db.prepare('SELECT id FROM kategori WHERE nama=?');
    const insertBuku = db.prepare(
      `INSERT INTO buku (judul,penulis,penerbit,tahun,isbn,bahasa,kategori_id,sinopsis,jumlah_halaman,stok,stok_tersedia,cover_url,pdf_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    let ok = 0, skip = 0;
    rows.forEach((r) => {
      const judul = r.judul || r.Judul || r.JUDUL;
      if (!judul) { skip++; return; }
      const katNama = r.kategori || r.Kategori || null;
      const k = katNama ? getKat.get(katNama) : null;
      const stok = parseInt(r.stok || r.Stok || 1);
      insertBuku.run(
        judul,
        r.penulis || r.Penulis || null,
        r.penerbit || r.Penerbit || null,
        parseInt(r.tahun || r.Tahun) || null,
        r.isbn || r.ISBN || null,
        r.bahasa || r.Bahasa || 'Indonesia',
        k?.id || null,
        r.sinopsis || r.Sinopsis || null,
        parseInt(r.jumlah_halaman || r.halaman) || 0,
        stok, stok,
        r.cover_url || null,
        r.pdf_url || null
      );
      ok++;
    });
    req.flash('success', `Import berhasil: ${ok} buku ditambahkan, ${skip} dilewati.`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal parse Excel: ' + e.message);
  }
  res.redirect('/admin/buku');
});

router.get('/buku/import-template.xlsx', (req, res) => {
  const wb = XLSX.utils.book_new();
  const data = [
    { judul: 'Contoh Buku 1', penulis: 'Penulis A', penerbit: 'Penerbit X', tahun: 2024, isbn: '978-123', bahasa: 'Indonesia', kategori: 'Pendidikan', sinopsis: 'Sinopsis...', jumlah_halaman: 200, stok: 3, cover_url: '', pdf_url: 'https://example.com/buku.pdf' }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Buku');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template-import-buku.xlsx"');
  res.send(buf);
});

// EXPORT PDF LAPORAN
router.get('/laporan/export.pdf', (req, res) => {
  const rows = db.prepare(
    `SELECT b.judul, b.penulis, b.tahun, b.stok, b.dibaca, b.rating,
     (SELECT COUNT(*) FROM peminjaman p WHERE p.buku_id=b.id) total_dipinjam
     FROM buku b ORDER BY b.dibaca DESC LIMIT 50`
  ).all();

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-buku.pdf"');
  doc.pipe(res);

  doc.fontSize(20).text('Laporan Perpustakaan Rubela', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#666').text(
    `Digenerate: ${new Date().toLocaleString('id-ID')}`,
    { align: 'center' }
  );
  doc.moveDown(1);

  // Header tabel
  const cols = [
    { label: 'Judul', width: 180 },
    { label: 'Penulis', width: 120 },
    { label: 'Tahun', width: 45 },
    { label: 'Stok', width: 40 },
    { label: 'Dibaca', width: 50 },
    { label: 'Pinjam', width: 50 },
    { label: 'Rating', width: 45 },
  ];
  let y = doc.y;
  const startX = 40;
  doc.fontSize(10).fillColor('#000').font('Helvetica-Bold');
  let x = startX;
  cols.forEach(c => { doc.text(c.label, x, y, { width: c.width }); x += c.width; });
  doc.moveTo(startX, y + 14).lineTo(555, y + 14).stroke();

  doc.font('Helvetica').fontSize(9);
  y += 18;
  rows.forEach((r) => {
    if (y > 780) { doc.addPage(); y = 40; }
    x = startX;
    const vals = [
      (r.judul || '').substring(0, 32),
      (r.penulis || '').substring(0, 22),
      String(r.tahun || '-'),
      String(r.stok),
      String(r.dibaca),
      String(r.total_dipinjam),
      String(r.rating),
    ];
    cols.forEach((c, i) => { doc.text(vals[i], x, y, { width: c.width }); x += c.width; });
    y += 16;
  });

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#666').text(`Total buku: ${rows.length}`, startX, y + 10);
  doc.end();
});

module.exports = router;
