const express = require('express');
const db = require('../db/database');
const upload = require('../middleware/upload');
const { ensureRole } = require('../middleware/auth');
const gami = require('../utils/gamification');
const { recommendForUser } = require('../utils/recommendation');
const { bolehPerpanjang, hitungDenda } = require('../utils/denda');
const { logAktivitas, getAktivitas } = require('../utils/aktivitas');
const { notifyUser } = require('../utils/whatsapp');

const router = express.Router();
router.use(ensureRole('murid'));

// ==================== DASHBOARD ====================
router.get('/', (req, res) => {
  const uid = req.session.user.id;
  const s = {
    pinjam: db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE user_id=? AND status='dipinjam'").get(uid).c,
    wishlist: db.prepare('SELECT COUNT(*) c FROM wishlist WHERE user_id=?').get(uid).c,
    selesai: db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE user_id=? AND status='dikembalikan'").get(uid).c,
  };
  const bukuAktif = db.prepare("SELECT p.*,b.judul,b.penulis FROM peminjaman p JOIN buku b ON b.id=p.buku_id WHERE p.user_id=? AND p.status='dipinjam' ORDER BY p.tanggal_kembali LIMIT 5").all(uid);
  const rekomendasi = recommendForUser(uid, 4);
  const notif = db.prepare('SELECT * FROM notifikasi WHERE user_id=? ORDER BY created_at DESC LIMIT 5').all(uid);
  const me = db.prepare('SELECT poin,level FROM users WHERE id=?').get(uid);
  const ujianAktif = db.prepare("SELECT * FROM ujian WHERE status='aktif' AND (kelas_id IS NULL OR kelas_id IN (SELECT kelas_id FROM kelas_member WHERE user_id=?)) ORDER BY waktu_selesai LIMIT 3").all(uid);
  res.render('murid/dashboard', { title: 'Dashboard', s, bukuAktif, rekomendasi, notif, me, ujianAktif });
});

// ==================== USULAN BUKU ====================
router.get('/usulan', (req, res) => {
  const list = db.prepare('SELECT * FROM usulan_buku WHERE user_id=? ORDER BY created_at DESC').all(req.session.user.id);
  res.render('murid/usulan', { title: 'Usulan Buku', list });
});
router.post('/usulan', upload.single('file'), (req, res) => {
  const { judul, pencipta, tahun_terbit, link, alasan } = req.body;
  const file = req.file?.filename || null;
  db.prepare('INSERT INTO usulan_buku (user_id,judul,pencipta,tahun_terbit,link,file,alasan) VALUES (?,?,?,?,?,?,?)')
    .run(req.session.user.id, judul, pencipta, tahun_terbit||null, link||null, file, alasan||null);
  logAktivitas(req.session.user.id, 'usulan_buku', `Mengajukan buku: ${judul}`);
  req.flash('success', 'Usulan buku berhasil diajukan! Menunggu persetujuan admin.');
  res.redirect('/murid/usulan');
});

// ==================== BUKU SAYA & PINJAM ====================
router.get('/buku-saya', (req, res) => {
  const rows = db.prepare('SELECT p.*,b.judul,b.penulis FROM peminjaman p JOIN buku b ON b.id=p.buku_id WHERE p.user_id=? ORDER BY p.created_at DESC').all(req.session.user.id);
  res.render('murid/buku-saya', { title: 'Buku Saya', rows, bolehPerpanjang });
});
router.post('/pinjam/:bukuId', (req, res) => {
  const uid = req.session.user.id;
  const buku = db.prepare('SELECT * FROM buku WHERE id=?').get(req.params.bukuId);
  if (!buku || buku.stok_tersedia <= 0) { req.flash('error','Buku tidak tersedia.'); return res.redirect('/buku/'+req.params.bukuId); }
  const today = new Date(); const due = new Date(); due.setDate(today.getDate()+14);
  db.prepare('INSERT INTO peminjaman (user_id,buku_id,tanggal_pinjam,tanggal_kembali,status) VALUES (?,?,?,?,?)')
    .run(uid, buku.id, today.toISOString().slice(0,10), due.toISOString().slice(0,10), 'menunggu');
  gami.addPoin(uid, 10); gami.checkAchievements(uid);
  logAktivitas(uid, 'pinjam_buku', `Meminjam: ${buku.judul}`, 'buku', buku.id);
  notifyUser(uid, 'Permintaan Peminjaman', `Permintaan pinjam "${buku.judul}" menunggu persetujuan.`, 'info');
  req.flash('success','Permintaan dikirim. +10 poin!'); res.redirect('/murid/buku-saya');
});
router.post('/perpanjang/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM peminjaman WHERE id=? AND user_id=?').get(req.params.id, req.session.user.id);
  if (p && p.status==='dipinjam') {
    if (!bolehPerpanjang(p.tanggal_kembali)) { req.flash('error','Perpanjangan hanya bisa dilakukan H-2 sebelum tenggat.'); return res.redirect('/murid/buku-saya'); }
    const d = new Date(p.tanggal_kembali); d.setDate(d.getDate()+7);
    db.prepare('UPDATE peminjaman SET tanggal_kembali=?,perpanjangan=perpanjangan+1 WHERE id=?').run(d.toISOString().slice(0,10), p.id);
    req.flash('success','Diperpanjang 7 hari.');
  }
  res.redirect('/murid/buku-saya');
});

