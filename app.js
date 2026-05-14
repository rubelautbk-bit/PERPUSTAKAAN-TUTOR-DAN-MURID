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
const { createT, getSupportedLangs } = require('./src/utils/i18n');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

if (process.env.UPLOAD_DIR) {
  app.use('/uploads', express.static(process.env.UPLOAD_DIR));
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'rubela-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
}));
app.use(flash());

// Global middleware - i18n + user + timezone
app.use((req, res, next) => {
  // Anti multi-login: kalau session ini bukan yang terakhir aktif untuk user, kick.
  // Hanya enforce untuk role murid (admin/tutor boleh multi-tab tanpa kick).
  if (req.session.user && req.session.user.role === 'murid') {
    try {
      const u = db.prepare('SELECT active_session_id FROM users WHERE id=?').get(req.session.user.id);
      if (u && u.active_session_id && u.active_session_id !== req.sessionID) {
        return req.session.destroy(() => {
          if (req.xhr || req.path.startsWith('/api') || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ ok: false, error: 'multi_login_detected' });
          }
          res.redirect('/auth/login?multi_login=1');
        });
      }
    } catch (e) { /* tabel mungkin belum ada, skip */ }
  }

  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currentPath = req.path;

  // Language
  let lang = req.session.lang || 'id';
  if (req.query.lang && getSupportedLangs().includes(req.query.lang)) {
    lang = req.query.lang;
    req.session.lang = lang;
  }
  res.locals.lang = lang;
  res.locals.t = createT(lang);
  res.locals.siteName = 'E-Library Rubela';

  // Real-time clock data for views
  res.locals.serverTime = new Date().toISOString();
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
  res.status(404).render('errors/404', { title: '404' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).render('errors/500', { title: 'Error', message: err.message });
});

module.exports = app;
