function ensureLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/auth/login');
  }
  next();
}

function ensureRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash('error', 'Silakan login terlebih dahulu.');
      return res.redirect('/auth/login');
    }
    if (!roles.includes(req.session.user.role)) {
      req.flash('error', 'Anda tidak memiliki akses ke halaman ini.');
      return res.redirect('/');
    }
    next();
  };
}

module.exports = { ensureLogin, ensureRole };
