const express = require('express');
const db = require('../db/database');
const upload = require('../middleware/upload');
const { ensureRole } = require('../middleware/auth');

const router = express.Router();
router.use(ensureRole('tutor'));

// DASHBOARD
router.get('/', (req, res) => {
  const tid = req.session.user.id;
  const s = {
    kelas: db.prepare('SELECT COUNT(*) c FROM kelas WHERE tutor_id=?').get(tid).c,
    materi: db.prepare('SELECT COUNT(*) c FROM materi WHERE tutor_id=?').get(tid).c,
    rekomendasi: db.prepare('SELECT COUNT(*) c FROM rekomendasi WHERE tutor_id=?').get(tid).c,
    quiz: db.prepare('SELECT COUNT(*) c FROM quiz WHERE tutor_id=?').get(tid).c,
    murid: db.prepare(
      `SELECT COUNT(DISTINCT km.user_id) c FROM kelas_member km
       JOIN kelas k ON k.id=km.kelas_id WHERE k.tutor_id=?`
    ).get(tid).c,
  };

  const kelasList = db.prepare(
    `SELECT k.*, (SELECT COUNT(*) FROM kelas_member km WHERE km.kelas_id=k.id) jumlah
     FROM kelas k WHERE tutor_id=? ORDER BY created_at DESC LIMIT 5`
  ).all(tid);

  const materiTerbaru = db.prepare(
    `SELECT m.*, k.nama AS kelas_nama FROM materi m LEFT JOIN kelas k ON k.id=m.kelas_id
     WHERE m.tutor_id=? ORDER BY m.created_at DESC LIMIT 5`
  ).all(tid);

  res.render('tutor/dashboard', { title: 'Dashboard Tutor', s, kelasList, materiTerbaru });
});

// KELAS
router.get('/kelas', (req, res) => {
  const list = db.prepare(
    `SELECT k.*, (SELECT COUNT(*) FROM kelas_member km WHERE km.kelas_id=k.id) jumlah
     FROM kelas k WHERE tutor_id=? ORDER BY created_at DESC`
  ).all(req.session.user.id);
  res.render('tutor/kelas', { title: 'Kelas', list });
});

router.post('/kelas', (req, res) => {
  const { nama, deskripsi, kode } = req.body;
  try {
    db.prepare(
      'INSERT INTO kelas (nama,deskripsi,tutor_id,kode) VALUES (?,?,?,?)'
    ).run(nama, deskripsi, req.session.user.id, kode.toUpperCase());
    req.flash('success', 'Kelas dibuat.');
  } catch (e) {
    req.flash('error', 'Kode kelas sudah digunakan.');
  }
  res.redirect('/tutor/kelas');
});

router.get('/kelas/:id', (req, res) => {
  const kelas = db.prepare('SELECT * FROM kelas WHERE id=? AND tutor_id=?').get(req.params.id, req.session.user.id);
  if (!kelas) return res.redirect('/tutor/kelas');
  const members = db.prepare(
    `SELECT u.*, km.joined_at FROM kelas_member km JOIN users u ON u.id=km.user_id WHERE km.kelas_id=?`
  ).all(kelas.id);
  const semuaMurid = db.prepare("SELECT id,name,email FROM users WHERE role='murid'").all();
  const materi = db.prepare('SELECT * FROM materi WHERE kelas_id=? ORDER BY created_at DESC').all(kelas.id);
  res.render('tutor/kelas-detail', { title: kelas.nama, kelas, members, semuaMurid, materi });
});

router.post('/kelas/:id/invite', (req, res) => {
  const { user_id } = req.body;
  try {
    db.prepare('INSERT INTO kelas_member (kelas_id,user_id) VALUES (?,?)').run(req.params.id, user_id);
    req.flash('success', 'Murid ditambahkan.');
  } catch (e) {
    req.flash('error', 'Murid sudah ada di kelas.');
  }
  res.redirect('/tutor/kelas/' + req.params.id);
});

