const express = require('express');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const db = require('../db/database');
const upload = require('../middleware/upload');
const { ensureRole } = require('../middleware/auth');
const { assignNomorAnggota, generateKartuAnggota } = require('../utils/members');
const { notifyUser } = require('../utils/whatsapp');
const { updateDendaOtomatis } = require('../utils/denda');
const { logAktivitas } = require('../utils/aktivitas');
const gami = require('../utils/gamification');

const router = express.Router();
router.use(ensureRole('admin'));

// ==================== DASHBOARD ====================
router.get('/', (req, res) => {
  const s = {
    totalBuku: db.prepare('SELECT COUNT(*) c FROM buku').get().c,
    totalUser: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    totalMurid: db.prepare("SELECT COUNT(*) c FROM users WHERE role='murid'").get().c,
    totalTutor: db.prepare("SELECT COUNT(*) c FROM users WHERE role='tutor'").get().c,
    totalPinjam: db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE status='dipinjam'").get().c,
    totalPending: db.prepare("SELECT COUNT(*) c FROM users WHERE status='pending'").get().c,
    totalDenda: db.prepare("SELECT COALESCE(SUM(denda),0) c FROM peminjaman WHERE denda>0").get().c,
    totalKelas: db.prepare('SELECT COUNT(*) c FROM kelas').get().c,
  };
  const peminjamanTerbaru = db.prepare(
    `SELECT p.*, u.name AS user_name, b.judul FROM peminjaman p JOIN users u ON p.user_id=u.id JOIN buku b ON p.buku_id=b.id ORDER BY p.created_at DESC LIMIT 8`
  ).all();
  const pendingUsers = db.prepare("SELECT * FROM users WHERE status='pending' ORDER BY created_at DESC LIMIT 5").all();
  res.render('admin/dashboard', { title: 'Dashboard Admin', s, peminjamanTerbaru, pendingUsers });
});

// ==================== USER MANAGEMENT ====================
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.render('admin/users', { title: 'Manajemen User', users });
});

router.get('/users/new', (req, res) => res.render('admin/user-form', { title: 'Tambah User', u: null }));

router.post('/users', (req, res) => {
  const { name, email, phone, password, role, status } = req.body;
  const hashed = bcrypt.hashSync(password || 'password123', 10);
  const info = db.prepare('INSERT INTO users (name,email,phone,password,role,status) VALUES (?,?,?,?,?,?)').run(name, email, phone, hashed, role, status || 'active');
  assignNomorAnggota(info.lastInsertRowid);
  req.flash('success', 'User ditambahkan.');
  res.redirect('/admin/users');
});

router.get('/users/:id/edit', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  res.render('admin/user-form', { title: 'Edit User', u });
});

router.put('/users/:id', (req, res) => {
  const { name, email, phone, role, status, password, nomor_anggota } = req.body;
  if (password && password.trim()) {
    db.prepare('UPDATE users SET name=?,email=?,phone=?,role=?,status=?,password=?,nomor_anggota=? WHERE id=?')
      .run(name, email, phone, role, status, bcrypt.hashSync(password, 10), nomor_anggota || null, req.params.id);
  } else {
    db.prepare('UPDATE users SET name=?,email=?,phone=?,role=?,status=?,nomor_anggota=? WHERE id=?')
      .run(name, email, phone, role, status, nomor_anggota || null, req.params.id);
  }
  req.flash('success', 'User diperbarui.');
  res.redirect('/admin/users');
});

router.delete('/users/:id', (req, res) => {
  if (+req.params.id === req.session.user.id) { req.flash('error', 'Tidak bisa hapus diri sendiri.'); return res.redirect('/admin/users'); }
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  req.flash('success', 'User dihapus.'); res.redirect('/admin/users');
});

// Activate user
router.post('/users/:id/activate', (req, res) => {
  db.prepare("UPDATE users SET status='active', activated_by=?, activated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(req.session.user.id, req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (u) notifyUser(u.id, 'Akun Diaktivasi!', 'Selamat! Akun Anda telah diaktifkan. Silakan login.', 'sukses');
  req.flash('success', 'User diaktivasi.'); res.redirect('/admin/users');
});

// Import/Export Users
router.get('/users/export.xlsx', (req, res) => {
  const users = db.prepare('SELECT id,nomor_anggota,name,email,phone,role,status,created_at FROM users').all();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(users), 'Users');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="users-rubela.xlsx"');
  res.send(buf);
});

router.post('/users/import', upload.single('file'), (req, res) => {
  if (!req.file) { req.flash('error', 'File wajib.'); return res.redirect('/admin/users'); }
  try {
    const wb = XLSX.readFile(req.file.path);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let ok = 0;
    rows.forEach(r => {
      const name = r.name || r.Nama; if (!name) return;
      const email = r.email || r.Email; if (!email) return;
      const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
      if (exists) return;
      const info = db.prepare('INSERT INTO users (name,email,phone,password,role,status) VALUES (?,?,?,?,?,?)')
        .run(name, email, r.phone || r.Phone || null, bcrypt.hashSync('password123', 10), r.role || 'murid', 'active');
      assignNomorAnggota(info.lastInsertRowid);
      ok++;
    });
    req.flash('success', `${ok} user diimport.`);
  } catch (e) { req.flash('error', 'Gagal: ' + e.message); }
  res.redirect('/admin/users');
});