// ==================== WISHLIST ====================
router.get('/wishlist', (req, res) => { res.render('murid/wishlist', { title: 'Wishlist', rows: db.prepare('SELECT w.id AS wid,b.* FROM wishlist w JOIN buku b ON b.id=w.buku_id WHERE w.user_id=? ORDER BY w.created_at DESC').all(req.session.user.id) }); });
router.post('/wishlist/:bukuId', (req, res) => { try { db.prepare('INSERT INTO wishlist (user_id,buku_id) VALUES (?,?)').run(req.session.user.id,req.params.bukuId); req.flash('success','Ditambahkan.'); } catch(e) { req.flash('error','Sudah ada.'); } res.redirect('/buku/'+req.params.bukuId); });
router.delete('/wishlist/:id', (req, res) => { db.prepare('DELETE FROM wishlist WHERE id=? AND user_id=?').run(req.params.id,req.session.user.id); res.redirect('/murid/wishlist'); });

// ==================== RATING ====================
router.post('/rating/:bukuId', (req, res) => {
  const { nilai, ulasan } = req.body; const uid=req.session.user.id; const bukuId=req.params.bukuId;
  db.prepare('INSERT INTO rating (user_id,buku_id,nilai,ulasan) VALUES (?,?,?,?) ON CONFLICT(user_id,buku_id) DO UPDATE SET nilai=excluded.nilai,ulasan=excluded.ulasan').run(uid,bukuId,nilai,ulasan);
  const agg = db.prepare('SELECT AVG(nilai) a,COUNT(*) c FROM rating WHERE buku_id=?').get(bukuId);
  db.prepare('UPDATE buku SET rating=?,jumlah_rating=? WHERE id=?').run(+agg.a.toFixed(1),agg.c,bukuId);
  gami.addPoin(uid, 2); gami.checkAchievements(uid);
  req.flash('success','Ulasan tersimpan. +2 poin!'); res.redirect('/buku/'+bukuId);
});

// ==================== PROGRESS ====================
router.get('/progress', (req, res) => { res.render('murid/progress', { title: 'Progress', rows: db.prepare('SELECT pb.*,b.judul,b.jumlah_halaman FROM progress_baca pb JOIN buku b ON b.id=pb.buku_id WHERE pb.user_id=? ORDER BY pb.updated_at DESC').all(req.session.user.id), bukuList: db.prepare('SELECT id,judul FROM buku ORDER BY judul').all() }); });
router.post('/progress', (req, res) => {
  const { buku_id, halaman_terakhir } = req.body; const uid=req.session.user.id;
  const buku = db.prepare('SELECT jumlah_halaman FROM buku WHERE id=?').get(buku_id);
  const pct = buku && buku.jumlah_halaman>0 ? Math.min(100,Math.round((halaman_terakhir/buku.jumlah_halaman)*100)) : 0;
  db.prepare('INSERT INTO progress_baca (user_id,buku_id,halaman_terakhir,persentase,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,buku_id) DO UPDATE SET halaman_terakhir=excluded.halaman_terakhir,persentase=excluded.persentase,updated_at=CURRENT_TIMESTAMP').run(uid,buku_id,halaman_terakhir,pct);
  if (pct>=100) { gami.addPoin(uid,15); gami.checkAchievements(uid); }
  req.flash('success','Progress diperbarui.'); res.redirect('/murid/progress');
});
router.post('/progress/reader', express.json(), (req, res) => {
  const { buku_id, halaman, total } = req.body; const uid=req.session.user.id; if(!buku_id||!halaman) return res.json({ok:false});
  const pct = total>0 ? Math.min(100,Math.round((halaman/total)*100)) : 0;
  db.prepare('INSERT INTO progress_baca (user_id,buku_id,halaman_terakhir,persentase,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,buku_id) DO UPDATE SET halaman_terakhir=excluded.halaman_terakhir,persentase=excluded.persentase,updated_at=CURRENT_TIMESTAMP').run(uid,buku_id,halaman,pct);
  res.json({ok:true});
});

