// ===== SEND PAGE =====
let allClients = [];
let filteredClients = [];
let selectedClientIds = new Set();
let currentCampaignId = null;
let sendingActive = false;
let countdownInterval = null;

// ===== LOAD CLIENTS =====
async function loadClients() {
  try {
    const res = await apiGet('/api/clients?limit=500');
    allClients = res.clients || [];
    filteredClients = [...allClients];
    document.getElementById('clientCountLabel').textContent =
      `Всего ${allClients.length} клиентов`;
    renderClientGrid();
    updateSummary();
  } catch(e) {
    document.getElementById('clientCountLabel').textContent = 'Ошибка загрузки';
  }
}

function renderClientGrid() {
  const grid = document.getElementById('clientGrid');
  if (!filteredClients.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted)">
      ${allClients.length === 0 ? '<i class="ph-duotone ph-users" style="font-size: 1.1em; vertical-align: middle;"></i> Клиенты не добавлены. <a href="/clients" style="color:var(--green)">Перейти к клиентам →</a>' : '🔍 Клиент не найден'}
    </div>`;
    return;
  }

  grid.innerHTML = filteredClients.map(c => {
    const sel = selectedClientIds.has(c.id);
    const initials = getInitials(c.first_name, c.last_name);
    const bday = formatBirthday(c.birth_year, c.birth_month, c.birth_day);
    return `<div class="client-select-item ${sel ? 'selected' : ''}" id="citem_${c.id}" onclick="toggleClientSelect(${c.id})">
      <input type="checkbox" ${sel ? 'checked' : ''} style="pointer-events:none;accent-color:var(--green);width:16px;height:16px"/>
      <div class="avatar" style="width:32px;height:32px;font-size:12px">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.first_name} ${c.last_name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${formatPhone(c.phone)}${bday !== '—' ? ' • ' + bday : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function toggleClientSelect(id) {
  if (selectedClientIds.has(id)) selectedClientIds.delete(id);
  else selectedClientIds.add(id);
  const item = document.getElementById('citem_' + id);
  if (item) {
    item.classList.toggle('selected', selectedClientIds.has(id));
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = selectedClientIds.has(id);
  }
  updateSelectedCount();
  updateSummary();
  updatePreview(); // preview immediately reflects selected client's real data
}


function toggleSelectAllClients() {
  const cb = document.getElementById('selectAllClients');
  if (cb.checked) filteredClients.forEach(c => selectedClientIds.add(c.id));
  else filteredClients.forEach(c => selectedClientIds.delete(c.id));
  renderClientGrid();
  updateSelectedCount();
  updateSummary();
}

function updateSelectedCount() {
  const cnt = document.getElementById('selectedClientsCount');
  if (cnt) cnt.textContent = selectedClientIds.size > 0 ? `${selectedClientIds.size} выбрано` : '';
}

function filterClients() {
  const q = document.getElementById('clientSearch').value.toLowerCase();
  filteredClients = allClients.filter(c =>
    [c.first_name, c.last_name, c.phone, c.address].some(f => f && f.toLowerCase().includes(q))
  );
  renderClientGrid();
}

// ===== MESSAGE PREVIEW =====
function updatePreview() {
  const text = document.getElementById('messageText').value;
  const preview = document.getElementById('msgPreview');

  let previewText = text;

  let client = null;
  if (selectedClientIds.size === 1) {
    const firstId = Array.from(selectedClientIds)[0];
    client = allClients.find(c => c.id === firstId) || null;
  }

  if (client) {
    const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const firstName  = client.first_name;
    const lastName   = client.last_name;
    const phone      = formatPhone(client.phone);
    const address    = client.address || '—';
    let birthday     = '15 Июнь 1990'; // Default if null
    if (client.birth_day && client.birth_month && client.birth_year) {
      birthday = `${client.birth_day} ${months[(client.birth_month || 1) - 1]} ${client.birth_year}`;
    }

    previewText = text
      .replace(/{{полное_имя}}/gi, `${firstName} ${lastName}`)
      .replace(/{{имя}}/gi, firstName)
      .replace(/{{first_name}}/gi, firstName)
      .replace(/{{фамилия}}/gi, lastName)
      .replace(/{{телефон}}/gi, phone)
      .replace(/{{адрес}}/gi, address)
      .replace(/{{день_рождения}}/gi, birthday);
  }

  preview.textContent = previewText || 'Текст сообщения появится здесь...';

  // Show preview label: whose data is used
  const previewLabel = document.getElementById('previewClientLabel');
  if (previewLabel) {
    if (client) {
      previewLabel.textContent = `Предпросмотр: ${client.first_name} ${client.last_name}`;
    } else if (selectedClientIds.size > 1) {
      previewLabel.textContent = `Предпросмотр: общий шаблон (${selectedClientIds.size} клиентов)`;
    } else {
      previewLabel.textContent = 'Предпросмотр: (шаблон)';
    }
  }

  updateSummary();
}


function insertVar(variable) {
  const ta = document.getElementById('messageText');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  ta.value = val.substring(0, start) + variable + val.substring(end);
  ta.selectionStart = ta.selectionEnd = start + variable.length;
  ta.focus();
  updatePreview();
}

// ===== SUMMARY =====
function updateSummary() {
  const batchSize = parseInt(document.getElementById('batchSize').value) || 70;
  const intervalMin = parseInt(document.getElementById('intervalMin').value) || 10;
  const intervalMax = parseInt(document.getElementById('intervalMax').value) || 30;
  const batchInterval = parseInt(document.getElementById('batchInterval').value) || 120;
  const count = selectedClientIds.size;

  document.getElementById('sumClients').textContent = count;
  if (!count) {
    document.getElementById('sumBatches').textContent = '—';
    document.getElementById('sumTime').textContent = '—';
    return;
  }

  const batches = Math.ceil(count / batchSize);
  document.getElementById('sumBatches').textContent = `${batches} партия`;

  const avgInterval = (intervalMin + intervalMax) / 2;
  const msgTime = count * avgInterval;
  const batchPauseTime = (batches - 1) * batchInterval;
  const totalSec = msgTime + batchPauseTime;

  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  let timeStr = '';
  if (hours > 0) timeStr += `${hours} ч. `;
  if (mins > 0) timeStr += `${mins} мин`;
  if (!timeStr) timeStr = `~${Math.round(totalSec)} сек`;
  document.getElementById('sumTime').textContent = '~' + timeStr;
}

// ===== SEND =====
async function startSending() {
  const message = document.getElementById('messageText').value.trim();
  if (!message) { showToast('Введите текст сообщения', 'warning'); return; }
  if (!selectedClientIds.size) { showToast('Выберите хотя бы одного клиента', 'warning'); return; }

  const campaignName = document.getElementById('campaignName').value.trim() ||
    `Кампания ${new Date().toLocaleDateString('ru-RU')}`;

  const btn = document.getElementById('sendBtn');
  btn.disabled = true; btn.innerHTML = '<span><i class="ph-duotone ph-hourglass-medium" style="font-size: 1.1em; vertical-align: middle;"></i></span> Запуск...';

  try {
    const data = await apiPost('/api/whatsapp/send', {
      campaign_name: campaignName,
      message,
      client_ids: Array.from(selectedClientIds),
      batch_size: parseInt(document.getElementById('batchSize').value) || 70,
      interval_min: parseInt(document.getElementById('intervalMin').value) || 10,
      interval_max: parseInt(document.getElementById('intervalMax').value) || 30,
      batch_interval: parseInt(document.getElementById('batchInterval').value) || 120,
    });

    currentCampaignId = data.campaign_id;
    sendingActive = true;
    openSendingOverlay(data.total);
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span><i class="ph-duotone ph-rocket-launch" style="font-size: 1.1em; vertical-align: middle;"></i></span> Начать рассылку';
  }
}

function openSendingOverlay(total) {
  const overlay = document.getElementById('sendingOverlay');
  overlay.style.display = 'flex';
  document.getElementById('remainNum').textContent = total;
  document.getElementById('progressText').textContent = `0 / ${total}`;
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('sentNum').textContent = '0';
  document.getElementById('failedNum').textContent = '0';
  document.getElementById('liveFeed').innerHTML = '';
  document.getElementById('lastAction').textContent = 'Отправка началась...';
  document.getElementById('waitingCountdown').style.display = 'none';
  document.getElementById('sendingTitle').textContent = 'Отправка...';
  document.getElementById('sendingSubtitle').textContent = 'Сообщения отправляются, ожидайте...';
  document.getElementById('sendingIcon').textContent = '📤';
  document.getElementById('cancelBtn').style.display = 'inline-flex';
  document.getElementById('viewCampaignBtn').style.display = 'none';
}

function closeSendingOverlay() {
  document.getElementById('sendingOverlay').style.display = 'none';
  sendingActive = false;
  const btn = document.getElementById('sendBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<span><i class="ph-duotone ph-rocket-launch" style="font-size: 1.1em; vertical-align: middle;"></i></span> Начать рассылку'; }
}

async function cancelSending() {
  if (!currentCampaignId) return;
  try {
    await apiPost(`/api/whatsapp/cancel/${currentCampaignId}`, {});
    showToast('Отправка остановлена', 'warning');
  } catch(e) {}
}

// ===== WEBSOCKET MESSAGES =====
window.onWsMessage = (data) => {
  if (!currentCampaignId) return;
  if (data.campaign_id !== currentCampaignId) return;

  switch(data.type) {
    case 'progress':
      updateProgress(data);
      addFeedItem(data);
      break;
    case 'waiting':
      showCountdown(data.seconds);
      addFeedItem({ status: 'wait', client_name: `Ожидание ${data.seconds} секунд...` });
      break;
    case 'batch_pause':
      showCountdown(data.seconds);
      document.getElementById('lastAction').textContent =
        `Партия ${data.batch_num}/${data.total_batches} завершена. Пауза ${data.seconds} секунд...`;
      break;
    case 'campaign_done':
      onCampaignDone(data);
      break;
  }
};

function updateProgress(data) {
  const total = data.total || 1;
  const current = data.current || 0;
  const pct = Math.round((current / total) * 100);

  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${current} / ${total}`;
  document.getElementById('sentNum').textContent = data.sent || 0;
  document.getElementById('failedNum').textContent = data.failed || 0;
  document.getElementById('remainNum').textContent = Math.max(0, total - current);

  const statusEmoji = data.status === 'sent' ? '<i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i>' : '<i class="ph-duotone ph-x-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--red);"></i>';
  document.getElementById('lastAction').innerHTML =
    `${statusEmoji} ${data.client_name} — ${formatPhone(data.phone)}`;
  document.getElementById('waitingCountdown').style.display = 'none';
}

function showCountdown(seconds) {
  const el = document.getElementById('waitingCountdown');
  el.style.display = 'block';
  let remaining = seconds;
  clearInterval(countdownInterval);
  el.innerHTML = `<span class="countdown"><i class="ph-duotone ph-timer" style="font-size: 1.1em; vertical-align: middle;"></i> ${remaining} секунд...</span>`;
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) { clearInterval(countdownInterval); el.style.display = 'none'; return; }
    el.innerHTML = `<span class="countdown"><i class="ph-duotone ph-timer" style="font-size: 1.1em; vertical-align: middle;"></i> ${remaining} секунд...</span>`;
  }, 1000);
}

function addFeedItem(data) {
  const feed = document.getElementById('liveFeed');
  const icon = data.status === 'sent' ? '<i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i>' : data.status === 'failed' ? '<i class="ph-duotone ph-x-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--red);"></i>' : '<i class="ph-duotone ph-hourglass-medium" style="font-size: 1.1em; vertical-align: middle;"></i>';
  const color = data.status === 'sent' ? 'var(--green)' : data.status === 'failed' ? 'var(--red)' : 'var(--yellow)';
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-dot" style="background:${color}"></div>
    <span style="font-size:13px;flex:1">${data.client_name || ''}${data.phone ? ` — ${formatPhone(data.phone)}` : ''}</span>
    <span style="font-size:11px;color:var(--text-muted)">${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
  `;
  feed.insertBefore(item, feed.firstChild);
  if (feed.children.length > 30) feed.lastChild.remove();
}

function onCampaignDone(data) {
  clearInterval(countdownInterval);
  sendingActive = false;
  const isSuccess = data.status === 'completed';

  document.getElementById('sendingIcon').innerHTML = isSuccess ? '🎉' : '<i class="ph-duotone ph-stop-circle" style="font-size: 1.1em; vertical-align: middle;"></i>';
  document.getElementById('sendingTitle').textContent = isSuccess ? 'Рассылка завершена!' : 'Остановлено';
  document.getElementById('sendingSubtitle').innerHTML =
    `<i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i> ${data.sent} отправлено &bull; <i class="ph-duotone ph-x-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--red);"></i> ${data.failed} ошибок`;
  document.getElementById('progressBar').style.width = '100%';
  document.getElementById('cancelBtn').style.display = 'none';
  document.getElementById('viewCampaignBtn').style.display = 'inline-flex';
  document.getElementById('waitingCountdown').style.display = 'none';

  showToast(isSuccess ? `Рассылка завершена! ${data.sent} сообщений отправлено` : 'Рассылка остановлена',
    isSuccess ? 'success' : 'warning');
}

// ===== SETTINGS LOAD =====
async function loadSettings() {
  try {
    const s = await apiGet('/api/settings');
    if (s.batch_size) document.getElementById('batchSize').value = s.batch_size;
    if (s.interval_min) document.getElementById('intervalMin').value = s.interval_min;
    if (s.interval_max) document.getElementById('intervalMax').value = s.interval_max;
    if (s.batch_interval) document.getElementById('batchInterval').value = s.batch_interval;
    updateSummary();
  } catch(e) {}
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  loadClients();
  loadSettings();
});