// Kartu Anggota
router.get('/users/:id/kartu', async (req, res) => {
  try {
    const buf = await generateKartuAnggota(+req.params.id);
    if (!buf) { req.flash('error', 'User tidak ditemukan.'); return res.redirect('/admin/users'); }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="kartu-anggota-${req.params.id}.pdf"`);
    res.send(buf);
  } catch (e) { req.flash('error', e.message); res.redirect('/admin/users'); }
});


// ==================== BUKU ====================
router.get('/buku', (req, res) => {
  const buku = db.prepare('SELECT b.*, k.nama AS kategori_nama FROM buku b LEFT JOIN kategori k ON b.kategori_id=k.id ORDER BY b.created_at DESC').all();
  res.render('admin/buku', { title: 'Manajemen Buku', buku });
});
router.get('/buku/new', (req, res) => {
  const kategoriList = db.prepare('SELECT * FROM kategori ORDER BY nama').all();
  res.render('admin/buku-form', { title: 'Tambah Buku', b: null, kategoriList });
});
router.post('/buku', upload.fields([{name:'cover'},{name:'file_pdf'}]), (req, res) => {
  const { judul,penulis,penerbit,tahun,isbn,bahasa,kategori_id,sinopsis,jumlah_halaman,stok,cover_url,pdf_url,tags } = req.body;
  db.prepare(`INSERT INTO buku (judul,penulis,penerbit,tahun,isbn,bahasa,kategori_id,sinopsis,jumlah_halaman,stok,stok_tersedia,cover,cover_url,file_pdf,pdf_url,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(judul,penulis,penerbit,tahun||null,isbn||null,bahasa||'Indonesia',kategori_id||null,sinopsis,jumlah_halaman||0,stok||1,stok||1,req.files?.cover?.[0]?.filename||null,cover_url||null,req.files?.file_pdf?.[0]?.filename||null,pdf_url||null,tags||null);
  req.flash('success','Buku ditambahkan.'); res.redirect('/admin/buku');
});
router.get('/buku/:id/edit', (req, res) => {
  const b = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.id);
  const kategoriList = db.prepare('SELECT * FROM kategori ORDER BY nama').all();
  res.render('admin/buku-form', { title: 'Edit Buku', b, kategoriList });
});
router.put('/buku/:id', upload.fields([{name:'cover'},{name:'file_pdf'}]), (req, res) => {
  const existing = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.id);
  const { judul,penulis,penerbit,tahun,isbn,bahasa,kategori_id,sinopsis,jumlah_halaman,stok,cover_url,pdf_url,tags } = req.body;
  db.prepare(`UPDATE buku SET judul=?,penulis=?,penerbit=?,tahun=?,isbn=?,bahasa=?,kategori_id=?,sinopsis=?,jumlah_halaman=?,stok=?,stok_tersedia=?,cover=?,cover_url=?,file_pdf=?,pdf_url=?,tags=? WHERE id=?`)
    .run(judul,penulis,penerbit,tahun||null,isbn||null,bahasa,kategori_id||null,sinopsis,jumlah_halaman||0,stok||1,stok||1,req.files?.cover?.[0]?.filename||existing.cover,cover_url||null,req.files?.file_pdf?.[0]?.filename||existing.file_pdf,pdf_url||null,tags||null,req.params.id);
  req.flash('success','Buku diperbarui.'); res.redirect('/admin/buku');
});
router.delete('/buku/:id', (req, res) => { db.prepare('DELETE FROM buku WHERE id=?').run(req.params.id); req.flash('success','Buku dihapus.'); res.redirect('/admin/buku'); });
// Import buku Excel
router.get('/buku/import', (req, res) => res.render('admin/buku-import', { title: 'Import Buku' }));
router.post('/buku/import', upload.single('file'), (req, res) => {
  if (!req.file) { req.flash('error','File wajib.'); return res.redirect('/admin/buku/import'); }
  const wb = XLSX.readFile(req.file.path); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let ok=0; const getKat = db.prepare('SELECT id FROM kategori WHERE nama=?');
  rows.forEach(r => { const judul=r.judul||r.Judul; if(!judul) return; const k=getKat.get(r.kategori||''); db.prepare('INSERT INTO buku (judul,penulis,penerbit,tahun,isbn,bahasa,kategori_id,sinopsis,jumlah_halaman,stok,stok_tersedia,cover_url,pdf_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(judul,r.penulis||null,r.penerbit||null,r.tahun||null,r.isbn||null,r.bahasa||'Indonesia',k?.id||null,r.sinopsis||null,r.jumlah_halaman||0,r.stok||1,r.stok||1,r.cover_url||null,r.pdf_url||null); ok++; });
  req.flash('success',`${ok} buku diimport.`); res.redirect('/admin/buku');
});

// ==================== KATEGORI ====================
router.get('/kategori', (req, res) => { res.render('admin/kategori', { title: 'Kategori', kategori: db.prepare('SELECT * FROM kategori ORDER BY nama').all() }); });
router.post('/kategori', (req, res) => { try { db.prepare('INSERT INTO kategori (nama,deskripsi) VALUES (?,?)').run(req.body.nama, req.body.deskripsi); req.flash('success','Ditambahkan.'); } catch(e) { req.flash('error','Sudah ada.'); } res.redirect('/admin/kategori'); });
router.delete('/kategori/:id', (req, res) => { db.prepare('DELETE FROM kategori WHERE id=?').run(req.params.id); req.flash('success','Dihapus.'); res.redirect('/admin/kategori'); });

// ==================== PEMINJAMAN & DENDA ====================
router.get('/peminjaman', (req, res) => {
  updateDendaOtomatis();
  const rows = db.prepare('SELECT p.*, u.name AS user_name, b.judul FROM peminjaman p JOIN users u ON u.id=p.user_id JOIN buku b ON b.id=p.buku_id ORDER BY p.created_at DESC').all();
  res.render('admin/peminjaman', { title: 'Peminjaman', rows });
});
router.post('/peminjaman/:id/approve', (req, res) => {
  const p = db.prepare('SELECT p.*, b.judul FROM peminjaman p JOIN buku b ON b.id=p.buku_id WHERE p.id=?').get(req.params.id);
  if (p && p.status==='menunggu') {
    db.prepare("UPDATE peminjaman SET status='dipinjam' WHERE id=?").run(p.id);
    db.prepare('UPDATE buku SET stok_tersedia=stok_tersedia-1 WHERE id=? AND stok_tersedia>0').run(p.buku_id);
    notifyUser(p.user_id, 'Peminjaman Disetujui',
      `Buku "${p.judul}" telah dipinjamkan untuk Anda. Tanggal kembali: ${p.tanggal_kembali}. Silakan ambil di perpustakaan.`,
      'sukses');
  }
  req.flash('success','Disetujui.'); res.redirect('/admin/peminjaman');
});
router.post('/peminjaman/:id/reject', (req, res) => { db.prepare("UPDATE peminjaman SET status='ditolak' WHERE id=?").run(req.params.id); req.flash('success','Ditolak.'); res.redirect('/admin/peminjaman'); });
router.post('/peminjaman/:id/return', (req, res) => {
  const p = db.prepare('SELECT * FROM peminjaman WHERE id=?').get(req.params.id);
  if (p && p.status==='dipinjam') {
    const { hitungDenda } = require('../utils/denda');
    const denda = hitungDenda(p.tanggal_kembali);
    db.prepare("UPDATE peminjaman SET status='dikembalikan',tanggal_dikembalikan=?,denda=? WHERE id=?").run(new Date().toISOString().slice(0,10), denda, p.id);
    db.prepare('UPDATE buku SET stok_tersedia=stok_tersedia+1 WHERE id=?').run(p.buku_id);
    if (denda===0) gami.addPoin(p.user_id, 5);
    gami.checkAchievements(p.user_id);
  }
  req.flash('success','Dikembalikan.'); res.redirect('/admin/peminjaman');
});
router.get('/denda', (req, res) => {
  updateDendaOtomatis();
  const rows = db.prepare('SELECT p.*,u.name AS user_name,b.judul FROM peminjaman p JOIN users u ON u.id=p.user_id JOIN buku b ON b.id=p.buku_id WHERE p.denda>0 ORDER BY p.denda DESC').all();
  res.render('admin/denda', { title: 'Denda', rows, total: rows.reduce((a,b)=>a+b.denda,0) });
});


// ==================== KELAS ====================
router.get('/kelas', (req, res) => {
  const kelas = db.prepare(`SELECT k.*, u.name AS tutor_name, (SELECT COUNT(*) FROM kelas_member WHERE kelas_id=k.id) jumlah FROM kelas k JOIN users u ON u.id=k.tutor_id ORDER BY k.created_at DESC`).all();
  const tutors = db.prepare("SELECT id,name FROM users WHERE role='tutor' AND status='active'").all();
  res.render('admin/kelas', { title: 'Manajemen Kelas', kelas, tutors });
});
router.post('/kelas', (req, res) => {
  var { nama, subtest, deskripsi, tutor_id, kode } = req.body;
  nama = (nama || '').trim();
  kode = (kode || '').trim().toUpperCase();
  if (!nama) { req.flash('error','Nama kelas wajib diisi.'); return res.redirect('/admin/kelas'); }
  if (!kode) { req.flash('error','Kode kelas wajib diisi.'); return res.redirect('/admin/kelas'); }
  try { db.prepare('INSERT INTO kelas (nama,subtest,deskripsi,tutor_id,kode) VALUES (?,?,?,?,?)').run(nama, subtest||null, deskripsi||null, tutor_id, kode); req.flash('success','Kelas dibuat.'); }
  catch(e) { req.flash('error','Kode sudah ada atau tutor invalid.'); }
  res.redirect('/admin/kelas');
});
router.delete('/kelas/:id', (req, res) => {
  db.prepare('DELETE FROM kelas WHERE id=?').run(req.params.id);
  req.flash('success','Kelas dihapus.');
  res.redirect('/admin/kelas');
});
router.get('/kelas/:id', (req, res) => {
  const kelas = db.prepare('SELECT k.*,u.name AS tutor_name FROM kelas k JOIN users u ON u.id=k.tutor_id WHERE k.id=?').get(req.params.id);
  if (!kelas) return res.redirect('/admin/kelas');
  const members = db.prepare('SELECT u.*,km.joined_at FROM kelas_member km JOIN users u ON u.id=km.user_id WHERE km.kelas_id=?').all(kelas.id);
  const allMurid = db.prepare("SELECT id,name,email,nomor_anggota FROM users WHERE role='murid' AND status='active' AND id NOT IN (SELECT user_id FROM kelas_member WHERE kelas_id=?)").all(kelas.id);
  const pertemuan = db.prepare('SELECT * FROM pertemuan WHERE kelas_id=? ORDER BY nomor').all(kelas.id);
  const materi = db.prepare('SELECT m.*,b.judul AS buku_judul FROM materi m LEFT JOIN buku b ON b.id=m.buku_id WHERE m.kelas_id=? ORDER BY m.created_at DESC').all(kelas.id);
  const bukuList = db.prepare('SELECT id,judul,penulis FROM buku ORDER BY judul').all();
  const rekomendasi = db.prepare('SELECT r.*,b.judul,b.penulis FROM rekomendasi r JOIN buku b ON b.id=r.buku_id WHERE r.kelas_id=? ORDER BY r.created_at DESC').all(kelas.id);
  const tugasList = db.prepare('SELECT * FROM ujian WHERE kelas_id=? ORDER BY created_at DESC').all(kelas.id);
  const kelasLain = db.prepare("SELECT k.*,u.name AS tutor_name FROM kelas k JOIN users u ON u.id=k.tutor_id WHERE k.id!=? AND k.status='active' ORDER BY k.nama").all(kelas.id);
  res.render('admin/kelas-detail', { title: kelas.nama, kelas, members, allMurid, pertemuan, materi, bukuList, rekomendasi, tugasList, kelasLain });
});
// Bulk add murid
router.post('/kelas/:id/members', (req, res) => {
  const userIds = Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_ids].filter(Boolean);
  let added = 0;
  userIds.forEach(uid => { try { db.prepare('INSERT INTO kelas_member (kelas_id,user_id) VALUES (?,?)').run(req.params.id, uid); added++; } catch(e){} });
  req.flash('success', `${added} murid ditambahkan.`); res.redirect('/admin/kelas/' + req.params.id);
});
router.delete('/kelas/:id/members/:uid', (req, res) => {
  db.prepare('DELETE FROM kelas_member WHERE kelas_id=? AND user_id=?').run(req.params.id, req.params.uid);
  req.flash('success','Murid dihapus dari kelas.'); res.redirect('/admin/kelas/' + req.params.id);
});
// Pertemuan
router.post('/kelas/:id/pertemuan', (req, res) => {
  const { nomor, judul, deskripsi, tanggal } = req.body;
  db.prepare('INSERT INTO pertemuan (kelas_id,nomor,judul,deskripsi,tanggal) VALUES (?,?,?,?,?)').run(req.params.id, nomor, judul, deskripsi, tanggal||null);
  req.flash('success','Pertemuan ditambahkan.'); res.redirect('/admin/kelas/'+req.params.id);
});
// Materi
router.post('/kelas/:id/materi', upload.single('file'), (req, res) => {
  const { judul, deskripsi, tipe, link, buku_id, pertemuan_id } = req.body;
  db.prepare('INSERT INTO materi (kelas_id,pertemuan_id,tutor_id,judul,deskripsi,tipe,file,link,buku_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.params.id, pertemuan_id||null, req.session.user.id, judul, deskripsi, tipe||'link', req.file?.filename||null, link||null, buku_id||null);
  req.flash('success','Materi ditambahkan.'); res.redirect('/admin/kelas/'+req.params.id);
});
// Rekomendasi
router.post('/kelas/:id/rekomendasi', (req, res) => {
  const { buku_id, catatan } = req.body;
  db.prepare('INSERT INTO rekomendasi (tutor_id,buku_id,kelas_id,catatan) VALUES (?,?,?,?)').run(req.session.user.id, buku_id, req.params.id, catatan||null);
  req.flash('success','Rekomendasi ditambahkan.'); res.redirect('/admin/kelas/'+req.params.id);
});
router.delete('/kelas/:id/rekomendasi/:rid', (req, res) => {
  db.prepare('DELETE FROM rekomendasi WHERE id=? AND kelas_id=?').run(req.params.rid, req.params.id);
  req.flash('success','Rekomendasi dihapus.'); res.redirect('/admin/kelas/'+req.params.id);
});
// Kirim materi & rekomendasi ke kelas lain
router.post('/kelas/:id/kirim-materi', (req, res) => {
  const sourceId = req.params.id;
  const targets = Array.isArray(req.body.target_ids) ? req.body.target_ids : [req.body.target_ids].filter(Boolean);
  if (targets.length === 0) { req.flash('error','Pilih kelas tujuan.'); return res.redirect('/admin/kelas/'+sourceId); }
  let totalMat=0, totalRek=0;
  if (req.body.include_materi) {
    const source = db.prepare('SELECT * FROM materi WHERE kelas_id=?').all(sourceId);
    const ins = db.prepare('INSERT INTO materi (kelas_id,tutor_id,judul,deskripsi,tipe,file,link,buku_id) VALUES (?,?,?,?,?,?,?,?)');
    targets.forEach(t => source.forEach(m => { ins.run(t, req.session.user.id, m.judul, m.deskripsi, m.tipe, m.file, m.link, m.buku_id); totalMat++; }));
  }
  if (req.body.include_rekomendasi) {
    const source = db.prepare('SELECT * FROM rekomendasi WHERE kelas_id=?').all(sourceId);
    const ins = db.prepare('INSERT INTO rekomendasi (tutor_id,buku_id,kelas_id,catatan) VALUES (?,?,?,?)');
    targets.forEach(t => source.forEach(r => { ins.run(req.session.user.id, r.buku_id, t, r.catatan); totalRek++; }));
  }
  req.flash('success', `Dikirim ke ${targets.length} kelas: ${totalMat} materi, ${totalRek} rekomendasi.`);
  res.redirect('/admin/kelas/'+sourceId);
});

// ==================== BANK SOAL ====================
router.get('/bank-soal', (req, res) => {
  const { subtest } = req.query;
  let soal;
  if (subtest) { soal = db.prepare('SELECT bs.*,u.name AS creator FROM bank_soal bs JOIN users u ON u.id=bs.created_by WHERE bs.subtest=? ORDER BY bs.created_at DESC').all(subtest); }
  else { soal = db.prepare('SELECT bs.*,u.name AS creator FROM bank_soal bs JOIN users u ON u.id=bs.created_by ORDER BY bs.created_at DESC LIMIT 100').all(); }
  const subtests = ['PU','PPU','PBM','PK','LBI','LBE','PM'];
  res.render('admin/bank-soal', { title: 'Bank Soal', soal, subtests, currentSubtest: subtest || '' });
});
router.get('/bank-soal/tambah', (req, res) => {
  const { subtest } = req.query;
  res.render('admin/bank-soal-form', { title: 'Tambah Soal', s: null, subtest: subtest || '', subtests: ['PU','PPU','PBM','PK','LBI','LBE','PM'] });
});
router.post('/bank-soal', (req, res) => {
  const { subtest, soal, tipe, opsi_json, jawaban_json, poin, penjelasan, kelas_id } = req.body;
  db.prepare('INSERT INTO bank_soal (kelas_id,subtest,soal,tipe,opsi_json,jawaban_json,poin,penjelasan,created_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(kelas_id||null, subtest, soal, tipe||'pg', opsi_json||'[]', jawaban_json||'""', poin||1, penjelasan||null, req.session.user.id);
  req.flash('success','Soal ditambahkan.'); res.redirect('/admin/bank-soal?subtest=' + (subtest||''));
});
router.post('/bank-soal/bulk-poin', (req, res) => {
  const { subtest, poin } = req.body;
  db.prepare('UPDATE bank_soal SET poin=? WHERE subtest=?').run(poin||1, subtest);
  req.flash('success',`Poin semua soal ${subtest} diubah ke ${poin}.`); res.redirect('/admin/bank-soal?subtest='+subtest);
});
router.delete('/bank-soal/:id', (req, res) => { db.prepare('DELETE FROM bank_soal WHERE id=?').run(req.params.id); req.flash('success','Soal dihapus.'); res.redirect('/admin/bank-soal'); });
// Export bank soal
router.get('/bank-soal/export.xlsx', (req, res) => {
  const { subtest } = req.query;
  let soal = subtest ? db.prepare('SELECT * FROM bank_soal WHERE subtest=?').all(subtest) : db.prepare('SELECT * FROM bank_soal').all();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(soal), 'Bank Soal');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="bank-soal.xlsx"');
  res.send(buf);
});
// Import bank soal (Excel .xlsx/.xls, CSV .csv, atau Word .docx)
router.post('/bank-soal/import', upload.single('file'), async (req, res) => {
  if (!req.file) { req.flash('error','File wajib.'); return res.redirect('/admin/bank-soal'); }
  try {
    const { parseBankSoalFile } = require('../utils/bankSoalImport');
    const { rows, errors } = await parseBankSoalFile(req.file.path);
    const stmt = db.prepare('INSERT INTO bank_soal (kelas_id,subtest,soal,tipe,opsi_json,jawaban_json,poin,penjelasan,created_by) VALUES (?,?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((items) => {
      let n = 0;
      for (const r of items) {
        stmt.run(r.kelas_id, r.subtest, r.soal, r.tipe, r.opsi_json, r.jawaban_json, r.poin, r.penjelasan, req.session.user.id);
        n++;
      }
      return n;
    });
    const ok = insertMany(rows);
    if (errors.length) req.flash('error', `${errors.length} baris diabaikan: ${errors.slice(0,3).join(' | ')}${errors.length>3?'...':''}`);
    req.flash('success', `${ok} soal diimport.`);
  } catch (e) {
    req.flash('error', 'Gagal import: ' + e.message);
  }
  res.redirect('/admin/bank-soal');
});

// Template Excel bank soal
router.get('/bank-soal/template.xlsx', (req, res) => {
  const data = [
    { subtest:'PU', soal:'Jika $x^2+5x+6=0$ maka $x$ adalah?', tipe:'pg', opsi_json:'["-2 dan -3","2 dan 3","1 dan 6","0 dan 5"]', jawaban_json:'"A"', poin:1, penjelasan:'Faktorkan: $(x+2)(x+3)=0$ maka $x=-2$ atau $x=-3$' },
    { subtest:'PPU', soal:'Ibukota Indonesia adalah?', tipe:'pg', opsi_json:'["Jakarta","Bandung","Surabaya","Medan"]', jawaban_json:'"A"', poin:1, penjelasan:'Jakarta adalah ibukota Indonesia.' },
    { subtest:'PBM', soal:'Apakah 2+2=4?', tipe:'benar_salah', opsi_json:'[]', jawaban_json:'"true"', poin:1, penjelasan:'Benar, operasi aritmatika dasar.' },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Bank Soal');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="template-bank-soal.xlsx"');
  res.send(buf);
});

// ==================== CBT / UJIAN ====================
router.get('/ujian', (req, res) => {
  const ujian = db.prepare('SELECT uj.*,u.name AS creator,(SELECT COUNT(*) FROM ujian_soal WHERE ujian_id=uj.id) jml_soal FROM ujian uj JOIN users u ON u.id=uj.created_by ORDER BY uj.created_at DESC').all();
  res.render('admin/ujian', { title: 'CBT / Ujian / Kuis', ujian });
});
router.get('/ujian/new', (req, res) => {
  const kelas = db.prepare('SELECT id,nama FROM kelas').all();
  res.render('admin/ujian-form', { title: 'Buat Ujian', uj: null, kelas });
});
router.post('/ujian', (req, res) => {
  const { judul,deskripsi,tipe,kelas_id,durasi_menit,waktu_mulai,waktu_selesai,acak_soal,acak_opsi,poin_negatif,timer_per_soal,anti_cheat,max_attempt } = req.body;
  const info = db.prepare('INSERT INTO ujian (judul,deskripsi,tipe,kelas_id,created_by,durasi_menit,waktu_mulai,waktu_selesai,acak_soal,acak_opsi,poin_negatif,timer_per_soal,anti_cheat,max_attempt,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(judul,deskripsi,tipe||'kuis',kelas_id||null,req.session.user.id,durasi_menit||60,waktu_mulai||null,waktu_selesai||null,acak_soal?1:0,acak_opsi?1:0,poin_negatif||0,timer_per_soal||0,anti_cheat?1:0,max_attempt||1,'draft');
  req.flash('success','Ujian dibuat.'); res.redirect('/admin/ujian/' + info.lastInsertRowid + '/soal');
});
router.get('/ujian/:id/soal', (req, res) => {
  const uj = db.prepare('SELECT * FROM ujian WHERE id=?').get(req.params.id);
  if (!uj) return res.redirect('/admin/ujian');
  const soalTerpilih = db.prepare('SELECT us.*, bs.soal, bs.tipe, bs.subtest, bs.poin FROM ujian_soal us JOIN bank_soal bs ON bs.id=us.bank_soal_id WHERE us.ujian_id=? ORDER BY us.urutan').all(uj.id);
  const bankSoal = db.prepare('SELECT id,soal,tipe,subtest,poin FROM bank_soal ORDER BY subtest,created_at DESC').all();
  res.render('admin/ujian-soal', { title: 'Pilih Soal: ' + uj.judul, uj, soalTerpilih, bankSoal });
});
router.post('/ujian/:id/soal', (req, res) => {
  const soalIds = Array.isArray(req.body.soal_ids) ? req.body.soal_ids : [req.body.soal_ids].filter(Boolean);
  let urutan = db.prepare('SELECT MAX(urutan) m FROM ujian_soal WHERE ujian_id=?').get(req.params.id)?.m || 0;
  soalIds.forEach(sid => { urutan++; try { db.prepare('INSERT INTO ujian_soal (ujian_id,bank_soal_id,urutan) VALUES (?,?,?)').run(req.params.id,sid,urutan); } catch(e){} });
  req.flash('success',`${soalIds.length} soal ditambahkan.`); res.redirect('/admin/ujian/' + req.params.id + '/soal');
});
router.post('/ujian/:id/publish', (req, res) => {
  db.prepare("UPDATE ujian SET status='aktif' WHERE id=?").run(req.params.id);
  // Notify peserta kelas
  const uj = db.prepare('SELECT * FROM ujian WHERE id=?').get(req.params.id);
  if (uj && uj.kelas_id) {
    const peserta = db.prepare('SELECT user_id FROM kelas_member WHERE kelas_id=?').all(uj.kelas_id);
    peserta.forEach(p => {
      notifyUser(p.user_id, 'Ujian/Tugas Baru', `Tutor mempublikasikan: ${uj.judul} (durasi ${uj.durasi_menit} menit). Cek tab Ujian Anda.`, 'info');
    });
  }
  req.flash('success','Ujian dipublikasi.'); res.redirect('/admin/ujian');
});
router.get('/ujian/:id/hasil', (req, res) => {
  const uj = db.prepare('SELECT * FROM ujian WHERE id=?').get(req.params.id);
  const peserta = db.prepare('SELECT up.*,u.name FROM ujian_peserta up JOIN users u ON u.id=up.user_id WHERE up.ujian_id=? ORDER BY up.nilai DESC').all(req.params.id);
  res.render('admin/ujian-hasil', { title: 'Hasil: ' + (uj?.judul||''), uj, peserta });
});


// ==================== USULAN BUKU ====================
router.get('/usulan', (req, res) => {
  const list = db.prepare('SELECT ub.*,u.name AS user_name FROM usulan_buku ub JOIN users u ON u.id=ub.user_id ORDER BY ub.created_at DESC').all();
  res.render('admin/usulan', { title: 'Usulan Buku', list });
});
router.post('/usulan/:id/approve', (req, res) => { db.prepare("UPDATE usulan_buku SET status='disetujui',reviewed_by=? WHERE id=?").run(req.session.user.id, req.params.id); req.flash('success','Usulan disetujui.'); res.redirect('/admin/usulan'); });
router.post('/usulan/:id/reject', (req, res) => { db.prepare("UPDATE usulan_buku SET status='ditolak',reviewed_by=?,catatan_admin=? WHERE id=?").run(req.session.user.id, req.body.catatan||null, req.params.id); req.flash('success','Usulan ditolak.'); res.redirect('/admin/usulan'); });

// ==================== PENGUMUMAN ====================
router.get('/pengumuman', (req, res) => { res.render('admin/pengumuman', { title: 'Pengumuman', list: db.prepare('SELECT * FROM pengumuman ORDER BY created_at DESC').all() }); });
router.post('/pengumuman', (req, res) => { db.prepare('INSERT INTO pengumuman (judul,isi,tipe,author_id) VALUES (?,?,?,?)').run(req.body.judul,req.body.isi,req.body.tipe||'berita',req.session.user.id); req.flash('success','Dipublikasi.'); res.redirect('/admin/pengumuman'); });
router.delete('/pengumuman/:id', (req, res) => { db.prepare('DELETE FROM pengumuman WHERE id=?').run(req.params.id); req.flash('success','Dihapus.'); res.redirect('/admin/pengumuman'); });

// ==================== GALERI ====================
router.get('/galeri', (req, res) => { res.render('admin/galeri', { title: 'Galeri', list: db.prepare('SELECT g.*,u.name AS uploader FROM galeri g LEFT JOIN users u ON u.id=g.uploaded_by ORDER BY g.created_at DESC').all() }); });
router.post('/galeri', upload.single('file'), (req, res) => {
  db.prepare('INSERT INTO galeri (judul,deskripsi,file,file_url,tipe,uploaded_by) VALUES (?,?,?,?,?,?)').run(req.body.judul,req.body.deskripsi||null,req.file?.filename||null,req.body.file_url||null,req.body.tipe||'foto',req.session.user.id);
  req.flash('success','Ditambahkan.'); res.redirect('/admin/galeri');
});
router.delete('/galeri/:id', (req, res) => { db.prepare('DELETE FROM galeri WHERE id=?').run(req.params.id); req.flash('success','Dihapus.'); res.redirect('/admin/galeri'); });

// ==================== KALENDER ====================
router.get('/kalender', (req, res) => { res.render('admin/kalender', { title: 'Kalender Kegiatan', events: db.prepare('SELECT * FROM kalender ORDER BY tanggal_mulai DESC').all() }); });
router.post('/kalender', (req, res) => { db.prepare('INSERT INTO kalender (judul,deskripsi,tipe,tanggal_mulai,tanggal_selesai,kelas_id,created_by) VALUES (?,?,?,?,?,?,?)').run(req.body.judul,req.body.deskripsi,req.body.tipe||'event',req.body.tanggal_mulai,req.body.tanggal_selesai||null,req.body.kelas_id||null,req.session.user.id); req.flash('success','Event ditambahkan.'); res.redirect('/admin/kalender'); });
router.delete('/kalender/:id', (req, res) => { db.prepare('DELETE FROM kalender WHERE id=?').run(req.params.id); req.flash('success','Dihapus.'); res.redirect('/admin/kalender'); });

// ==================== LAPORAN & SETTINGS ====================
router.get('/laporan', (req, res) => {
  const bukuTop = db.prepare('SELECT judul,dibaca,rating FROM buku ORDER BY dibaca DESC LIMIT 10').all();
  const muridTop = db.prepare("SELECT u.name,COUNT(p.id) total FROM users u LEFT JOIN peminjaman p ON p.user_id=u.id WHERE u.role='murid' GROUP BY u.id ORDER BY total DESC LIMIT 10").all();
  res.render('admin/laporan', { title: 'Laporan', bukuTop, muridTop });
});
router.get('/laporan/export.csv', (req, res) => {
  const rows = db.prepare('SELECT b.judul,b.penulis,b.tahun,b.stok,b.dibaca,b.rating FROM buku b ORDER BY b.judul').all();
  let csv='Judul,Penulis,Tahun,Stok,Dibaca,Rating\n'; rows.forEach(r => { csv+=`"${r.judul}","${r.penulis}",${r.tahun},${r.stok},${r.dibaca},${r.rating}\n`; });
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="laporan.csv"'); res.send(csv);
});
router.get('/laporan/export.pdf', (req, res) => {
  const rows = db.prepare('SELECT judul,penulis,tahun,stok,dibaca,rating FROM buku ORDER BY dibaca DESC LIMIT 50').all();
  const doc = new PDFDocument({margin:40,size:'A4'}); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition','attachment; filename="laporan.pdf"'); doc.pipe(res);
  doc.fontSize(18).text('Laporan E-Library Rubela',{align:'center'}); doc.moveDown();
  doc.fontSize(9); rows.forEach((r,i) => { doc.text(`${i+1}. ${r.judul} - ${r.penulis} (${r.tahun}) | Stok:${r.stok} Dibaca:${r.dibaca} Rating:${r.rating}`); });
  doc.end();
});
router.get('/settings', (req, res) => {
  const settings = {}; db.prepare('SELECT * FROM setting').all().forEach(s => settings[s.key]=s.value);
  res.render('admin/settings', { title: 'Pengaturan', settings });
});
router.post('/settings', (req, res) => {
  Object.entries(req.body).forEach(([k,v]) => { db.prepare('INSERT OR REPLACE INTO setting (key,value) VALUES (?,?)').run(k,v); });
  req.flash('success','Pengaturan disimpan.'); res.redirect('/admin/settings');
});

// ==================== CHAT ====================
router.get('/chat', (req, res) => {
  const rooms = db.prepare('SELECT cr.*,(SELECT COUNT(*) FROM chat_member WHERE room_id=cr.id) members FROM chat_room cr ORDER BY cr.created_at DESC').all();
  res.render('admin/chat', { title: 'Chat', rooms });
});

// ==================== WHATSAPP GATEWAY (admin) ====================
router.get('/wa', (req, res) => {
  const kontak = db.prepare('SELECT * FROM kontak ORDER BY nama').all();
  const wa_logs = db.prepare('SELECT wl.*,u.name AS sender FROM wa_log wl LEFT JOIN users u ON u.id=wl.sender_id ORDER BY wl.created_at DESC LIMIT 50').all();
  const grups = db.prepare('SELECT DISTINCT grup FROM kontak WHERE grup IS NOT NULL').all().map(r=>r.grup);
  res.render('admin/wa', { title: 'WhatsApp Gateway', kontak, wa_logs, grups });
});
router.post('/wa/kirim', async (req, res) => {
  const { sendWA } = require('../utils/whatsapp');
  const { phone, pesan, target_type, grup } = req.body;
  let targets = [];
  if (target_type === 'single') targets = [phone];
  else if (target_type === 'grup' && grup) targets = db.prepare('SELECT phone FROM kontak WHERE grup=?').all(grup).map(k=>k.phone);
  else if (target_type === 'all_kontak') targets = db.prepare('SELECT phone FROM kontak').all().map(k=>k.phone);
  else if (target_type === 'all_murid') targets = db.prepare("SELECT phone FROM users WHERE role='murid' AND status='active' AND phone IS NOT NULL").all().map(k=>k.phone);
  let sent=0, failed=0;
  for (const t of targets) {
    const r = await sendWA(t, pesan);
    db.prepare('INSERT INTO wa_log (phone,pesan,status,response,sender_id) VALUES (?,?,?,?,?)')
      .run(t, pesan, r.ok?'sent':'failed', JSON.stringify(r), req.session.user.id);
    if (r.ok) sent++; else failed++;
  }
  req.flash('success', `Pesan terkirim: ${sent} berhasil, ${failed} gagal.`);
  res.redirect('/admin/wa');
});
router.post('/wa/kontak', (req, res) => {
  db.prepare('INSERT INTO kontak (nama,phone,grup,catatan,created_by) VALUES (?,?,?,?,?)')
    .run(req.body.nama, req.body.phone, req.body.grup||null, req.body.catatan||null, req.session.user.id);
  req.flash('success','Kontak ditambahkan.'); res.redirect('/admin/wa');
});
router.delete('/wa/kontak/:id', (req, res) => {
  db.prepare('DELETE FROM kontak WHERE id=?').run(req.params.id);
  req.flash('success','Dihapus.'); res.redirect('/admin/wa');
});
router.get('/wa/kontak/export.xlsx', (req, res) => {
  const kontak = db.prepare('SELECT nama,phone,grup,catatan FROM kontak ORDER BY nama').all();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kontak), 'Kontak');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="kontak-rubela.xlsx"');
  res.send(buf);
});
router.post('/wa/kontak/import', upload.single('file'), (req, res) => {
  if (!req.file) { req.flash('error','File wajib.'); return res.redirect('/admin/wa'); }
  try {
    const wb = XLSX.readFile(req.file.path);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let ok=0;
    rows.forEach(r => {
      const nama=r.nama||r.Nama, phone=r.phone||r.Phone||r.HP;
      if (!nama||!phone) return;
      db.prepare('INSERT INTO kontak (nama,phone,grup,catatan,created_by) VALUES (?,?,?,?,?)')
        .run(nama, String(phone), r.grup||r.Grup||null, r.catatan||null, req.session.user.id);
      ok++;
    });
    req.flash('success',`${ok} kontak diimport.`);
  } catch(e) { req.flash('error','Gagal: '+e.message); }
  res.redirect('/admin/wa');
});

// ==================== KARTU ANGGOTA (admin) ====================
router.get('/kartu', (req, res) => {
  const users = db.prepare("SELECT id,nomor_anggota,name,email,role,status FROM users WHERE status='active' ORDER BY role, name").all();
  res.render('admin/kartu', { title: 'Kartu Anggota', users });
});

// ==================== REKAP ====================
router.get('/rekap', (req, res) => {
  const totalPinjam = db.prepare('SELECT COUNT(*) c FROM peminjaman').get().c;
  const totalDenda = db.prepare('SELECT COALESCE(SUM(denda),0) c FROM peminjaman WHERE denda>0').get().c;
  const totalUjian = db.prepare('SELECT COUNT(*) c FROM ujian').get().c;
  const totalSoal = db.prepare('SELECT COUNT(*) c FROM bank_soal').get().c;
  res.render('admin/rekap', { title: 'Rekapitulasi', totalPinjam, totalDenda, totalUjian, totalSoal });
});

module.exports = router;
