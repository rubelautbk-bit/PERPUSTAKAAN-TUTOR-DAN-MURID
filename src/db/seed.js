const bcrypt = require('bcryptjs');

module.exports = function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  console.log('Seeding database demo...');
  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  const insertUser = db.prepare(
    `INSERT INTO users (name,email,phone,password,role,status,nomor_anggota) VALUES (?,?,?,?,?,?,?)`
  );
  insertUser.run('Admin Rubela', 'admin@rubela.id', '081200000001', hash('admin123'), 'admin', 'active', 'ADM-25-0001');
  insertUser.run('Bu Sari (Tutor)', 'tutor@rubela.id', '081200000002', hash('tutor123'), 'tutor', 'active', 'TUT-25-0002');
  insertUser.run('Pak Budi (Tutor)', 'budi@rubela.id', '081200000003', hash('tutor123'), 'tutor', 'active', 'TUT-25-0003');
  insertUser.run('Andi Pratama', 'murid@rubela.id', '081200000004', hash('murid123'), 'murid', 'active', 'MRD-25-0004');
  insertUser.run('Siti Rahma', 'siti@rubela.id', '081200000005', hash('murid123'), 'murid', 'active', 'MRD-25-0005');
  insertUser.run('Rizki Hidayat', 'rizki@rubela.id', '081200000006', hash('murid123'), 'murid', 'active', 'MRD-25-0006');

  // Kategori
  const kategoriList = [
    ['Pendidikan', 'Buku pelajaran & pendidikan umum'],
    ['Sejarah', 'Buku sejarah Indonesia & dunia'],
    ['Novel', 'Fiksi dan karya sastra'],
    ['Agama', 'Buku keagamaan & spiritual'],
    ['Teknologi', 'Buku IT, sains, teknologi'],
    ['Arkeologi', 'Penelitian arkeologi & budaya kuno'],
    ['Jurnal', 'Jurnal ilmiah & akademik'],
    ['Komik Edukasi', 'Komik dengan konten edukatif'],
  ];
  const insertKat = db.prepare('INSERT INTO kategori (nama,deskripsi) VALUES (?,?)');
  kategoriList.forEach((k) => insertKat.run(...k));

  // Buku
  const bukuList = [
    ['Matematika SMP Kelas 7', 'Tim Penulis Erlangga', 'Erlangga', 2022, 'Pendidikan', 'Buku panduan matematika kelas 7.', 320, 5, null, null],
    ['Bahasa Indonesia untuk SMA', 'Dr. Wahyu Wibowo', 'Grasindo', 2021, 'Pendidikan', 'Materi bahasa Indonesia lengkap.', 280, 4, null, null],
    ['Sejarah Indonesia Modern', 'Prof. Taufik Abdullah', 'Gramedia', 2020, 'Sejarah', 'Kronologi sejarah Indonesia abad 20-21.', 420, 3, null, null],
    ['Laskar Pelangi', 'Andrea Hirata', 'Bentang Pustaka', 2005, 'Novel', 'Kisah inspiratif anak Belitung.', 534, 6, null, null],
    ['Bumi Manusia', 'Pramoedya Ananta Toer', 'Hasta Mitra', 1980, 'Novel', 'Tetralogi Buru bagian pertama.', 535, 4, null, null],
    ['Fisika Dasar', 'Halliday & Resnick', 'Erlangga', 2019, 'Pendidikan', 'Fisika untuk SMA dan mahasiswa.', 612, 3, null, null],
    ['Belajar Python Pemula', 'Ridwan Sanjaya', 'Informatika', 2023, 'Teknologi', 'Tutorial Python dari nol.', 300, 5, null, 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'],
    ['Dasar Pemrograman Web', 'Abdul Kadir', 'Andi Publisher', 2022, 'Teknologi', 'HTML, CSS, JavaScript.', 350, 4, null, 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'],
    ['Tafsir Al-Quran Juz 30', 'Ust. Quraish Shihab', 'Lentera Hati', 2018, 'Agama', 'Tafsir Juz Amma.', 250, 3, null, null],
    ['Candi-candi Nusantara', 'R. Soekmono', 'Kanisius', 2015, 'Arkeologi', 'Ensiklopedia candi.', 380, 2, null, null],
    ['Jurnal Pendidikan Vol 12', 'Tim Redaksi', 'LP3I', 2024, 'Jurnal', 'Kumpulan artikel ilmiah.', 180, 2, null, null],
    ['Komik Sains: Tubuhku', 'Gomdori', 'Elex Media', 2019, 'Komik Edukasi', 'Komik edukatif anatomi.', 220, 5, null, null],
  ];
  const insertBuku = db.prepare(
    `INSERT INTO buku (judul,penulis,penerbit,tahun,kategori_id,sinopsis,jumlah_halaman,stok,stok_tersedia,rating,jumlah_rating,dibaca,cover_url,pdf_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const getKat = db.prepare('SELECT id FROM kategori WHERE nama=?');
  bukuList.forEach(([j, p, pn, t, kat, s, h, st, coverUrl, pdfUrl]) => {
    const k = getKat.get(kat);
    const rating = +(3.5 + Math.random() * 1.5).toFixed(1);
    const jr = Math.floor(Math.random() * 80) + 5;
    const dibaca = Math.floor(Math.random() * 300) + 20;
    insertBuku.run(j, p, pn, t, k?.id || null, s, h, st, st, rating, jr, dibaca, coverUrl, pdfUrl);
  });

  // Kelas dengan 7 subtest
  const insertKelas = db.prepare('INSERT INTO kelas (nama,subtest,deskripsi,tutor_id,kode) VALUES (?,?,?,?,?)');
  const subtests = [
    ['Penalaran Umum (PU)', 'PU'], ['Pengetahuan dan Pemahaman Umum (PPU)', 'PPU'],
    ['Kemampuan Memahami Bacaan dan Menulis (PBM)', 'PBM'], ['Pengetahuan Kuantitatif (PK)', 'PK'],
    ['Literasi dalam Bahasa Indonesia', 'LBI'], ['Literasi dalam Bahasa Inggris', 'LBE'],
    ['Penalaran Matematika', 'PM'],
  ];
  subtests.forEach(([nama, kode], i) => {
    insertKelas.run(nama, kode, `Kelas subtest ${kode}`, i % 2 === 0 ? 2 : 3, kode + '01');
  });

  // Members
  const insertMember = db.prepare('INSERT INTO kelas_member (kelas_id,user_id) VALUES (?,?)');
  [4, 5, 6].forEach(uid => { [1, 2, 3].forEach(kid => insertMember.run(kid, uid)); });

  // Pengumuman
  const insertPeng = db.prepare('INSERT INTO pengumuman (judul,isi,tipe,author_id) VALUES (?,?,?,?)');
  insertPeng.run('Selamat Datang di E-Library Rubela!', 'Kami membuka akses penuh untuk semua murid bimbel.', 'berita', 1);
  insertPeng.run('Workshop: Teknik Belajar Efektif', 'Workshop online Sabtu depan.', 'workshop', 1);

  // Notifikasi demo
  const insertNotif = db.prepare('INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)');
  insertNotif.run(4, 'Selamat Datang!', 'Akun Anda telah aktif. Selamat belajar!', 'sukses');

  // Forum
  const insertForum = db.prepare('INSERT INTO forum (user_id,judul,isi,kategori) VALUES (?,?,?,?)');
  insertForum.run(2, 'Tips Membaca Efektif', 'Bagaimana teknik membaca cepat?', 'diskusi');
  insertForum.run(4, 'Rekomendasi Novel?', 'Ada rekomendasi novel inspiratif?', 'rekomendasi');

  // Kalender
  const insertKal = db.prepare('INSERT INTO kalender (judul,deskripsi,tipe,tanggal_mulai,created_by) VALUES (?,?,?,?,?)');
  insertKal.run('Webinar Literasi Digital', 'Narasumber: Prof. Adi', 'webinar', '2025-06-15 09:00', 1);
  insertKal.run('Deadline Tugas PU', 'Kumpulkan tugas Penalaran Umum', 'deadline', '2025-06-20 23:59', 2);

  console.log('Seeding selesai.');
};

if (require.main === module) {
  const db = require('./database');
  require('./schema')(db);
  module.exports(db);
}
