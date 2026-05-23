const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }

  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    if (!user.is_active) return res.status(403).json({ error: 'Аккаунт заблокирован' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Неверный логин или пароль' });

    // Сохранить в сессию
    req.session.user = {
      id: user.id,
      username: user.username,
      shop_name: user.shop_name,
      role: user.role
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        shop_name: user.shop_name,
        role: user.role
      }
    });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Ошибка при выходе' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
