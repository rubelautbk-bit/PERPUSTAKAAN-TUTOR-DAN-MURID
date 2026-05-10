require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const db = require('./src/db/database');
require('./src/db/schema')(db);
require('./src/db/seed')(db);

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'rubela-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);
app.use(flash());

// Globals untuk semua view
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currentPath = req.path;
  res.locals.siteName = 'Perpustakaan Bimbel Rubela';
  next();
});

// Routes
app.use('/', require('./src/routes/public'));
app.use('/auth', require('./src/routes/auth'));
app.use('/admin', require('./src/routes/admin'));
app.use('/tutor', require('./src/routes/tutor'));
app.use('/murid', require('./src/routes/murid'));

// 404
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Halaman Tidak Ditemukan' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('errors/500', {
    title: 'Terjadi Kesalahan',
    message: err.message,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== Perpustakaan Bimbel Rubela ===`);
  console.log(`Server jalan di http://localhost:${PORT}`);
  console.log(`Akun demo:`);
  console.log(`  Admin  -> admin@rubela.id / admin123`);
  console.log(`  Tutor  -> tutor@rubela.id / tutor123`);
  console.log(`  Murid  -> murid@rubela.id / murid123`);
});
