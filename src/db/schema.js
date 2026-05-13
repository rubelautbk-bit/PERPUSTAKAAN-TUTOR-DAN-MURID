module.exports = function initSchema(db) {
  db.exec(`
    -- ============ USERS ============
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomor_anggota TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','tutor','murid')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('active','pending','suspended')),
      avatar TEXT,
      poin INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      bahasa TEXT DEFAULT 'id',
      activated_by INTEGER,
      activated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ============ KATEGORI & BUKU ============
    CREATE TABLE IF NOT EXISTS kategori (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT UNIQUE NOT NULL,
      deskripsi TEXT
    );

    CREATE TABLE IF NOT EXISTS buku (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL,
      penulis TEXT,
      penerbit TEXT,
      tahun INTEGER,
      isbn TEXT,
      bahasa TEXT DEFAULT 'Indonesia',
      kategori_id INTEGER,
      sinopsis TEXT,
      jumlah_halaman INTEGER,
      stok INTEGER DEFAULT 1,
      stok_tersedia INTEGER DEFAULT 1,
      cover TEXT,
      cover_url TEXT,
      file_pdf TEXT,
      pdf_url TEXT,
      rating REAL DEFAULT 0,
      jumlah_rating INTEGER DEFAULT 0,
      dibaca INTEGER DEFAULT 0,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kategori_id) REFERENCES kategori(id) ON DELETE SET NULL
    );

    -- ============ PEMINJAMAN ============
    CREATE TABLE IF NOT EXISTS peminjaman (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      tanggal_pinjam DATE NOT NULL,
      tanggal_kembali DATE NOT NULL,
      tanggal_dikembalikan DATE,
      status TEXT NOT NULL DEFAULT 'menunggu' CHECK(status IN ('menunggu','dipinjam','dikembalikan','ditolak')),
      denda INTEGER DEFAULT 0,
      perpanjangan INTEGER DEFAULT 0,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE
    );

    -- ============ USULAN BUKU ============
    CREATE TABLE IF NOT EXISTS usulan_buku (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      judul TEXT NOT NULL,
      pencipta TEXT,
      tahun_terbit INTEGER,
      link TEXT,
      file TEXT,
      alasan TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','disetujui','ditolak')),
      catatan_admin TEXT,
      reviewed_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ WISHLIST, RATING, PROGRESS ============
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, buku_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rating (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      nilai INTEGER NOT NULL,
      ulasan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, buku_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS progress_baca (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      halaman_terakhir INTEGER DEFAULT 0,
      persentase INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, buku_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookmark (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      halaman INTEGER NOT NULL,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS highlight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      halaman INTEGER NOT NULL,
      teks TEXT NOT NULL,
      warna TEXT DEFAULT 'yellow',
      rects_json TEXT,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE
    );

    -- ============ NOTIFIKASI & PENGUMUMAN ============
    CREATE TABLE IF NOT EXISTS notifikasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      judul TEXT NOT NULL,
      pesan TEXT,
      tipe TEXT DEFAULT 'info',
      dibaca INTEGER DEFAULT 0,
      wa_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pengumuman (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL,
      isi TEXT NOT NULL,
      tipe TEXT DEFAULT 'berita',
      author_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- ============ KELAS (7 subtest + custom) ============
    CREATE TABLE IF NOT EXISTS kelas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      subtest TEXT,
      deskripsi TEXT,
      tutor_id INTEGER NOT NULL,
      kode TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tutor_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kelas_member (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kelas_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(kelas_id, user_id),
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ PERTEMUAN & MATERI per KELAS ============
    CREATE TABLE IF NOT EXISTS pertemuan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kelas_id INTEGER NOT NULL,
      nomor INTEGER NOT NULL,
      judul TEXT NOT NULL,
      deskripsi TEXT,
      tanggal DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS materi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kelas_id INTEGER,
      pertemuan_id INTEGER,
      tutor_id INTEGER NOT NULL,
      judul TEXT NOT NULL,
      deskripsi TEXT,
      tipe TEXT DEFAULT 'pdf',
      file TEXT,
      link TEXT,
      buku_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
      FOREIGN KEY(pertemuan_id) REFERENCES pertemuan(id) ON DELETE SET NULL,
      FOREIGN KEY(tutor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE SET NULL
    );

    -- ============ REKOMENDASI BUKU per KELAS/PERTEMUAN ============
    CREATE TABLE IF NOT EXISTS rekomendasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      kelas_id INTEGER,
      pertemuan_id INTEGER,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tutor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL,
      FOREIGN KEY(pertemuan_id) REFERENCES pertemuan(id) ON DELETE SET NULL
    );

    -- ============ BANK SOAL ============
    CREATE TABLE IF NOT EXISTS bank_soal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kelas_id INTEGER,
      subtest TEXT,
      soal TEXT NOT NULL,
      tipe TEXT NOT NULL DEFAULT 'pg' CHECK(tipe IN ('pg','pg_kompleks','benar_salah','menjodohkan','isian','esai','drag_drop','labeling')),
      opsi_json TEXT,
      jawaban_json TEXT,
      poin INTEGER DEFAULT 1,
      penjelasan TEXT,
      media TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ CBT / UJIAN / KUIS ============
    CREATE TABLE IF NOT EXISTS ujian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL,
      deskripsi TEXT,
      tipe TEXT DEFAULT 'kuis' CHECK(tipe IN ('kuis','ujian','cbt','latihan')),
      kelas_id INTEGER,
      created_by INTEGER NOT NULL,
      durasi_menit INTEGER DEFAULT 60,
      waktu_mulai DATETIME,
      waktu_selesai DATETIME,
      acak_soal INTEGER DEFAULT 1,
      acak_opsi INTEGER DEFAULT 1,
      tampil_nilai INTEGER DEFAULT 1,
      poin_negatif REAL DEFAULT 0,
      timer_per_soal INTEGER DEFAULT 0,
      anti_cheat INTEGER DEFAULT 1,
      max_attempt INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','aktif','selesai','arsip')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ujian_soal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ujian_id INTEGER NOT NULL,
      bank_soal_id INTEGER NOT NULL,
      urutan INTEGER DEFAULT 0,
      section TEXT,
      FOREIGN KEY(ujian_id) REFERENCES ujian(id) ON DELETE CASCADE,
      FOREIGN KEY(bank_soal_id) REFERENCES bank_soal(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ujian_peserta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ujian_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      mulai_at DATETIME,
      selesai_at DATETIME,
      nilai REAL,
      benar INTEGER DEFAULT 0,
      salah INTEGER DEFAULT 0,
      kosong INTEGER DEFAULT 0,
      status TEXT DEFAULT 'belum' CHECK(status IN ('belum','mengerjakan','selesai','dinilai')),
      jawaban_json TEXT,
      ip_address TEXT,
      browser TEXT,
      violation_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ujian_id, user_id),
      FOREIGN KEY(ujian_id) REFERENCES ujian(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ FORUM ============
    CREATE TABLE IF NOT EXISTS forum (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kelas_id INTEGER,
      judul TEXT NOT NULL,
      isi TEXT NOT NULL,
      kategori TEXT DEFAULT 'umum',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS forum_komentar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forum_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      isi TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(forum_id) REFERENCES forum(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ BADGE / GAMIFIKASI ============
    CREATE TABLE IF NOT EXISTS badge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kode TEXT NOT NULL,
      nama TEXT NOT NULL,
      deskripsi TEXT,
      icon TEXT DEFAULT 'star',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, kode),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ CHAT ============
    CREATE TABLE IF NOT EXISTS chat_room (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT,
      tipe TEXT DEFAULT 'private' CHECK(tipe IN ('private','group','kelas')),
      kelas_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chat_member (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE(room_id, user_id),
      FOREIGN KEY(room_id) REFERENCES chat_room(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      pesan TEXT NOT NULL,
      tipe TEXT DEFAULT 'text',
      file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(room_id) REFERENCES chat_room(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ KALENDER KEGIATAN ============
    CREATE TABLE IF NOT EXISTS kalender (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL,
      deskripsi TEXT,
      tipe TEXT DEFAULT 'event' CHECK(tipe IN ('event','webinar','diskusi','deadline','ujian','seminar')),
      tanggal_mulai DATETIME NOT NULL,
      tanggal_selesai DATETIME,
      kelas_id INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- ============ GALERI ============
    CREATE TABLE IF NOT EXISTS galeri (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL,
      deskripsi TEXT,
      file TEXT,
      file_url TEXT,
      tipe TEXT DEFAULT 'foto',
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- ============ RIWAYAT AKTIVITAS ============
    CREATE TABLE IF NOT EXISTS aktivitas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      aksi TEXT NOT NULL,
      detail TEXT,
      ref_type TEXT,
      ref_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ============ KONTAK WA ============
    CREATE TABLE IF NOT EXISTS kontak (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      phone TEXT NOT NULL,
      grup TEXT,
      catatan TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS wa_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      pesan TEXT NOT NULL,
      status TEXT,
      response TEXT,
      sender_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- ============ PEMBAHASAN SOAL ============
    -- (kolom penjelasan sudah ada di bank_soal, tinggal pastikan terpakai)

    -- ============ PENGATURAN DENDA ============
    CREATE TABLE IF NOT EXISTS setting (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrations for existing DBs
  const tryAdd = (sql) => { try { db.exec(sql); } catch (e) { /* already exists */ } };
  tryAdd(`ALTER TABLE users ADD COLUMN nomor_anggota TEXT`);
  tryAdd(`ALTER TABLE users ADD COLUMN poin INTEGER DEFAULT 0`);
  tryAdd(`ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1`);
  tryAdd(`ALTER TABLE users ADD COLUMN bahasa TEXT DEFAULT 'id'`);
  tryAdd(`ALTER TABLE users ADD COLUMN activated_by INTEGER`);
  tryAdd(`ALTER TABLE users ADD COLUMN activated_at DATETIME`);
  tryAdd(`ALTER TABLE buku ADD COLUMN cover_url TEXT`);
  tryAdd(`ALTER TABLE buku ADD COLUMN pdf_url TEXT`);
  tryAdd(`ALTER TABLE buku ADD COLUMN tags TEXT`);
  tryAdd(`ALTER TABLE peminjaman ADD COLUMN perpanjangan INTEGER DEFAULT 0`);
  tryAdd(`ALTER TABLE notifikasi ADD COLUMN wa_sent INTEGER DEFAULT 0`);
  tryAdd(`ALTER TABLE kelas ADD COLUMN subtest TEXT`);
  tryAdd(`ALTER TABLE kelas ADD COLUMN status TEXT DEFAULT 'active'`);
  tryAdd(`ALTER TABLE materi ADD COLUMN pertemuan_id INTEGER`);
  tryAdd(`ALTER TABLE materi ADD COLUMN buku_id INTEGER`);
  tryAdd(`ALTER TABLE forum ADD COLUMN kelas_id INTEGER`);

  // Default settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO setting (key,value) VALUES (?,?)');
  insertSetting.run('denda_per_hari', '500');
  insertSetting.run('masa_pinjam_hari', '14');
  insertSetting.run('min_hari_perpanjangan', '2');
  insertSetting.run('wa_gateway_token', 'xtkS6z3LcBJgbEGmkTeu');
  insertSetting.run('wa_gateway_url', 'https://api.fonnte.com/send');
  insertSetting.run('site_name', 'E-Library Rubela');
  insertSetting.run('site_tagline', 'Bimbel Rubela Indonesia');
};