// ==================== BOOKMARK & HIGHLIGHT ====================
router.post('/bookmark/:bukuId', (req, res) => {
  db.prepare('INSERT INTO bookmark (user_id,buku_id,halaman,catatan) VALUES (?,?,?,?)').run(req.session.user.id,req.params.bukuId,req.body.halaman,req.body.catatan||null);
  req.flash('success','Bookmark disimpan.'); res.redirect('/buku/'+req.params.bukuId+'/baca');
});
router.delete('/bookmark/:id', (req, res) => { const bm=db.prepare('SELECT buku_id FROM bookmark WHERE id=? AND user_id=?').get(req.params.id,req.session.user.id); db.prepare('DELETE FROM bookmark WHERE id=? AND user_id=?').run(req.params.id,req.session.user.id); res.redirect('/buku/'+(bm?bm.buku_id:'')+'/baca'); });
router.post('/highlight/:bukuId', express.json(), (req, res) => {
  const { halaman,teks,warna,rects } = req.body; if(!halaman||!teks) return res.status(400).json({ok:false});
  const info = db.prepare('INSERT INTO highlight (user_id,buku_id,halaman,teks,warna,rects_json) VALUES (?,?,?,?,?,?)').run(req.session.user.id,req.params.bukuId,halaman,teks,warna||'yellow',JSON.stringify(rects||[]));
  res.json({ok:true, id:info.lastInsertRowid});
});
router.delete('/highlight/:id', express.json(), (req, res) => { db.prepare('DELETE FROM highlight WHERE id=? AND user_id=?').run(req.params.id,req.session.user.id); res.json({ok:true}); });


// ==================== KELAS ====================
router.get('/kelas', (req, res) => {
  const myKelas = db.prepare('SELECT k.*,u.name AS tutor_name FROM kelas_member km JOIN kelas k ON k.id=km.kelas_id JOIN users u ON u.id=k.tutor_id WHERE km.user_id=?').all(req.session.user.id);
  res.render('murid/kelas', { title: 'Kelas Saya', myKelas });
});
router.get('/kelas/jelajahi', (req, res) => {
  const semua = db.prepare("SELECT k.*,u.name AS tutor_name,(SELECT COUNT(*) FROM kelas_member WHERE kelas_id=k.id) jumlah FROM kelas k JOIN users u ON u.id=k.tutor_id WHERE k.status='active' ORDER BY k.nama").all();
  res.render('murid/kelas-jelajahi', { title: 'Jelajahi Kelas', semua });
});
router.post('/kelas/join', (req, res) => {
  const { kode } = req.body;
  const kelas = db.prepare('SELECT id FROM kelas WHERE kode=?').get(kode?.toUpperCase());
  if (!kelas) { req.flash('error','Kode kelas tidak ditemukan.'); return res.redirect('/murid/kelas/jelajahi'); }
  try { db.prepare('INSERT INTO kelas_member (kelas_id,user_id) VALUES (?,?)').run(kelas.id,req.session.user.id); req.flash('success','Berhasil bergabung!'); }
  catch(e) { req.flash('error','Sudah terdaftar.'); }
  res.redirect('/murid/kelas');
});
router.get('/kelas/:id', (req, res) => {
  const kelas = db.prepare('SELECT k.*,u.name AS tutor_name FROM kelas k JOIN users u ON u.id=k.tutor_id WHERE k.id=?').get(req.params.id);
  if (!kelas) return res.redirect('/murid/kelas');
  const pertemuan = db.prepare('SELECT * FROM pertemuan WHERE kelas_id=? ORDER BY nomor').all(kelas.id);
  const materi = db.prepare('SELECT m.*,b.judul AS buku_judul FROM materi m LEFT JOIN buku b ON b.id=m.buku_id WHERE m.kelas_id=? ORDER BY m.created_at DESC').all(kelas.id);
  const rekomendasi = db.prepare('SELECT r.*,b.judul,b.penulis FROM rekomendasi r JOIN buku b ON b.id=r.buku_id WHERE r.kelas_id=? ORDER BY r.created_at DESC').all(kelas.id);
  const ujian = db.prepare("SELECT * FROM ujian WHERE kelas_id=? AND status='aktif' ORDER BY waktu_selesai").all(kelas.id);
  res.render('murid/kelas-detail', { title: kelas.nama, kelas, pertemuan, materi, rekomendasi, ujian });
});

