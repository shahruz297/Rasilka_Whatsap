// ===== TARIFFS PAGE =====
let allPlans = [];
let allAdmins = [];
let myTariff = null;

// ===== LOAD DATA =====
async function loadTariffPlans() {
  try {
    const plans = await apiGet('/api/tariffs/plans');
    allPlans = plans || [];
    renderTariffGrid();
    renderManageTariffGrid();
  } catch(e) {
    console.error('Error loading plans:', e);
  }
}

async function loadMyTariff() {
  try {
    myTariff = await apiGet('/api/tariffs/my');
    renderUsageSection();
  } catch(e) {
    console.error('Error loading my tariff:', e);
  }
}

async function loadAdminsForTariff() {
  if (!currentUser || currentUser.role !== 'superadmin') return;
  try {
    const admins = await apiGet('/api/admin-panel/admins');
    allAdmins = (admins || []).filter(a => a.role !== 'superadmin');
    renderAdminTariffTable();
  } catch(e) {
    console.error('Error loading admins:', e);
  }
}

// ===== RENDER TARIFF CARDS =====
function renderTariffGrid() {
  const grid = document.getElementById('tariffGrid');
  if (!allPlans.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
      <i class="ph-duotone ph-crown" style="font-size:32px;opacity:0.5;"></i>
      <div style="margin-top:8px">Тарифные планы отсутствуют</div>
    </div>`;
    return;
  }

  const badgeClasses = ['starter', 'standard', 'premium', 'unlimited'];
  const gradients = [
    'linear-gradient(135deg,#3b82f6,#2563eb)',
    'linear-gradient(135deg,#10b981,#059669)',
    'linear-gradient(135deg,#f59e0b,#d97706)',
    'linear-gradient(135deg,#a855f7,#7c3aed)'
  ];
  const icons = ['ph-paper-plane-tilt', 'ph-lightning', 'ph-crown', 'ph-rocket'];

  grid.innerHTML = allPlans.map((plan, idx) => {
    const isActive = myTariff && myTariff.tariff_id === plan.id;
    const badgeClass = badgeClasses[Math.min(idx, badgeClasses.length - 1)];
    const gradient = gradients[Math.min(idx, gradients.length - 1)];
    const icon = icons[Math.min(idx, icons.length - 1)];
    const priceFormatted = plan.price > 0 ? formatPrice(plan.price) + ' ₸' : 'Бесплатно';

    return `<div class="tariff-card ${isActive ? 'active-plan' : ''}">
      <div class="tariff-badge ${badgeClass}">
        <i class="ph-duotone ${icon}" style="font-size:14px;"></i> ${plan.name}
      </div>
      <div class="tariff-price">${priceFormatted}</div>
      <div class="tariff-price-sub">${plan.price > 0 ? 'в месяц' : ''}</div>
      <div class="tariff-limit">
        <div class="tariff-limit-icon" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;">
          <i class="ph-duotone ph-whatsapp-logo" style="font-size:24px;"></i>
        </div>
        <div>
          <div class="tariff-limit-value">${plan.daily_limit >= 999999 ? '∞' : formatNumber(plan.daily_limit)}</div>
          <div class="tariff-limit-label">сообщ./день</div>
        </div>
      </div>
      <ul class="tariff-features">
        <li><i class="ph-fill ph-check-circle"></i> ${plan.daily_limit >= 999999 ? 'Безлимитная' : formatNumber(plan.daily_limit)} рассылка в день</li>
        <li><i class="ph-fill ph-check-circle"></i> Отправка через WhatsApp Web</li>
        <li><i class="ph-fill ph-check-circle"></i> Управление базой клиентов</li>
        <li><i class="ph-fill ph-check-circle"></i> Авто-поздравление с днём рождения</li>
        ${plan.daily_limit >= 2000 ? '<li><i class="ph-fill ph-check-circle"></i> Приоритетная поддержка</li>' : ''}
      </ul>
      ${isActive ? '<div style="text-align:center;color:var(--green);font-weight:700;font-size:14px;"><i class="ph-fill ph-check-circle"></i> Активный тариф</div>' : ''}
    </div>`;
  }).join('');
}

// ===== RENDER USAGE SECTION =====
function renderUsageSection() {
  if (!myTariff) return;

  const { today_sent, daily_limit, remaining, tariff_name, date } = myTariff;
  const pct = daily_limit > 0 ? Math.min(100, Math.round((today_sent / daily_limit) * 100)) : 0;

  // Update elements
  document.getElementById('usageDate').textContent = formatDateRu(date);
  document.getElementById('usageTariffBadge').textContent = tariff_name;
  document.getElementById('usageCounter').textContent = `${formatNumber(today_sent)} / ${daily_limit >= 999999 ? '∞' : formatNumber(daily_limit)}`;
  document.getElementById('usagePercent').textContent = `${pct}% использовано`;
  document.getElementById('statSent').textContent = formatNumber(today_sent);
  document.getElementById('statRemaining').textContent = daily_limit >= 999999 ? '∞' : formatNumber(remaining);
  document.getElementById('statLimit').textContent = daily_limit >= 999999 ? '∞' : formatNumber(daily_limit);

  // Progress bar
  const bar = document.getElementById('usageProgressBar');
  bar.style.width = pct + '%';
  bar.className = 'usage-progress-bar';
  if (pct < 50) bar.classList.add('low');
  else if (pct < 80) bar.classList.add('medium');
  else bar.classList.add('high');

  // Badge color
  const badge = document.getElementById('usageTariffBadge');
  badge.className = 'badge';
  if (!myTariff.tariff_id) badge.classList.add('badge-red');
  else if (pct >= 80) badge.classList.add('badge-yellow');
  else badge.classList.add('badge-green');
}

// ===== SUPER ADMIN: Admin Tariff Table =====
function renderAdminTariffTable() {
  const tbody = document.getElementById('adminTariffBody');
  if (!allAdmins.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">
      <i class="ph-duotone ph-storefront" style="font-size:24px;opacity:0.5;"></i>
      <div style="margin-top:8px">Магазины отсутствуют</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = allAdmins.map(admin => {
    const planOptions = allPlans.map(p =>
      `<option value="${p.id}" ${admin.tariff_id === p.id ? 'selected' : ''}>${p.name} (${p.daily_limit >= 999999 ? '∞' : p.daily_limit}/день)</option>`
    ).join('');

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="width:32px;height:32px;font-size:12px;">${(admin.shop_name || 'M')[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:600;font-size:14px;">${admin.shop_name}</div>
          </div>
        </div>
      </td>
      <td><span style="font-size:13px;color:var(--text-muted)">@${admin.username}</span></td>
      <td>
        <span class="badge ${admin.tariff_id ? 'badge-green' : 'badge-red'}">
          ${admin.tariff_name || 'Не назначен'}
        </span>
      </td>
      <td id="adminUsage_${admin.id}" style="font-weight:600">—</td>
      <td>
        <select class="tariff-select" onchange="assignTariff(${admin.id}, this.value)" id="tariffSelect_${admin.id}">
          <option value="">— Выберите —</option>
          ${planOptions}
        </select>
      </td>
    </tr>`;
  }).join('');

  // Load usage for each admin
  allAdmins.forEach(admin => loadAdminUsage(admin.id));
}

