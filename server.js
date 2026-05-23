require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Init DB
require('./database/db');

// Init Scheduler
const { startScheduler } = require('./scheduler');

// Load WhatsApp Client module
const whatsappClient = require('./whatsappClient');

// Auth middleware
const { requireAuth, requireSuperAdmin } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.set('wss', wss);

// Middleware
app.use(cors({ credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'rasilka_default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 күн
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Static files (login page кіру керек)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth routes (логин бетіне кіру үшін auth қажет емес)
app.use('/api/auth', require('./routes/auth'));

// Login page
app.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Қорғалған API routes
app.use('/api/clients', requireAuth, require('./routes/clients'));
app.use('/api/campaigns', requireAuth, require('./routes/campaigns'));
app.use('/api/settings', requireAuth, require('./routes/settings'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsapp'));
app.use('/api/tariffs', requireAuth, require('./routes/tariffs'));
app.use('/api/templates', requireAuth, require('./routes/templates'));
app.use('/api/admin-panel', require('./routes/admin-panel'));

// Қорғалған HTML pages
const pages = ['clients', 'send', 'campaigns', 'settings', 'tariffs', 'templates'];
pages.forEach(p => {
  app.get(`/${p}`, requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${p}.html`));
  });
});

// Admin panel page — тек суперадмин
app.get('/admin-panel', requireSuperAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-panel.html'));
});

// Dashboard — қорғалған
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket ping/pong
wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (e) {}
  });
  ws.send(JSON.stringify({ type: 'connected', message: 'Вы подключены к серверу рассылки WhatsApp' }));
});

const PORT = process.env.PORT || 3000;
const db = require('./database/db');

db.initPromise.then(() => {
  server.listen(PORT, () => {
    console.log(`\n✅ Сервер запущен: http://localhost:${PORT}`);
    console.log(`📱 Система WhatsApp-рассылки готова!\n`);
    
    // Start background jobs
    startScheduler();
    
    // Auto-connect WhatsApp if saved session exists
    whatsappClient.autoStart();
  });
}).catch(err => {
  console.error("Database initialization failed:", err);
});