// ==================== CBT / UJIAN ====================
router.get('/ujian', (req, res) => {
  const uid = req.session.user.id;
  const list = db.prepare("SELECT uj.*,(SELECT status FROM ujian_peserta WHERE ujian_id=uj.id AND user_id=?) my_status,(SELECT nilai FROM ujian_peserta WHERE ujian_id=uj.id AND user_id=?) my_nilai FROM ujian uj WHERE uj.status='aktif' AND (uj.kelas_id IS NULL OR uj.kelas_id IN (SELECT kelas_id FROM kelas_member WHERE user_id=?)) ORDER BY uj.waktu_selesai").all(uid,uid,uid);
  res.render('murid/ujian', { title: 'Ujian & Kuis', list });
});
router.get('/ujian/:id/kerjakan', (req, res) => {
  const uid = req.session.user.id;
  const uj = db.prepare("SELECT * FROM ujian WHERE id=? AND status='aktif'").get(req.params.id);
  if (!uj) { req.flash('error','Ujian tidak tersedia.'); return res.redirect('/murid/ujian'); }
  // Check if already done
  const existing = db.prepare('SELECT * FROM ujian_peserta WHERE ujian_id=? AND user_id=?').get(uj.id, uid);
  if (existing && existing.status === 'selesai') { req.flash('error','Anda sudah mengerjakan ujian ini.'); return res.redirect('/murid/ujian'); }
  // Mark as mengerjakan
  if (!existing) { db.prepare("INSERT INTO ujian_peserta (ujian_id,user_id,mulai_at,status,ip_address,browser) VALUES (?,?,CURRENT_TIMESTAMP,'mengerjakan',?,?)").run(uj.id,uid,req.ip,req.get('User-Agent')); }
  // Get soal
  let soalList = db.prepare('SELECT us.id AS us_id,bs.* FROM ujian_soal us JOIN bank_soal bs ON bs.id=us.bank_soal_id WHERE us.ujian_id=? ORDER BY us.urutan').all(uj.id);
  if (uj.acak_soal) soalList = soalList.sort(()=>Math.random()-0.5);
  res.render('murid/ujian-kerjakan', { title: uj.judul, uj, soalList, layout: 'layouts/cbt' });
});
router.post('/ujian/:id/submit', express.json(), (req, res) => {
  const uid = req.session.user.id;
  const uj = db.prepare('SELECT * FROM ujian WHERE id=?').get(req.params.id);
  if (!uj) return res.json({ok:false,error:'Ujian tidak ada'});
  const jawaban = req.body.jawaban || {}; // { bank_soal_id: answer }
  const soalList = db.prepare('SELECT bs.* FROM ujian_soal us JOIN bank_soal bs ON bs.id=us.bank_soal_id WHERE us.ujian_id=?').all(uj.id);
  let benar=0, salah=0, kosong=0, totalPoin=0;
  soalList.forEach(s => {
    const userAns = jawaban[String(s.id)];
    if (!userAns || userAns === '') { kosong++; return; }
    let correct = false;
    try { const expected = JSON.parse(s.jawaban_json); correct = (JSON.stringify(userAns) === JSON.stringify(expected) || userAns === expected); } catch(e) { correct = (userAns === s.jawaban_json); }
    if (correct) { benar++; totalPoin += s.poin; } else { salah++; totalPoin -= uj.poin_negatif||0; }
  });
  const nilai = soalList.length>0 ? Math.max(0, Math.round((totalPoin / soalList.reduce((a,s)=>a+s.poin,0))*100)) : 0;
  db.prepare("UPDATE ujian_peserta SET selesai_at=CURRENT_TIMESTAMP,nilai=?,benar=?,salah=?,kosong=?,status='selesai',jawaban_json=? WHERE ujian_id=? AND user_id=?")
    .run(nilai,benar,salah,kosong,JSON.stringify(jawaban),uj.id,uid);
  if (nilai>=80) { gami.addPoin(uid,20); } gami.checkAchievements(uid);
  logAktivitas(uid,'ujian_selesai',`Menyelesaikan ${uj.judul}: ${nilai}%`,'ujian',uj.id);
  res.json({ok:true, nilai, benar, salah, kosong});
});
// Anti-cheat violation report
router.post('/ujian/:id/violation', express.json(), (req, res) => {
  const uid = req.session.user.id;
  db.prepare('UPDATE ujian_peserta SET violation_count=violation_count+1 WHERE ujian_id=? AND user_id=?').run(req.params.id, uid);
  res.json({ok:true});
});

