const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Multi-session manager: adminId -> session data
const sessions = {};

function getSession(adminId) {
  if (!sessions[adminId]) {
    sessions[adminId] = {
      instance: null,
      currentQR: null,
      status: 'DISCONNECTED',
      profileInfo: null,
      retryCount: 0,
      connectStartTime: null
    };
  }
  return sessions[adminId];
}

const MAX_RETRIES = 1;

// Check if a valid saved session exists
function hasSavedSession(adminId) {
  const sessionName = `session-admin-${adminId}`;
  const defaultPath = path.join(__dirname, '.wwebjs_auth', sessionName, 'Default');
  const localStoragePath = path.join(defaultPath, 'Local Storage');
  try {
    return fs.existsSync(defaultPath) && fs.existsSync(localStoragePath);
  } catch(e) {
    return false;
  }
}

function initialize(adminId) {
  const sess = getSession(adminId);
  
  if (sess.instance && (sess.status === 'CONNECTED' || sess.status === 'CONNECTING' || sess.status === 'QR_READY' || sess.status === 'AUTHENTICATING')) {
    console.log(`[WhatsApp:${adminId}] Already running, status:`, sess.status);
    return sess.instance;
  }

  // Destroy old instance if exists
  if (sess.instance) {
    try { sess.instance.destroy().catch(() => {}); } catch(e) {}
    sess.instance = null;
  }

  sess.status = 'CONNECTING';
  sess.currentQR = null;
  sess.profileInfo = null;
  sess.connectStartTime = Date.now();

  const sessionName = `session-admin-${adminId}`;
  console.log(`[WhatsApp:${adminId}] Starting client (session: ${sessionName})...`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: sessionName,
      dataPath: './.wwebjs_auth' 
    }),
    puppeteer: {
      headless: true,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--safebrowsing-disable-auto-update'
      ]
    },
    webVersionCache: {
      type: 'local',
      path: './.wwebjs_cache'
    },
    authTimeoutMs: 120000,
    qrMaxRetries: 5
  });

  sess.instance = client;

  client.on('qr', async (qr) => {
    sess.status = 'QR_READY';
    sess.currentQR = await qrcode.toDataURL(qr);
    const elapsed = sess.connectStartTime ? Math.round((Date.now() - sess.connectStartTime) / 1000) : '?';
    console.log(`[WhatsApp:${adminId}] QR Code ready in ${elapsed}s — scan it!`);
  });

  client.on('authenticated', () => {
    console.log(`[WhatsApp:${adminId}] Authenticated successfully`);
    sess.status = 'AUTHENTICATING';
    sess.currentQR = null;
    sess.retryCount = 0;
  });

  client.on('auth_failure', msg => {
    console.error(`[WhatsApp:${adminId}] Auth failure:`, msg);
    sess.status = 'DISCONNECTED';
    sess.currentQR = null;
    sess.profileInfo = null;
    sess.instance = null;
    sess.connectStartTime = null;
  });

  client.on('ready', () => {
    const elapsed = sess.connectStartTime ? Math.round((Date.now() - sess.connectStartTime) / 1000) : '?';
    console.log(`[WhatsApp:${adminId}] Client is READY and CONNECTED! (took ${elapsed}s)`);
    sess.status = 'CONNECTED';
    sess.profileInfo = client.info;
    sess.currentQR = null;
    sess.retryCount = 0;
    sess.connectStartTime = null;
  });

  client.on('disconnected', (reason) => {
    console.log(`[WhatsApp:${adminId}] Disconnected:`, reason);
    sess.status = 'DISCONNECTED';
    sess.currentQR = null;
    sess.profileInfo = null;
    sess.instance = null;
    sess.connectStartTime = null;
  });

  client.on('change_state', (state) => {
    console.log(`[WhatsApp:${adminId}] State changed:`, state);
  });

  client.initialize().then(() => {
    console.log(`[WhatsApp:${adminId}] Initialize completed`);
  }).catch(e => {
    console.error(`[WhatsApp:${adminId}] Initialize error:`, e.message);
    sess.status = 'DISCONNECTED';
    sess.connectStartTime = null;
    try { if (sess.instance) sess.instance.destroy().catch(() => {}); } catch(e2) {}
    sess.instance = null;
    
    if (sess.retryCount < MAX_RETRIES) {
      sess.retryCount++;
      console.log(`[WhatsApp:${adminId}] Retrying (${sess.retryCount}/${MAX_RETRIES}) in 5 seconds...`);
      setTimeout(() => {
        if (sess.status === 'DISCONNECTED') {
          initialize(adminId);
        }
      }, 5000);
    } else {
      console.log(`[WhatsApp:${adminId}] Max retries reached.`);
      sess.retryCount = 0;
    }
  });

  return client;
}

// Auto-start on server boot — check for saved sessions across all admins
function autoStart() {
  const db = require('./database/db');
  db.all('SELECT id FROM admins WHERE is_active = 1', [], (err, admins) => {
    if (err || !admins) return;
    admins.forEach(admin => {
      if (hasSavedSession(admin.id)) {
        console.log(`[WhatsApp:${admin.id}] Valid saved session found — auto-connecting in 3s...`);
        setTimeout(() => {
          initialize(admin.id);
        }, 3000 + (admin.id * 2000)); // Stagger starts
      }
    });
  });
}

function getStatus(adminId) {
  const sess = getSession(adminId);
  const result = {
    status: sess.status,
    qr: sess.currentQR,
    info: sess.profileInfo ? {
      pushname: sess.profileInfo.pushname,
      wid: sess.profileInfo.wid
    } : null
  };
  
  // Add elapsed time for connecting states
  if (sess.connectStartTime && (sess.status === 'CONNECTING' || sess.status === 'QR_READY' || sess.status === 'AUTHENTICATING')) {
    result.elapsed = Math.round((Date.now() - sess.connectStartTime) / 1000);
  }
  
  return result;
}

// Get all sessions status (for superadmin)
function getAllStatuses() {
  const result = {};
  for (const [adminId, sess] of Object.entries(sessions)) {
    result[adminId] = {
      status: sess.status,
      info: sess.profileInfo ? {
        pushname: sess.profileInfo.pushname,
        wid: sess.profileInfo.wid
      } : null
    };
  }
  return result;
}

async function logout(adminId) {
  const sess = getSession(adminId);
  if (sess.instance) {
    try {
      if (sess.status === 'CONNECTED') {
        await sess.instance.logout();
      } else {
        await sess.instance.destroy();
      }
    } catch(e) {
      console.error(`[WhatsApp:${adminId}] Error during logout/destroy:`, e.message);
      try { await sess.instance.destroy(); } catch(e2) {}
    }
  }
  sess.status = 'DISCONNECTED';
  sess.currentQR = null;
  sess.profileInfo = null;
  sess.instance = null;
  sess.connectStartTime = null;

  // Clear session data
  const sessionName = `session-admin-${adminId}`;
  const sessionPath = path.join(__dirname, '.wwebjs_auth', sessionName);
  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`[WhatsApp:${adminId}] Session data cleared`);
    }
  } catch(e) {
    console.error(`[WhatsApp:${adminId}] Error clearing session:`, e.message);
  }
}

module.exports = {
  initialize,
  autoStart,
  getStatus,
  getAllStatuses,
  logout,
  getClient: (adminId) => getSession(adminId).instance
};
