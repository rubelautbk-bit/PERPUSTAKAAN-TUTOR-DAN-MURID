const express = require('express');
const db = require('../db/database');
const upload = require('../middleware/upload');
const { ensureRole } = require('../middleware/auth');
const { notifyUser } = require('../utils/whatsapp');
const { assignNomorAnggota } = require('../utils/members');
const XLSX = require('xlsx');

const router = express.Router();
router.use(ensureRole('tutor'));

// Dashboard
router.get('/', (req, res) => {
  const tid = req.session.user.id;
  const s = {
    kelas: db.prepare('SELECT COUNT(*) c FROM kelas WHERE tutor_id=?').get(tid).c,
    murid: db.prepare('SELECT COUNT(DISTINCT km.user_id) c FROM kelas_member km JOIN kelas k ON k.id=km.kelas_id WHERE k.tutor_id=?').get(tid).c,
    materi: db.prepare('SELECT COUNT(*) c FROM materi WHERE tutor_id=?').get(tid).c,
    ujian: db.prepare('SELECT COUNT(*) c FROM ujian WHERE created_by=?').get(tid).c,
    pending: db.prepare("SELECT COUNT(*) c FROM users WHERE status='pending'").get().c,
  };
  const kelasList = db.prepare('SELECT k.*,(SELECT COUNT(*) FROM kelas_member WHERE kelas_id=k.id) jumlah FROM kelas k WHERE tutor_id=? ORDER BY created_at DESC LIMIT 5').all(tid);
  res.render('tutor/dashboard', { title: 'Dashboard Tutor', s, kelasList });
});