// MATERI
router.get('/materi', (req, res) => {
  const list = db.prepare(
    `SELECT m.*, k.nama AS kelas_nama FROM materi m LEFT JOIN kelas k ON k.id=m.kelas_id
     WHERE m.tutor_id=? ORDER BY m.created_at DESC`
  ).all(req.session.user.id);
  const kelasList = db.prepare('SELECT * FROM kelas WHERE tutor_id=?').all(req.session.user.id);
  res.render('tutor/materi', { title: 'Materi', list, kelasList });
});

router.post('/materi', upload.single('file'), (req, res) => {
  const { judul, deskripsi, tipe, kelas_id, link } = req.body;
  const file = req.file?.filename || null;
  db.prepare(
    'INSERT INTO materi (tutor_id,kelas_id,judul,deskripsi,tipe,file,link) VALUES (?,?,?,?,?,?,?)'
  ).run(req.session.user.id, kelas_id || null, judul, deskripsi, tipe, file, link || null);
  req.flash('success', 'Materi diupload.');
  res.redirect('/tutor/materi');
});

router.delete('/materi/:id', (req, res) => {
  db.prepare('DELETE FROM materi WHERE id=? AND tutor_id=?').run(req.params.id, req.session.user.id);
  req.flash('success', 'Materi dihapus.');
  res.redirect('/tutor/materi');
});

// REKOMENDASI BUKU
router.get('/rekomendasi', (req, res) => {
  const list = db.prepare(
    `SELECT r.*, b.judul, b.penulis, k.nama AS kelas_nama FROM rekomendasi r
     JOIN buku b ON b.id=r.buku_id LEFT JOIN kelas k ON k.id=r.kelas_id
     WHERE r.tutor_id=? ORDER BY r.created_at DESC`
  ).all(req.session.user.id);
  const bukuList = db.prepare('SELECT id,judul,penulis FROM buku ORDER BY judul').all();
  const kelasList = db.prepare('SELECT * FROM kelas WHERE tutor_id=?').all(req.session.user.id);
  res.render('tutor/rekomendasi', { title: 'Rekomendasi Buku', list, bukuList, kelasList });
});

router.post('/rekomendasi', (req, res) => {
  const { buku_id, kelas_id, catatan } = req.body;
  db.prepare(
    'INSERT INTO rekomendasi (tutor_id,buku_id,kelas_id,catatan) VALUES (?,?,?,?)'
  ).run(req.session.user.id, buku_id, kelas_id || null, catatan);
  req.flash('success', 'Rekomendasi ditambahkan.');
  res.redirect('/tutor/rekomendasi');
});

router.delete('/rekomendasi/:id', (req, res) => {
  db.prepare('DELETE FROM rekomendasi WHERE id=? AND tutor_id=?').run(req.params.id, req.session.user.id);
  res.redirect('/tutor/rekomendasi');
});

// QUIZ
router.get('/quiz', (req, res) => {
  const list = db.prepare(
    `SELECT q.*, k.nama AS kelas_nama,
      (SELECT COUNT(*) FROM quiz_soal qs WHERE qs.quiz_id=q.id) jumlah_soal
     FROM quiz q LEFT JOIN kelas k ON k.id=q.kelas_id
     WHERE q.tutor_id=? ORDER BY q.created_at DESC`
  ).all(req.session.user.id);
  const kelasList = db.prepare('SELECT * FROM kelas WHERE tutor_id=?').all(req.session.user.id);
  res.render('tutor/quiz', { title: 'Quiz/Tugas', list, kelasList });
});

router.post('/quiz', (req, res) => {
  const { judul, deskripsi, kelas_id, deadline } = req.body;
  db.prepare(
    'INSERT INTO quiz (tutor_id,kelas_id,judul,deskripsi,deadline) VALUES (?,?,?,?,?)'
  ).run(req.session.user.id, kelas_id || null, judul, deskripsi, deadline || null);
  req.flash('success', 'Quiz dibuat.');
  res.redirect('/tutor/quiz');
});

