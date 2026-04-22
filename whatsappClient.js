const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let instance = null;
let currentQR = null;
let status = 'DISCONNECTED'; // 'DISCONNECTED', 'CONNECTING', 'QR_READY', 'AUTHENTICATING', 'CONNECTED'
let profileInfo = null;
let retryCount = 0;
const MAX_RETRIES = 1;

// Check if a valid saved session exists (has actual localStorage data from WhatsApp Web)
function hasSavedSession() {
    const defaultPath = path.join(__dirname, '.wwebjs_auth', 'session', 'Default');
    const localStoragePath = path.join(defaultPath, 'Local Storage');
    try {
        return fs.existsSync(defaultPath) && fs.existsSync(localStoragePath);
    } catch(e) {
        return false;
    }
}

function initialize() {
    if (instance && (status === 'CONNECTED' || status === 'CONNECTING' || status === 'QR_READY' || status === 'AUTHENTICATING')) {
        console.log('[WhatsApp] Already running, status:', status);
        return instance;
    }

    // Destroy old instance if exists
    if (instance) {
        try { instance.destroy().catch(() => {}); } catch(e) {}
        instance = null;
    }

    status = 'CONNECTING';
    currentQR = null;
    profileInfo = null;

    console.log('[WhatsApp] Starting client...');
    instance = new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
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
                '--disable-ipc-flooding-protection'
            ]
        },
        webVersionCache: {
            type: 'local',
            path: './.wwebjs_cache'
        },
        authTimeoutMs: 120000,
        qrMaxRetries: 5
    });

    instance.on('qr', async (qr) => {
        status = 'QR_READY';
        currentQR = await qrcode.toDataURL(qr);
        console.log('[WhatsApp] QR Code ready — scan it!');
    });

    instance.on('authenticated', () => {
        console.log('[WhatsApp] Authenticated successfully');
        status = 'AUTHENTICATING';
        currentQR = null;
        retryCount = 0; // Reset retries on success
    });

    instance.on('auth_failure', msg => {
        console.error('[WhatsApp] Auth failure:', msg);
        status = 'DISCONNECTED';
        currentQR = null;
        profileInfo = null;
        instance = null;
    });

    instance.on('ready', () => {
        console.log('[WhatsApp] Client is READY and CONNECTED!');
        status = 'CONNECTED';
        profileInfo = instance.info;
        currentQR = null;
        retryCount = 0; // Reset retries on success
    });

    instance.on('disconnected', (reason) => {
        console.log('[WhatsApp] Disconnected:', reason);
        status = 'DISCONNECTED';
        currentQR = null;
        profileInfo = null;
        instance = null;
    });

    instance.on('change_state', (state) => {
        console.log('[WhatsApp] State changed:', state);
    });

    instance.initialize().then(() => {
        console.log('[WhatsApp] Initialize completed');
    }).catch(e => {
        console.error('[WhatsApp] Initialize error:', e.message);
        status = 'DISCONNECTED';
        try { if (instance) instance.destroy().catch(() => {}); } catch(e2) {}
        instance = null;
        
        // Retry once on failure
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`[WhatsApp] Retrying (${retryCount}/${MAX_RETRIES}) in 5 seconds...`);
            setTimeout(() => {
                if (status === 'DISCONNECTED') {
                    initialize();
                }
            }, 5000);
        } else {
            console.log('[WhatsApp] Max retries reached. User must click "Подключить" manually.');
            retryCount = 0;
        }
    });

    return instance;
}

// Auto-start on server boot if valid session exists
function autoStart() {
    if (hasSavedSession()) {
        console.log('[WhatsApp] Valid saved session found — auto-connecting in 3s...');
        setTimeout(() => {
            initialize();
        }, 3000);
    } else {
        console.log('[WhatsApp] No saved session — waiting for user to click "Подключить"');
    }
}

function getStatus() {
    return {
        status,
        qr: currentQR,
        info: profileInfo ? {
            pushname: profileInfo.pushname,
            wid: profileInfo.wid
        } : null
    };
}

async function logout() {
    if (instance) {
        try {
            if (status === 'CONNECTED') {
                await instance.logout();
            } else {
                await instance.destroy();
            }
        } catch(e) {
            console.error('[WhatsApp] Error during logout/destroy:', e.message);
            try { await instance.destroy(); } catch(e2) {}
        }
    }
    status = 'DISCONNECTED';
    currentQR = null;
    profileInfo = null;
    instance = null;

    // Clear session data so it won't auto-connect next time
    const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session');
    try {
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log('[WhatsApp] Session data cleared');
        }
    } catch(e) {
        console.error('[WhatsApp] Error clearing session:', e.message);
    }
}

module.exports = {
    initialize,
    autoStart,
    getStatus,
    logout,
    getClient: () => instance
};
