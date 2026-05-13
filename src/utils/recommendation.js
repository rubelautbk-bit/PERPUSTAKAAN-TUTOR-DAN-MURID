// Rekomendasi buku cerdas berbasis riwayat user (content-based + popularity)
// Tanpa external AI, hanya SQL.
const db = require('../db/database');

function recommendForUser(userId, limit = 6) {
  // Ambil kategori favorit user (dari peminjaman + wishlist + rating tinggi)
  const katFav = db.prepare(
    `SELECT b.kategori_id, COUNT(*) skor FROM (
       SELECT buku_id FROM peminjaman WHERE user_id=?
       UNION ALL SELECT buku_id FROM wishlist WHERE user_id=?
       UNION ALL SELECT buku_id FROM rating WHERE user_id=? AND nilai>=4
     ) riwayat
     JOIN buku b ON b.id = riwayat.buku_id
     WHERE b.kategori_id IS NOT NULL
     GROUP BY b.kategori_id ORDER BY skor DESC LIMIT 3`
  ).all(userId, userId, userId);

  if (katFav.length === 0) {
    // User baru -> rekomendasikan buku populer
    return db.prepare(
      `SELECT b.*, k.nama AS kategori_nama, 'Populer' AS alasan
       FROM buku b LEFT JOIN kategori k ON k.id = b.kategori_id
       WHERE b.stok_tersedia > 0
       ORDER BY b.dibaca DESC, b.rating DESC LIMIT ?`
    ).all(limit);
  }

  const katIds = katFav.map(k => k.kategori_id);
  const placeholders = katIds.map(() => '?').join(',');

  // Exclude buku yang sudah pernah dipinjam/rating
  const excluded = db.prepare(
    `SELECT DISTINCT buku_id FROM peminjaman WHERE user_id=?
     UNION SELECT buku_id FROM rating WHERE user_id=?`
  ).all(userId, userId).map(r => r.buku_id);
  const excludeSql = excluded.length > 0
    ? `AND b.id NOT IN (${excluded.map(() => '?').join(',')})`
    : '';

  const sql = `
    SELECT b.*, k.nama AS kategori_nama,
      'Sesuai minat kamu di kategori ' || k.nama AS alasan
    FROM buku b LEFT JOIN kategori k ON k.id = b.kategori_id
    WHERE b.kategori_id IN (${placeholders})
      AND b.stok_tersedia > 0
      ${excludeSql}
    ORDER BY b.rating DESC, b.dibaca DESC LIMIT ?
  `;
  return db.prepare(sql).all(...katIds, ...excluded, limit);
}

module.exports = { recommendForUser };