// Hasil ujian + pembahasan (muncul SETELAH selesai)
router.get('/ujian/:id/hasil', (req, res) => {
  const uid = req.session.user.id;
  const uj = db.prepare('SELECT * FROM ujian WHERE id=?').get(req.params.id);
  const peserta = db.prepare('SELECT * FROM ujian_peserta WHERE ujian_id=? AND user_id=?').get(req.params.id, uid);
  if (!uj || !peserta || peserta.status !== 'selesai') {
    req.flash('error', 'Pembahasan hanya bisa diakses setelah menyelesaikan ujian.');
    return res.redirect('/murid/ujian');
  }
  const soalList = db.prepare('SELECT bs.* FROM ujian_soal us JOIN bank_soal bs ON bs.id=us.bank_soal_id WHERE us.ujian_id=? ORDER BY us.urutan').all(uj.id);
  let userJawaban = {};
  try { userJawaban = JSON.parse(peserta.jawaban_json || '{}'); } catch(e){}
  res.render('murid/ujian-hasil', { title: 'Hasil: '+uj.judul, uj, peserta, soalList, userJawaban });
});

// ==================== FORUM ====================
router.get('/forum', (req, res) => { res.render('murid/forum', { title: 'Forum', list: db.prepare('SELECT f.*,u.name,(SELECT COUNT(*) FROM forum_komentar WHERE forum_id=f.id) komentar FROM forum f JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC').all() }); });
router.post('/forum', (req, res) => { db.prepare('INSERT INTO forum (user_id,judul,isi,kategori,kelas_id) VALUES (?,?,?,?,?)').run(req.session.user.id,req.body.judul,req.body.isi,req.body.kategori||'umum',req.body.kelas_id||null); req.flash('success','Diposting.'); res.redirect('/murid/forum'); });
router.get('/forum/:id', (req, res) => {
  const item = db.prepare('SELECT f.*,u.name FROM forum f JOIN users u ON u.id=f.user_id WHERE f.id=?').get(req.params.id);
  if (!item) return res.redirect('/murid/forum');
  const komentar = db.prepare('SELECT k.*,u.name FROM forum_komentar k JOIN users u ON u.id=k.user_id WHERE k.forum_id=? ORDER BY k.created_at').all(item.id);
  res.render('murid/forum-detail', { title: item.judul, item, komentar, backPath:'/murid/forum' });
});
router.post('/forum/:id/komentar', (req, res) => { db.prepare('INSERT INTO forum_komentar (forum_id,user_id,isi) VALUES (?,?,?)').run(req.params.id,req.session.user.id,req.body.isi); res.redirect('/murid/forum/'+req.params.id); });

// ==================== CHAT ====================
router.get('/chat', (req, res) => {
  const uid = req.session.user.id;
  const rooms = db.prepare('SELECT cr.*,(SELECT pesan FROM chat_message WHERE room_id=cr.id ORDER BY id DESC LIMIT 1) last_msg FROM chat_room cr JOIN chat_member cm ON cm.room_id=cr.id WHERE cm.user_id=? ORDER BY cr.created_at DESC').all(uid);
  res.render('murid/chat', { title: 'Chat', rooms });
});
router.get('/chat/:roomId', (req, res) => {
  const uid = req.session.user.id;
  const room = db.prepare('SELECT * FROM chat_room WHERE id=?').get(req.params.roomId);
  const messages = db.prepare('SELECT cm.*,u.name FROM chat_message cm JOIN users u ON u.id=cm.user_id WHERE cm.room_id=? ORDER BY cm.created_at').all(req.params.roomId);
  res.render('murid/chat-room', { title: room?.nama||'Chat', room, messages });
});