async function loadAdminUsage(adminId) {
  try {
    const data = await apiGet(`/api/tariffs/usage/${adminId}`);
    const el = document.getElementById(`adminUsage_${adminId}`);
    if (el) el.textContent = data.sent_count || 0;
  } catch(e) {}
}

async function assignTariff(adminId, tariffId) {
  try {
    await apiPut(`/api/tariffs/assign/${adminId}`, { tariff_id: tariffId ? parseInt(tariffId) : null });
    showToast('Тариф успешно назначен!', 'success');
    loadAdminsForTariff();
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ===== SUPER ADMIN: Manage Tariff Plans =====
function renderManageTariffGrid() {
  const grid = document.getElementById('manageTariffGrid');
  if (!grid) return;

  grid.innerHTML = allPlans.map(plan => `
    <div class="manage-tariff-item">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:700;font-size:15px;color:var(--text-primary);">${plan.name}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="openEditTariffModal(${plan.id})" title="Изменить">
            <i class="ph-duotone ph-pencil-simple" style="font-size:14px;"></i>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="deleteTariff(${plan.id})" title="Удалить" style="color:var(--red);">
            <i class="ph-duotone ph-trash" style="font-size:14px;"></i>
          </button>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-muted);">
        <i class="ph-duotone ph-envelope-simple"></i> ${plan.daily_limit >= 999999 ? '∞' : formatNumber(plan.daily_limit)} сообщ./день
      </div>
      <div style="font-size:13px;color:var(--text-muted);">
        <i class="ph-duotone ph-money"></i> ${plan.price > 0 ? formatPrice(plan.price) + ' ₸' : 'Бесплатно'}
      </div>
      ${plan.description ? `<div style="font-size:12px;color:var(--text-muted);opacity:0.7;">${plan.description}</div>` : ''}
    </div>
  `).join('');
}

// ===== MODAL: Add/Edit Tariff =====
function openAddTariffModal() {
  document.getElementById('editTariffId').value = '';
  document.getElementById('tariffName').value = '';
  document.getElementById('tariffLimit').value = '';
  document.getElementById('tariffPrice').value = '';
  document.getElementById('tariffDescription').value = '';
  document.getElementById('tariffModalTitle').innerHTML = '<i class="ph-duotone ph-plus-circle" style="font-size:1.1em;vertical-align:middle;"></i> Новый тариф';
  openModalById('tariffModal');
}

function openEditTariffModal(id) {
  const plan = allPlans.find(p => p.id === id);
  if (!plan) return;
  document.getElementById('editTariffId').value = plan.id;
  document.getElementById('tariffName').value = plan.name;
  document.getElementById('tariffLimit').value = plan.daily_limit;
  document.getElementById('tariffPrice').value = plan.price;
  document.getElementById('tariffDescription').value = plan.description || '';
  document.getElementById('tariffModalTitle').innerHTML = '<i class="ph-duotone ph-pencil-simple" style="font-size:1.1em;vertical-align:middle;"></i> Редактировать тариф';
  openModalById('tariffModal');
}

async function saveTariff() {
  const id = document.getElementById('editTariffId').value;
  const body = {
    name: document.getElementById('tariffName').value.trim(),
    daily_limit: parseInt(document.getElementById('tariffLimit').value),
    price: parseInt(document.getElementById('tariffPrice').value) || 0,
    description: document.getElementById('tariffDescription').value.trim()
  };

  if (!body.name || !body.daily_limit) {
    showToast('Заполните название и лимит тарифа', 'warning');
    return;
  }

  try {
    if (id) {
      await apiPut(`/api/tariffs/plans/${id}`, body);
      showToast('Тариф обновлён!', 'success');
    } else {
      await apiPost('/api/tariffs/plans', body);
      showToast('Новый тариф добавлен!', 'success');
    }
    closeModalById('tariffModal');
    loadTariffPlans();
    loadAdminsForTariff();
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

async function deleteTariff(id) {
  const plan = allPlans.find(p => p.id === id);
  if (!confirm(`Вы хотите удалить тариф "${plan?.name}"?`)) return;

  try {
    await apiDelete(`/api/tariffs/plans/${id}`);
    showToast('Тариф удалён', 'success');
    loadTariffPlans();
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ===== HELPERS =====
function formatPrice(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatDateRu(dateStr) {
  if (!dateStr) return '—';
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2]);
  const month = months[parseInt(parts[1]) - 1];
  return `${day} ${month} ${parts[0]}`;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for auth
  const waitForAuth = setInterval(() => {
    if (currentUser) {
      clearInterval(waitForAuth);
      initTariffPage();
    }
  }, 100);

  setTimeout(() => clearInterval(waitForAuth), 5000);
});

async function initTariffPage() {
  loadTariffPlans();
  loadMyTariff();

  // Показать раздел суперадмина
  if (currentUser.role === 'superadmin') {
    document.getElementById('superAdminSection').style.display = 'block';
    loadAdminsForTariff();
  }
}