// Aktivasi Keanggotaan
router.get('/aktivasi', (req, res) => {
  const pending = db.prepare("SELECT * FROM users WHERE status='pending' ORDER BY created_at DESC").all();
  res.render('tutor/aktivasi', { title: 'Aktivasi Keanggotaan', pending });
});
router.post('/aktivasi/:id/approve', (req, res) => {
  db.prepare("UPDATE users SET status='active',activated_by=?,activated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.session.user.id, req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (u) { assignNomorAnggota(u.id); notifyUser(u.id, 'Akun Diaktivasi!', 'Selamat! Akun kamu sudah aktif. Silakan login.', 'sukses'); }
  req.flash('success', 'User diaktivasi.'); res.redirect('/tutor/aktivasi');
});
router.post('/aktivasi/:id/reject', (req, res) => {
  db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(req.params.id);
  req.flash('success', 'User ditolak.'); res.redirect('/tutor/aktivasi');
});

// Kelas
router.get('/kelas', (req, res) => {
  const list = db.prepare('SELECT k.*,(SELECT COUNT(*) FROM kelas_member WHERE kelas_id=k.id) jumlah FROM kelas k WHERE tutor_id=? ORDER BY created_at DESC').all(req.session.user.id);
  res.render('tutor/kelas', { title: 'Kelas Saya', list });
});
router.get('/kelas/semua', (req, res) => {
  const all = db.prepare('SELECT k.*,u.name AS tutor_name,(SELECT COUNT(*) FROM kelas_member WHERE kelas_id=k.id) jumlah FROM kelas k JOIN users u ON u.id=k.tutor_id ORDER BY k.nama').all();
  res.render('tutor/kelas-semua', { title: 'Semua Kelas', all });
});
router.post('/kelas', (req, res) => {
  const { nama, subtest, deskripsi, kode } = req.body;
  try { db.prepare('INSERT INTO kelas (nama,subtest,deskripsi,tutor_id,kode) VALUES (?,?,?,?,?)').run(nama, subtest||null, deskripsi, req.session.user.id, kode.toUpperCase()); req.flash('success','Kelas dibuat.'); }
  catch(e) { req.flash('error','Kode sudah ada.'); }
  res.redirect('/tutor/kelas');
});
router.get('/kelas/:id', (req, res) => {
  const kelas = db.prepare('SELECT * FROM kelas WHERE id=?').get(req.params.id);
  if (!kelas) return res.redirect('/tutor/kelas');
  const members = db.prepare('SELECT u.*,km.joined_at FROM kelas_member km JOIN users u ON u.id=km.user_id WHERE km.kelas_id=?').all(kelas.id);
  const allMurid = db.prepare("SELECT id,name,email FROM users WHERE role='murid' AND status='active' AND id NOT IN (SELECT user_id FROM kelas_member WHERE kelas_id=?)").all(kelas.id);
  const pertemuan = db.prepare('SELECT * FROM pertemuan WHERE kelas_id=? ORDER BY nomor').all(kelas.id);
  const materi = db.prepare('SELECT m.*,b.judul AS buku_judul FROM materi m LEFT JOIN buku b ON b.id=m.buku_id WHERE m.kelas_id=? ORDER BY m.created_at DESC').all(kelas.id);
  const bukuList = db.prepare('SELECT id,judul,penulis FROM buku ORDER BY judul').all();
  const rekomendasi = db.prepare('SELECT r.*, b.judul, b.penulis FROM rekomendasi r JOIN buku b ON b.id=r.buku_id WHERE r.kelas_id=? ORDER BY r.created_at DESC').all(kelas.id);
  const tugasList = db.prepare('SELECT * FROM ujian WHERE kelas_id=? ORDER BY created_at DESC').all(kelas.id);
  const kelasLain = db.prepare("SELECT k.*, u.name AS tutor_name FROM kelas k JOIN users u ON u.id=k.tutor_id WHERE k.id!=? AND k.status='active' ORDER BY k.nama").all(kelas.id);
  res.render('tutor/kelas-detail', { title: kelas.nama, kelas, members, allMurid, semuaMurid: allMurid, pertemuan, materi, bukuList, rekomendasi, tugasList, kelasLain });
});

// Delete rekomendasi dari kelas
router.delete('/kelas/:id/rekomendasi/:rid', (req, res) => {
  db.prepare('DELETE FROM rekomendasi WHERE id=? AND kelas_id=?').run(req.params.rid, req.params.id);
  req.flash('success', 'Rekomendasi dihapus.');
  res.redirect('/tutor/kelas/' + req.params.id);
});

// Kirim materi & rekomendasi ke kelas lain
router.post('/kelas/:id/kirim-materi', (req, res) => {
  const sourceId = req.params.id;
  const targets = Array.isArray(req.body.target_ids) ? req.body.target_ids : [req.body.target_ids].filter(Boolean);
  const includeMat = !!req.body.include_materi;
  const includeRek = !!req.body.include_rekomendasi;
  if (targets.length === 0) { req.flash('error','Pilih kelas tujuan.'); return res.redirect('/tutor/kelas/'+sourceId); }

  let totalMat=0, totalRek=0;
  if (includeMat) {
    const source = db.prepare('SELECT * FROM materi WHERE kelas_id=?').all(sourceId);
    const ins = db.prepare('INSERT INTO materi (kelas_id,tutor_id,judul,deskripsi,tipe,file,link,buku_id) VALUES (?,?,?,?,?,?,?,?)');
    targets.forEach(t => { source.forEach(m => { ins.run(t, req.session.user.id, m.judul, m.deskripsi, m.tipe, m.file, m.link, m.buku_id); totalMat++; }); });
  }
  if (includeRek) {
    const source = db.prepare('SELECT * FROM rekomendasi WHERE kelas_id=?').all(sourceId);
    const ins = db.prepare('INSERT INTO rekomendasi (tutor_id,buku_id,kelas_id,pertemuan_id,catatan) VALUES (?,?,?,?,?)');
    targets.forEach(t => { source.forEach(r => { ins.run(req.session.user.id, r.buku_id, t, null, r.catatan); totalRek++; }); });
  }
  req.flash('success', `Dikirim ke ${targets.length} kelas: ${totalMat} materi, ${totalRek} rekomendasi.`);
  res.redirect('/tutor/kelas/' + sourceId);
});
router.post('/kelas/:id/members', (req, res) => {
  const userIds = Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_ids].filter(Boolean);
  let added=0; userIds.forEach(uid => { try { db.prepare('INSERT INTO kelas_member (kelas_id,user_id) VALUES (?,?)').run(req.params.id,uid); added++; } catch(e){} });
  req.flash('success',`${added} murid ditambahkan.`); res.redirect('/tutor/kelas/'+req.params.id);
});
router.delete('/kelas/:id/members/:uid', (req, res) => { db.prepare('DELETE FROM kelas_member WHERE kelas_id=? AND user_id=?').run(req.params.id,req.params.uid); req.flash('success','Dihapus.'); res.redirect('/tutor/kelas/'+req.params.id); });
// Pertemuan
router.post('/kelas/:id/pertemuan', (req, res) => {
  const { nomor, judul, deskripsi, tanggal } = req.body;
  db.prepare('INSERT INTO pertemuan (kelas_id,nomor,judul,deskripsi,tanggal) VALUES (?,?,?,?,?)').run(req.params.id,nomor,judul,deskripsi,tanggal||null);
  req.flash('success','Pertemuan ditambahkan.'); res.redirect('/tutor/kelas/'+req.params.id);
});
// Materi (dari buku atau link)
router.post('/kelas/:id/materi', upload.single('file'), (req, res) => {
  const { judul, deskripsi, tipe, link, buku_id, pertemuan_id } = req.body;
  db.prepare('INSERT INTO materi (kelas_id,pertemuan_id,tutor_id,judul,deskripsi,tipe,file,link,buku_id) VALUES (?,?,?,?,?,?,?,?,?)').run(req.params.id,pertemuan_id||null,req.session.user.id,judul,deskripsi,tipe||'link',req.file?.filename||null,link||null,buku_id||null);
  req.flash('success','Materi ditambahkan.'); res.redirect('/tutor/kelas/'+req.params.id);
});
// Rekomendasi buku per kelas
router.post('/kelas/:id/rekomendasi', (req, res) => {
  const { buku_id, pertemuan_id, catatan } = req.body;
  db.prepare('INSERT INTO rekomendasi (tutor_id,buku_id,kelas_id,pertemuan_id,catatan) VALUES (?,?,?,?,?)').run(req.session.user.id,buku_id,req.params.id,pertemuan_id||null,catatan||null);
  req.flash('success','Rekomendasi ditambahkan.'); res.redirect('/tutor/kelas/'+req.params.id);
});
// Export/Import materi antar kelas
router.get('/kelas/:id/materi/export', (req, res) => {
  const materi = db.prepare('SELECT judul,deskripsi,tipe,link,buku_id FROM materi WHERE kelas_id=?').all(req.params.id);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(materi), 'Materi');
  const buf = XLSX.write(wb, {type:'buffer',bookType:'xlsx'});
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="materi-kelas.xlsx"'); res.send(buf);
});
router.post('/kelas/:id/materi/import', upload.single('file'), (req, res) => {
  if (!req.file) { req.flash('error','File wajib.'); return res.redirect('/tutor/kelas/'+req.params.id); }
  const wb = XLSX.readFile(req.file.path); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let ok=0; rows.forEach(r => { if(!r.judul) return; db.prepare('INSERT INTO materi (kelas_id,tutor_id,judul,deskripsi,tipe,link,buku_id) VALUES (?,?,?,?,?,?,?)').run(req.params.id,req.session.user.id,r.judul,r.deskripsi||null,r.tipe||'link',r.link||null,r.buku_id||null); ok++; });
  req.flash('success',`${ok} materi diimport.`); res.redirect('/tutor/kelas/'+req.params.id);
});