// ==================== NOTIFIKASI, PROFILE, LEADERBOARD ====================
router.get('/notifikasi', (req, res) => { const list=db.prepare('SELECT * FROM notifikasi WHERE user_id=? ORDER BY created_at DESC').all(req.session.user.id); db.prepare('UPDATE notifikasi SET dibaca=1 WHERE user_id=?').run(req.session.user.id); res.render('murid/notifikasi', { title: 'Notifikasi', list }); });
router.get('/profile', (req, res) => { const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user.id); const badges=gami.getUserBadges(req.session.user.id); res.render('murid/profile', { title: 'Profile', u, badges }); });
router.post('/profile', (req, res) => { db.prepare('UPDATE users SET name=?,email=?,phone=? WHERE id=?').run(req.body.name,req.body.email,req.body.phone,req.session.user.id); req.session.user.name=req.body.name; req.flash('success','Diperbarui.'); res.redirect('/murid/profile'); });
router.get('/leaderboard', (req, res) => { res.render('murid/leaderboard', { title: 'Leaderboard', leaderboard: gami.getLeaderboard(20), me: db.prepare('SELECT poin,level FROM users WHERE id=?').get(req.session.user.id), badges: gami.getUserBadges(req.session.user.id) }); });

// ==================== RIWAYAT AKTIVITAS ====================
router.get('/riwayat', (req, res) => { res.render('murid/riwayat', { title: 'Riwayat Aktivitas', aktivitas: getAktivitas(req.session.user.id, 100) }); });

// ==================== KALENDER ====================
router.get('/kalender', (req, res) => {
  const uid = req.session.user.id;
  const events = db.prepare("SELECT * FROM kalender WHERE kelas_id IS NULL OR kelas_id IN (SELECT kelas_id FROM kelas_member WHERE user_id=?) ORDER BY tanggal_mulai").all(uid);
  res.render('murid/kalender', { title: 'Kalender Kegiatan', events });
});

// ==================== REKAP ====================
router.get('/rekap', (req, res) => {
  const uid = req.session.user.id;
  const totalPinjam = db.prepare('SELECT COUNT(*) c FROM peminjaman WHERE user_id=?').get(uid).c;
  const totalSelesai = db.prepare("SELECT COUNT(*) c FROM peminjaman WHERE user_id=? AND status='dikembalikan'").get(uid).c;
  const totalUjian = db.prepare("SELECT COUNT(*) c FROM ujian_peserta WHERE user_id=? AND status='selesai'").get(uid).c;
  const avgNilai = db.prepare("SELECT AVG(nilai) a FROM ujian_peserta WHERE user_id=? AND status='selesai'").get(uid)?.a || 0;
  res.render('murid/rekap', { title: 'Rekap', totalPinjam, totalSelesai, totalUjian, avgNilai: Math.round(avgNilai) });
});

// ==================== CHAT INDIVIDUAL ====================
router.post('/chat/start/:userId', (req, res) => {
  const uid = req.session.user.id;
  const lawanId = parseInt(req.params.userId);
  if (lawanId === uid) return res.redirect('/murid/chat');
  // Cek room existing (private)
  const existing = db.prepare(`
    SELECT cr.id FROM chat_room cr
    JOIN chat_member cm1 ON cm1.room_id=cr.id AND cm1.user_id=?
    JOIN chat_member cm2 ON cm2.room_id=cr.id AND cm2.user_id=?
    WHERE cr.tipe='private' LIMIT 1
  `).get(uid, lawanId);
  let roomId;
  if (existing) {
    roomId = existing.id;
  } else {
    const info = db.prepare("INSERT INTO chat_room (tipe) VALUES ('private')").run();
    roomId = info.lastInsertRowid;
    db.prepare('INSERT INTO chat_member (room_id,user_id) VALUES (?,?)').run(roomId, uid);
    db.prepare('INSERT INTO chat_member (room_id,user_id) VALUES (?,?)').run(roomId, lawanId);
  }
  res.redirect('/murid/chat/' + roomId);
});

module.exports = router;
