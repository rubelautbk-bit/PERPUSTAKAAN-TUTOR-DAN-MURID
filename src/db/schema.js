module.exports = function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','tutor','murid')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
      file_pdf TEXT,
      rating REAL DEFAULT 0,
      jumlah_rating INTEGER DEFAULT 0,
      dibaca INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kategori_id) REFERENCES kategori(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS peminjaman (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      tanggal_pinjam DATE NOT NULL,
      tanggal_kembali DATE NOT NULL,
      tanggal_dikembalikan DATE,
      status TEXT NOT NULL DEFAULT 'menunggu' CHECK(status IN ('menunggu','dipinjam','dikembalikan','ditolak')),
      denda INTEGER DEFAULT 0,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS notifikasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      judul TEXT NOT NULL,
      pesan TEXT,
      tipe TEXT DEFAULT 'info',
      dibaca INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS kelas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      deskripsi TEXT,
      tutor_id INTEGER NOT NULL,
      kode TEXT UNIQUE NOT NULL,
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

    CREATE TABLE IF NOT EXISTS materi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kelas_id INTEGER,
      tutor_id INTEGER NOT NULL,
      judul TEXT NOT NULL,
      deskripsi TEXT,
      tipe TEXT DEFAULT 'pdf',
      file TEXT,
      link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
      FOREIGN KEY(tutor_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rekomendasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor_id INTEGER NOT NULL,
      buku_id INTEGER NOT NULL,
      kelas_id INTEGER,
      catatan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tutor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(buku_id) REFERENCES buku(id) ON DELETE CASCADE,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quiz (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor_id INTEGER NOT NULL,
      kelas_id INTEGER,
      judul TEXT NOT NULL,
      deskripsi TEXT,
      deadline DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tutor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(kelas_id) REFERENCES kelas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_soal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      soal TEXT NOT NULL,
      opsi_a TEXT,
      opsi_b TEXT,
      opsi_c TEXT,
      opsi_d TEXT,
      jawaban TEXT,
      FOREIGN KEY(quiz_id) REFERENCES quiz(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_jawaban (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      nilai INTEGER DEFAULT 0,
      selesai INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(quiz_id, user_id),
      FOREIGN KEY(quiz_id) REFERENCES quiz(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS forum (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      judul TEXT NOT NULL,
      isi TEXT NOT NULL,
      kategori TEXT DEFAULT 'umum',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
  `);
};
