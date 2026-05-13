// WhatsApp Gateway via Fonnte.com
const axios = require('axios');
const db = require('../db/database');

function getSetting(key) {
  const row = db.prepare('SELECT value FROM setting WHERE key=?').get(key);
  return row ? row.value : null;
}

async function sendWA(phone, message) {
  if (!phone) return { ok: false, error: 'No phone' };
  const token = getSetting('wa_gateway_token');
  const url = getSetting('wa_gateway_url') || 'https://api.fonnte.com/send';
  if (!token) return { ok: false, error: 'No WA token configured' };

  // Format nomor: pastikan pakai 62xxx
  let target = phone.replace(/[^0-9]/g, '');
  if (target.startsWith('0')) target = '62' + target.slice(1);

  try {
    const res = await axios.post(url, {
      target,
      message,
      countryCode: '62',
    }, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    return { ok: true, data: res.data };
  } catch (e) {
    console.error('[WA Error]', e.message);
    return { ok: false, error: e.message };
  }
}

// Send notification + WA
async function notifyUser(userId, judul, pesan, tipe = 'info') {
  db.prepare(
    'INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)'
  ).run(userId, judul, pesan, tipe);

  const user = db.prepare('SELECT phone FROM users WHERE id=?').get(userId);
  if (user && user.phone) {
    const waMsg = `*${judul}*\n\n${pesan}\n\n_E-Library Rubela Indonesia_`;
    const result = await sendWA(user.phone, waMsg);
    if (result.ok) {
      db.prepare('UPDATE notifikasi SET wa_sent=1 WHERE user_id=? AND judul=? ORDER BY id DESC LIMIT 1')
        .run(userId, judul);
    }
    return result;
  }
  return { ok: false, error: 'No phone number' };
}

// Kirim reminder peminjaman ke semua yang hampir jatuh tempo
async function sendBorrowReminders() {
  const minHari = parseInt(getSetting('min_hari_perpanjangan')) || 2;
  const today = new Date();
  const reminderDate = new Date();
  reminderDate.setDate(today.getDate() + minHari);
  const dateStr = reminderDate.toISOString().slice(0, 10);

  const rows = db.prepare(
    `SELECT p.*, u.name, u.phone, b.judul FROM peminjaman p
     JOIN users u ON u.id=p.user_id JOIN buku b ON b.id=p.buku_id
     WHERE p.status='dipinjam' AND p.tanggal_kembali = ?`
  ).all(dateStr);

  for (const r of rows) {
    await notifyUser(
      r.user_id,
      'Pengingat Pengembalian Buku',
      `Buku "${r.judul}" harus dikembalikan pada ${r.tanggal_kembali}. Perpanjang sekarang jika masih membutuhkan.`,
      'warning'
    );
  }
  return rows.length;
}

module.exports = { sendWA, notifyUser, sendBorrowReminders, getSetting };
