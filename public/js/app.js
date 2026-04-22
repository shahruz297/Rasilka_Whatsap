
// ===== THEME LOGIC =====
function initTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? '<i class="ph-duotone ph-sun" style="font-size: 1.1em; vertical-align: middle;"></i>' : '<i class="ph-duotone ph-moon" style="font-size: 1.1em; vertical-align: middle;"></i>';
  }
}

// Initialize theme early
initTheme();

// ===== WEBSOCKET =====
let ws = null;
let wsReconnectTimer = null;

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    setWsStatus('connected', '<i class="ph-fill ph-circle" style="font-size: 1em; vertical-align: middle; color: var(--green);"></i> Добавлен');
    clearTimeout(wsReconnectTimer);
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (window.onWsMessage) window.onWsMessage(data);
    } catch(err) {}
  };

  ws.onclose = () => {
    setWsStatus('disconnected', '<i class="ph-fill ph-circle" style="font-size: 1em; vertical-align: middle; color: var(--red);"></i> Отключено');
    wsReconnectTimer = setTimeout(connectWS, 3000);
  };

  ws.onerror = () => ws.close();
}

function setWsStatus(state, label) {
  const dot = document.getElementById('wsDot');
  const lbl = document.getElementById('wsLabel');
  if (dot) { dot.className = 'ws-dot ' + state; }
  if (lbl) lbl.innerHTML = label;
}

// ===== TOAST =====
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: '<i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i>', error: '<i class="ph-duotone ph-x-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--red);"></i>', warning: '⚠️', info: '<i class="ph-duotone ph-info" style="font-size: 1.1em; vertical-align: middle;"></i>' };
  const id = 'toast_' + Date.now();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.id = id;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || '<i class="ph-duotone ph-info" style="font-size: 1.1em; vertical-align: middle;"></i>'}</span>
    <span class="toast-msg">${message}</span>
    <span class="toast-close" onclick="removeToast('${id}')">✕</span>
  `;
  container.appendChild(el);
  setTimeout(() => removeToast(id), duration);
}

function removeToast(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'slideOut 0.3s ease forwards';
  setTimeout(() => el.remove(), 300);
}

// ===== UTILITY =====
function formatPhone(phone) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9)}`;
  }
  return '+' + d;
}

function formatBirthday(year, month, day) {
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const parts = [];
  if (day) parts.push(day);
  if (month) parts.push(months[parseInt(month)-1]);
  if (year) parts.push(year);
  return parts.length ? parts.join(' ') : '—';
}

function getInitials(firstName, lastName) {
  return ((firstName[0] || '') + (lastName[0] || '')).toUpperCase();
}

function debounce(fn, delay = 400) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ===== API HELPERS =====
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Ошибка'); }
  return res.json();
}

async function apiPost(url, data) {
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Ошибка'); }
  return res.json();
}

async function apiPut(url, data) {
  const res = await fetch(url, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Ошибка'); }
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Ошибка'); }
  return res.json();
}

// ===== MODAL HELPERS =====
function openModalById(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModalById(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ===== MOBILE MENU =====
function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
  document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

function closeMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  connectWS();
  
  // Close mobile menu on nav click
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', closeMobileMenu);
  });
});
