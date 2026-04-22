require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Init DB
require('./database/db');

// Init Scheduler
const { startScheduler } = require('./scheduler');

// Load WhatsApp Client module
const whatsappClient = require('./whatsappClient');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.set('wss', wss);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/clients', require('./routes/clients'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

// Serve HTML pages
const pages = ['clients', 'send', 'campaigns', 'settings'];
pages.forEach(p => {
  app.get(`/${p}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${p}.html`));
  });
});

app.get('/', (req, res) => {
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
server.listen(PORT, () => {
  console.log(`\n<i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i> Сервер запущен: http://localhost:${PORT}`);
  console.log(`<i class="ph-duotone ph-device-mobile" style="font-size: 1.1em; vertical-align: middle;"></i> Система WhatsApp-рассылки готова!\n`);
  
  // Start background jobs
  startScheduler();
  
  // Auto-connect WhatsApp if saved session exists
  whatsappClient.autoStart();
});
