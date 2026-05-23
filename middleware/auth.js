// Auth middleware — session-based authentication

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  // API requests get 401, page requests redirect to login
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Авторизация қажет' });
  }
  return res.redirect('/login');
}

function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Авторизация қажет' });
    }
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'superadmin') {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Тек суперадмин үшін' });
    }
    return res.redirect('/');
  }
  req.user = req.session.user;
  next();
}

module.exports = { requireAuth, requireSuperAdmin };