// Bank Soal
router.get('/bank-soal', (req, res) => {
  const { subtest } = req.query;
  const soal = subtest ? db.prepare('SELECT * FROM bank_soal WHERE (created_by=? OR 1=1) AND subtest=? ORDER BY created_at DESC').all(req.session.user.id, subtest) : db.prepare('SELECT * FROM bank_soal ORDER BY created_at DESC LIMIT 100').all();
  res.render('tutor/bank-soal', { title: 'Bank Soal', soal, subtests: ['PU','PPU','PBM','PK','LBI','LBE','PM'], currentSubtest: subtest||'' });
});
router.get('/bank-soal/tambah', (req, res) => { res.render('tutor/bank-soal-form', { title: 'Tambah Soal', subtest: req.query.subtest||'', subtests: ['PU','PPU','PBM','PK','LBI','LBE','PM'] }); });
router.post('/bank-soal', (req, res) => {
  const { subtest,soal,tipe,opsi_json,jawaban_json,poin,penjelasan,kelas_id } = req.body;
  db.prepare('INSERT INTO bank_soal (kelas_id,subtest,soal,tipe,opsi_json,jawaban_json,poin,penjelasan,created_by) VALUES (?,?,?,?,?,?,?,?,?)').run(kelas_id||null,subtest,soal,tipe||'pg',opsi_json||'[]',jawaban_json||'""',poin||1,penjelasan||null,req.session.user.id);
  req.flash('success','Soal ditambahkan.'); res.redirect('/tutor/bank-soal?subtest='+(subtest||''));
});
router.delete('/bank-soal/:id', (req, res) => { db.prepare('DELETE FROM bank_soal WHERE id=?').run(req.params.id); req.flash('success','Dihapus.'); res.redirect('/tutor/bank-soal'); });

