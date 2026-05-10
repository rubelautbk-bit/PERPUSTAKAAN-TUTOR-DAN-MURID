const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { title: 'Masuk', layout: 'layouts/auth' });
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body;
  const user = db
    .prepare('SELECT * FROM users WHERE email = ? OR phone = ?')
    .get(identifier, identifier);

  if (!user) {
    req.flash('error', 'Email/Nomor HP tidak terdaftar.');
    return res.redirect('/auth/login');
  }
  if (user.status === 'suspended') {
    req.flash('error', 'Akun Anda sedang disuspend. Hubungi admin.');
    return res.redirect('/auth/login');
  }
  if (!bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Password salah.');
    return res.redirect('/auth/login');
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  };
  req.flash('success', `Selamat datang, ${user.name}!`);

  if (user.role === 'admin') return res.redirect('/admin');
  if (user.role === 'tutor') return res.redirect('/tutor');
  return res.redirect('/murid');
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/register', { title: 'Daftar Akun', layout: 'layouts/auth' });
});

router.post('/register', (req, res) => {
  const { name, email, phone, password, confirm, role } = req.body;

  if (!name || !email || !password) {
    req.flash('error', 'Nama, email, dan password wajib diisi.');
    return res.redirect('/auth/register');
  }
  if (password !== confirm) {
    req.flash('error', 'Konfirmasi password tidak cocok.');
    return res.redirect('/auth/register');
  }
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) {
    req.flash('error', 'Email sudah digunakan.');
    return res.redirect('/auth/register');
  }

  const finalRole = role === 'tutor' ? 'tutor' : 'murid'; // admin hanya bisa dibuat admin lain
  const hashed = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (name,email,phone,password,role) VALUES (?,?,?,?,?)'
  ).run(name, email, phone || null, hashed, finalRole);

  req.flash('success', 'Akun berhasil dibuat. Silakan login.');
  res.redirect('/auth/login');
});

router.get('/forgot', (req, res) => {
  res.render('auth/forgot', { title: 'Reset Password', layout: 'layouts/auth' });
});

router.post('/forgot', (req, res) => {
  // Simplified: di production kirim email OTP
  req.flash(
    'success',
    'Jika email terdaftar, tautan reset akan dikirim. (Demo: fitur email belum aktif)'
  );
  res.redirect('/auth/login');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