router.get('/quiz/:id', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quiz WHERE id=? AND tutor_id=?').get(req.params.id, req.session.user.id);
  if (!quiz) return res.redirect('/tutor/quiz');
  const soal = db.prepare('SELECT * FROM quiz_soal WHERE quiz_id=?').all(quiz.id);
  const jawaban = db.prepare(
    `SELECT qj.*, u.name FROM quiz_jawaban qj JOIN users u ON u.id=qj.user_id WHERE qj.quiz_id=?`
  ).all(quiz.id);
  res.render('tutor/quiz-detail', { title: quiz.judul, quiz, soal, jawaban });
});

router.post('/quiz/:id/soal', (req, res) => {
  const { soal, opsi_a, opsi_b, opsi_c, opsi_d, jawaban } = req.body;
  db.prepare(
    'INSERT INTO quiz_soal (quiz_id,soal,opsi_a,opsi_b,opsi_c,opsi_d,jawaban) VALUES (?,?,?,?,?,?,?)'
  ).run(req.params.id, soal, opsi_a, opsi_b, opsi_c, opsi_d, jawaban);
  req.flash('success', 'Soal ditambahkan.');
  res.redirect('/tutor/quiz/' + req.params.id);
});

// FORUM
router.get('/forum', (req, res) => {
  const list = db.prepare(
    `SELECT f.*, u.name, (SELECT COUNT(*) FROM forum_komentar WHERE forum_id=f.id) komentar
     FROM forum f JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC`
  ).all();
  res.render('tutor/forum', { title: 'Forum Diskusi', list });
});

router.post('/forum', (req, res) => {
  const { judul, isi, kategori } = req.body;
  db.prepare(
    'INSERT INTO forum (user_id,judul,isi,kategori) VALUES (?,?,?,?)'
  ).run(req.session.user.id, judul, isi, kategori || 'umum');
  req.flash('success', 'Topik diposting.');
  res.redirect('/tutor/forum');
});

router.get('/forum/:id', (req, res) => {
  const item = db.prepare(
    'SELECT f.*, u.name FROM forum f JOIN users u ON u.id=f.user_id WHERE f.id=?'
  ).get(req.params.id);
  if (!item) return res.redirect('/tutor/forum');
  const komentar = db.prepare(
    'SELECT k.*, u.name FROM forum_komentar k JOIN users u ON u.id=k.user_id WHERE k.forum_id=? ORDER BY k.created_at'
  ).all(item.id);
  res.render('tutor/forum-detail', { title: item.judul, item, komentar, backPath: '/tutor/forum' });
});

router.post('/forum/:id/komentar', (req, res) => {
  db.prepare('INSERT INTO forum_komentar (forum_id,user_id,isi) VALUES (?,?,?)')
    .run(req.params.id, req.session.user.id, req.body.isi);
  res.redirect('/tutor/forum/' + req.params.id);
});

// MURID
router.get('/murid', (req, res) => {
  const list = db.prepare(
    `SELECT DISTINCT u.*, k.nama AS kelas_nama FROM users u
     JOIN kelas_member km ON km.user_id=u.id
     JOIN kelas k ON k.id=km.kelas_id
     WHERE k.tutor_id=? AND u.role='murid'`
  ).all(req.session.user.id);
  res.render('tutor/murid', { title: 'Daftar Murid', list });
});

// PROGRESS MURID
router.get('/progress', (req, res) => {
  const tid = req.session.user.id;
  const rows = db.prepare(
    `SELECT u.name, b.judul, pb.halaman_terakhir, pb.persentase, pb.updated_at
     FROM progress_baca pb
     JOIN users u ON u.id=pb.user_id
     JOIN buku b ON b.id=pb.buku_id
     WHERE u.id IN (
       SELECT DISTINCT km.user_id FROM kelas_member km
       JOIN kelas k ON k.id=km.kelas_id WHERE k.tutor_id=?
     )
     ORDER BY pb.updated_at DESC`
  ).all(tid);
  res.render('tutor/progress', { title: 'Progress Murid', rows });
});

module.exports = router;