// Ujian
router.get('/ujian', (req, res) => {
  const list = db.prepare('SELECT uj.*,(SELECT COUNT(*) FROM ujian_soal WHERE ujian_id=uj.id) jml_soal FROM ujian uj WHERE uj.created_by=? ORDER BY uj.created_at DESC').all(req.session.user.id);
  res.render('tutor/ujian', { title: 'Ujian/Kuis', list });
});
router.get('/ujian/new', (req, res) => { res.render('tutor/ujian-form', { title: 'Buat Ujian', uj: null, kelas: db.prepare('SELECT id,nama FROM kelas WHERE tutor_id=?').all(req.session.user.id) }); });
router.post('/ujian', (req, res) => {
  const { judul,deskripsi,tipe,kelas_id,durasi_menit,waktu_mulai,waktu_selesai,acak_soal,acak_opsi,poin_negatif,timer_per_soal,anti_cheat } = req.body;
  const info = db.prepare('INSERT INTO ujian (judul,deskripsi,tipe,kelas_id,created_by,durasi_menit,waktu_mulai,waktu_selesai,acak_soal,acak_opsi,poin_negatif,timer_per_soal,anti_cheat,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(judul,deskripsi,tipe||'kuis',kelas_id||null,req.session.user.id,durasi_menit||60,waktu_mulai||null,waktu_selesai||null,acak_soal?1:0,acak_opsi?1:0,poin_negatif||0,timer_per_soal||0,anti_cheat?1:0,'draft');
  req.flash('success','Ujian dibuat.'); res.redirect('/tutor/ujian/'+info.lastInsertRowid+'/soal');
});
router.get('/ujian/:id/soal', (req, res) => {
  const uj = db.prepare('SELECT * FROM ujian WHERE id=?').get(req.params.id);
  const soalTerpilih = db.prepare('SELECT us.*,bs.soal,bs.tipe,bs.subtest,bs.poin FROM ujian_soal us JOIN bank_soal bs ON bs.id=us.bank_soal_id WHERE us.ujian_id=? ORDER BY us.urutan').all(uj.id);
  const bankSoal = db.prepare('SELECT id,soal,tipe,subtest,poin FROM bank_soal ORDER BY subtest,created_at DESC').all();
  res.render('tutor/ujian-soal', { title: 'Soal: '+uj.judul, uj, soalTerpilih, bankSoal });
});
router.post('/ujian/:id/soal', (req, res) => {
  const soalIds = Array.isArray(req.body.soal_ids)?req.body.soal_ids:[req.body.soal_ids].filter(Boolean);
  let urutan = db.prepare('SELECT MAX(urutan) m FROM ujian_soal WHERE ujian_id=?').get(req.params.id)?.m||0;
  soalIds.forEach(sid => { urutan++; try { db.prepare('INSERT INTO ujian_soal (ujian_id,bank_soal_id,urutan) VALUES (?,?,?)').run(req.params.id,sid,urutan); } catch(e){} });
  req.flash('success',`${soalIds.length} soal ditambahkan.`); res.redirect('/tutor/ujian/'+req.params.id+'/soal');
});
router.post('/ujian/:id/publish', (req, res) => { db.prepare("UPDATE ujian SET status='aktif' WHERE id=?").run(req.params.id); req.flash('success','Dipublikasi.'); res.redirect('/tutor/ujian'); });
router.get('/ujian/:id/hasil', (req, res) => {
  const uj = db.prepare('SELECT * FROM ujian WHERE id=?').get(req.params.id);
  const peserta = db.prepare('SELECT up.*,u.name FROM ujian_peserta up JOIN users u ON u.id=up.user_id WHERE up.ujian_id=? ORDER BY up.nilai DESC').all(req.params.id);
  res.render('tutor/ujian-hasil', { title: 'Hasil', uj, peserta });
});

// Progress murid
router.get('/progress', (req, res) => {
  const rows = db.prepare('SELECT u.name,b.judul,pb.halaman_terakhir,pb.persentase,pb.updated_at FROM progress_baca pb JOIN users u ON u.id=pb.user_id JOIN buku b ON b.id=pb.buku_id WHERE u.id IN (SELECT DISTINCT km.user_id FROM kelas_member km JOIN kelas k ON k.id=km.kelas_id WHERE k.tutor_id=?) ORDER BY pb.updated_at DESC').all(req.session.user.id);
  res.render('tutor/progress', { title: 'Progress Murid', rows });
});

// Forum & Chat (same as before)
router.get('/forum', (req, res) => { res.render('tutor/forum', { title: 'Forum', list: db.prepare('SELECT f.*,u.name,(SELECT COUNT(*) FROM forum_komentar WHERE forum_id=f.id) komentar FROM forum f JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC').all() }); });
router.post('/forum', (req, res) => { db.prepare('INSERT INTO forum (user_id,judul,isi,kategori) VALUES (?,?,?,?)').run(req.session.user.id,req.body.judul,req.body.isi,req.body.kategori||'umum'); req.flash('success','Diposting.'); res.redirect('/tutor/forum'); });
router.get('/forum/:id', (req, res) => { const item=db.prepare('SELECT f.*,u.name FROM forum f JOIN users u ON u.id=f.user_id WHERE f.id=?').get(req.params.id); const komentar=db.prepare('SELECT k.*,u.name FROM forum_komentar k JOIN users u ON u.id=k.user_id WHERE k.forum_id=? ORDER BY k.created_at').all(req.params.id); res.render('tutor/forum-detail', { title: item?.judul||'Forum', item, komentar, backPath:'/tutor/forum' }); });
router.post('/forum/:id/komentar', (req, res) => { db.prepare('INSERT INTO forum_komentar (forum_id,user_id,isi) VALUES (?,?,?)').run(req.params.id,req.session.user.id,req.body.isi); res.redirect('/tutor/forum/'+req.params.id); });

router.get('/chat', (req, res) => {
  const rooms = db.prepare('SELECT cr.* FROM chat_room cr JOIN chat_member cm ON cm.room_id=cr.id WHERE cm.user_id=? ORDER BY cr.created_at DESC').all(req.session.user.id);
  res.render('tutor/chat', { title: 'Chat', rooms });
});

// Rekap
router.get('/rekap', (req, res) => {
  const tid = req.session.user.id;
  const totalMurid = db.prepare('SELECT COUNT(DISTINCT km.user_id) c FROM kelas_member km JOIN kelas k ON k.id=km.kelas_id WHERE k.tutor_id=?').get(tid).c;
  const totalUjian = db.prepare('SELECT COUNT(*) c FROM ujian WHERE created_by=?').get(tid).c;
  const avgNilai = db.prepare("SELECT AVG(up.nilai) a FROM ujian_peserta up JOIN ujian uj ON uj.id=up.ujian_id WHERE uj.created_by=? AND up.status='selesai'").get(tid)?.a || 0;
  res.render('tutor/rekap', { title: 'Rekap', totalMurid, totalUjian, avgNilai: Math.round(avgNilai) });
});

module.exports = router;
