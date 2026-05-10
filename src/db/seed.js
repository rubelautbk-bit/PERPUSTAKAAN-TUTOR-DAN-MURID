const bcrypt = require('bcryptjs');

module.exports = function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  console.log('Seeding database demo...');

  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  const insertUser = db.prepare(
    `INSERT INTO users (name,email,phone,password,role) VALUES (?,?,?,?,?)`
  );
  insertUser.run('Admin Rubela', 'admin@rubela.id', '081200000001', hash('admin123'), 'admin');
  insertUser.run('Bu Sari (Tutor)', 'tutor@rubela.id', '081200000002', hash('tutor123'), 'tutor');
  insertUser.run('Pak Budi (Tutor)', 'budi@rubela.id', '081200000003', hash('tutor123'), 'tutor');
  insertUser.run('Andi Pratama', 'murid@rubela.id', '081200000004', hash('murid123'), 'murid');
  insertUser.run('Siti Rahma', 'siti@rubela.id', '081200000005', hash('murid123'), 'murid');
  insertUser.run('Rizki Hidayat', 'rizki@rubela.id', '081200000006', hash('murid123'), 'murid');

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

  const bukuList = [
    ['Matematika SMP Kelas 7', 'Tim Penulis Erlangga', 'Erlangga', 2022, 'Pendidikan', 'Buku panduan matematika kelas 7 dengan latihan soal lengkap.', 320, 5],
    ['Bahasa Indonesia untuk SMA', 'Dr. Wahyu Wibowo', 'Grasindo', 2021, 'Pendidikan', 'Materi bahasa Indonesia lengkap untuk SMA.', 280, 4],
    ['Sejarah Indonesia Modern', 'Prof. Taufik Abdullah', 'Gramedia', 2020, 'Sejarah', 'Kronologi lengkap sejarah Indonesia abad 20-21.', 420, 3],
    ['Laskar Pelangi', 'Andrea Hirata', 'Bentang Pustaka', 2005, 'Novel', 'Kisah inspiratif anak-anak Belitung yang haus ilmu.', 534, 6],
    ['Bumi Manusia', 'Pramoedya Ananta Toer', 'Hasta Mitra', 1980, 'Novel', 'Tetralogi Buru bagian pertama, roman sejarah legendaris.', 535, 4],
    ['Fisika Dasar', 'Halliday & Resnick', 'Erlangga', 2019, 'Pendidikan', 'Dasar-dasar fisika untuk SMA dan mahasiswa tingkat awal.', 612, 3],
    ['Belajar Python Pemula', 'Ridwan Sanjaya', 'Informatika', 2023, 'Teknologi', 'Tutorial Python dari nol hingga mahir.', 300, 5],
    ['Dasar Pemrograman Web', 'Abdul Kadir', 'Andi Publisher', 2022, 'Teknologi', 'HTML, CSS, JavaScript untuk pemula.', 350, 4],
    ['Tafsir Al-Quran Juz 30', 'Ust. Quraish Shihab', 'Lentera Hati', 2018, 'Agama', 'Tafsir Juz Amma dengan bahasa sederhana.', 250, 3],
    ['Candi-candi Nusantara', 'R. Soekmono', 'Kanisius', 2015, 'Arkeologi', 'Ensiklopedia candi peninggalan Nusantara.', 380, 2],
    ['Jurnal Pendidikan Vol 12', 'Tim Redaksi', 'LP3I', 2024, 'Jurnal', 'Kumpulan artikel ilmiah bidang pendidikan.', 180, 2],
    ['Komik Sains: Tubuhku', 'Gomdori', 'Elex Media', 2019, 'Komik Edukasi', 'Komik edukatif tentang anatomi tubuh manusia.', 220, 5],
  ];
  const insertBuku = db.prepare(
    `INSERT INTO buku (judul,penulis,penerbit,tahun,kategori_id,sinopsis,jumlah_halaman,stok,stok_tersedia,rating,jumlah_rating,dibaca)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const getKat = db.prepare('SELECT id FROM kategori WHERE nama=?');
  bukuList.forEach(([j, p, pn, t, kat, s, h, st]) => {
    const k = getKat.get(kat);
    const rating = +(3.5 + Math.random() * 1.5).toFixed(1);
    const jr = Math.floor(Math.random() * 80) + 5;
    const dibaca = Math.floor(Math.random() * 300) + 20;
    insertBuku.run(j, p, pn, t, k?.id || null, s, h, st, st, rating, jr, dibaca);
  });

  // Pengumuman
  const insertPeng = db.prepare(
    'INSERT INTO pengumuman (judul,isi,tipe,author_id) VALUES (?,?,?,?)'
  );
  insertPeng.run(
    'Selamat Datang di Perpustakaan Rubela!',
    'Kami membuka akses penuh untuk semua murid bimbel. Silakan jelajahi koleksi digital kami.',
    'berita',
    1
  );
  insertPeng.run(
    'Workshop: Teknik Belajar Efektif',
    'Akan diadakan workshop online pada Sabtu depan. Pendaftaran melalui dashboard tutor.',
    'workshop',
    1
  );
  insertPeng.run(
    'Seminar Literasi Digital',
    'Seminar gratis bersama narasumber nasional. Terbuka untuk semua murid.',
    'seminar',
    1
  );

  // Kelas
  const insertKelas = db.prepare(
    'INSERT INTO kelas (nama,deskripsi,tutor_id,kode) VALUES (?,?,?,?)'
  );
  insertKelas.run('Kelas Matematika 7A', 'Kelas matematika SMP kelas 7.', 2, 'MTK7A');
  insertKelas.run('Kelas Bahasa Indonesia', 'Pembelajaran bahasa dan sastra.', 2, 'BIND01');
  insertKelas.run('Kelas IPA Terpadu', 'Fisika, Kimia, Biologi dasar.', 3, 'IPA01');

  // Member kelas
  const insertMember = db.prepare(
    'INSERT INTO kelas_member (kelas_id,user_id) VALUES (?,?)'
  );
  insertMember.run(1, 4);
  insertMember.run(1, 5);
  insertMember.run(2, 4);
  insertMember.run(3, 6);

  // Notifikasi contoh
  const insertNotif = db.prepare(
    'INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)'
  );
  insertNotif.run(4, 'Selamat Datang!', 'Akun Anda telah aktif. Selamat belajar!', 'sukses');
  insertNotif.run(4, 'Buku Baru', 'Koleksi buku Novel bertambah 3 judul baru.', 'info');

  // Forum contoh
  const insertForum = db.prepare(
    'INSERT INTO forum (user_id,judul,isi,kategori) VALUES (?,?,?,?)'
  );
  insertForum.run(2, 'Tips Membaca Efektif', 'Bagaimana teknik membaca cepat namun tetap memahami isi?', 'diskusi');
  insertForum.run(4, 'Rekomendasi Novel Inspiratif?', 'Teman-teman ada rekomendasi novel inspiratif untuk pelajar?', 'rekomendasi');

  console.log('Seeding selesai.');
};

// Jika dijalankan langsung: `node src/db/seed.js`
if (require.main === module) {
  const db = require('./database');
  require('./schema')(db);
  module.exports(db);
}
