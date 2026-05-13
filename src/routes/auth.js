const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { assignNomorAnggota } = require('../utils/members');
const { notifyUser } = require('../utils/whatsapp');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { title: 'Masuk', layout: 'layouts/auth' });
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=? OR phone=?').get(identifier, identifier);

  if (!user) { req.flash('error', 'Email/No HP tidak terdaftar.'); return res.redirect('/auth/login'); }
  if (user.status === 'pending') { req.flash('error', 'Akun belum diaktivasi oleh tutor/admin. Silakan tunggu konfirmasi.'); return res.redirect('/auth/login'); }
  if (user.status === 'suspended') { req.flash('error', 'Akun disuspend. Hubungi admin.'); return res.redirect('/auth/login'); }
  if (!bcrypt.compareSync(password, user.password)) { req.flash('error', 'Password salah.'); return res.redirect('/auth/login'); }

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, nomor_anggota: user.nomor_anggota };
  req.flash('success', `Selamat datang, ${user.name}!`);
  if (user.role === 'admin') return res.redirect('/admin');
  if (user.role === 'tutor') return res.redirect('/tutor');
  return res.redirect('/murid');
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/register', { title: 'Daftar', layout: 'layouts/auth' });
});

router.post('/register', (req, res) => {
  const { name, email, phone, password, confirm, role } = req.body;
  if (!name || !email || !password) { req.flash('error', 'Semua field wajib diisi.'); return res.redirect('/auth/register'); }
  if (password !== confirm) { req.flash('error', 'Konfirmasi password tidak cocok.'); return res.redirect('/auth/register'); }
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) { req.flash('error', 'Email sudah digunakan.'); return res.redirect('/auth/register'); }

  const finalRole = role === 'tutor' ? 'tutor' : 'murid';
  // Murid & tutor baru status = pending, harus diaktivasi
  const hashed = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name,email,phone,password,role,status) VALUES (?,?,?,?,?,?)'
  ).run(name, email, phone || null, hashed, finalRole, 'pending');

  // Generate nomor anggota
  assignNomorAnggota(info.lastInsertRowid);

  // Notify all tutors about new pending user
  const tutors = db.prepare("SELECT id FROM users WHERE role IN ('tutor','admin') AND status='active'").all();
  tutors.forEach(t => {
    db.prepare('INSERT INTO notifikasi (user_id,judul,pesan,tipe) VALUES (?,?,?,?)')
      .run(t.id, 'Anggota Baru Menunggu Aktivasi', `${name} (${finalRole}) mendaftar dan menunggu konfirmasi.`, 'info');
  });

  req.flash('success', 'Pendaftaran berhasil! Akun Anda menunggu aktivasi oleh tutor/admin. Anda akan dihubungi via WhatsApp.');
  res.redirect('/auth/login');
});

router.get('/forgot', (req, res) => {
  res.render('auth/forgot', { title: 'Reset Password', layout: 'layouts/auth' });
});

router.post('/forgot', (req, res) => {
  req.flash('success', 'Jika email terdaftar, tautan reset akan dikirim. (Demo: fitur email belum aktif)');
  res.redirect('/auth/login');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
