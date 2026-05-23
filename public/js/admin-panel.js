let admins = [];
let tariffs = [];

async function loadTariffs() {
  try {
    const res = await fetch('/api/tariffs/plans');
    if (!res.ok) throw new Error('Ошибка загрузки тарифов');
    tariffs = await res.json();
    const activeTariffs = tariffs.filter(t => t.is_active);
    const options = '<option value="">Выберите тариф...</option>' + 
      activeTariffs.map(t => `<option value="${t.id}">${t.name} (Лимит: ${t.daily_limit}, Цена: ${t.price} ₸)</option>`).join('');
    document.getElementById('newTariff').innerHTML = options;
    document.getElementById('editTariff').innerHTML = options;
  } catch(e) { console.error(e); }
}

async function loadAdmins() {
  try {
    const res = await fetch('/api/admin-panel/admins');
    if (!res.ok) throw new Error('Ошибка загрузки');
    admins = await res.json();
    renderAdmins();
  } catch(e) { console.error(e); }
}

async function loadStats() {
  try {
    const res = await fetch('/api/admin-panel/stats');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('statAdmins').textContent = data.total_admins;
    document.getElementById('statTotalClients').textContent = data.total_clients;
    document.getElementById('statTotalCampaigns').textContent = data.total_campaigns;
  } catch(e) { console.error(e); }
}

function renderAdmins() {
  const body = document.getElementById('adminsBody');
  const adminOnly = admins.filter(a => a.role === 'admin');
  if (!adminOnly.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon"><i class="ph-duotone ph-storefront" style="font-size:1.5em;"></i></div><div class="empty-title">Админов нет</div></div></td></tr>';
    return;
  }
  body.innerHTML = adminOnly.map(a => {
    const date = new Date(a.created_at).toLocaleDateString('ru-RU', {day:'numeric',month:'short',year:'numeric'});
    const statusBadge = a.is_active
      ? '<span class="badge badge-green"><i class="ph-duotone ph-check-circle"></i> Активный</span>'
      : '<span class="badge badge-red"><i class="ph-duotone ph-x-circle"></i> Заблокирован</span>';
    const tariffBadge = a.tariff_name
      ? `<span class="badge badge-blue">${a.tariff_name}</span>`
      : '<span class="badge badge-gray">Нет</span>';
    return `<tr>
      <td><strong>${a.shop_name}</strong></td>
      <td><code style="font-size:12px;background:var(--bg-secondary);padding:3px 8px;border-radius:4px">${a.username}</code></td>
      <td><span style="color:var(--green);font-weight:700">${a.client_count||0}</span></td>
      <td>${a.campaign_count||0}</td>
      <td>${tariffBadge}</td>
      <td>${statusBadge}</td>
      <td style="color:var(--text-muted);font-size:13px">${date}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="showAdminDetails(${a.id})" title="Подробнее"><i class="ph-duotone ph-info" style="color:var(--blue)"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="editAdmin(${a.id})" title="Редактировать"><i class="ph-duotone ph-pencil-simple"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="toggleAdminStatus(${a.id},${a.is_active})" title="${a.is_active?'Заблокировать':'Активировать'}"><i class="ph-duotone ${a.is_active?'ph-lock':'ph-lock-open'}" style="color:${a.is_active?'var(--yellow)':'var(--green)'}"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="deleteAdmin(${a.id},'${a.shop_name.replace(/'/g,"\\\'")}')" title="Удалить"><i class="ph-duotone ph-trash" style="color:var(--red)"></i></button>
      </div></td></tr>`;
  }).join('');
}

async function createAdmin() {
  const shop_name = document.getElementById('newShopName').value.trim();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const tariff_id = document.getElementById('newTariff').value;
  if (!shop_name || !username || !password || !tariff_id) { showToast('Заполните все поля и выберите тариф','error'); return; }
  try {
    const res = await fetch('/api/admin-panel/admins', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({shop_name,username,password,tariff_id}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`"${shop_name}" успешно добавлен!`,'success');
    closeModalById('addAdminModal');
    document.getElementById('newShopName').value='';
    document.getElementById('newUsername').value='';
    document.getElementById('newPassword').value='';
    loadAdmins(); loadStats();
  } catch(e) { showToast(e.message,'error'); }
}

function showAdminDetails(id) {
  const admin = admins.find(a => a.id === id);
  if (!admin) return;

  const createdDate = new Date(admin.created_at);
  const now = new Date();
  let nextPaymentDate = new Date(createdDate);
  
  // Автоматически вычисляем следующую дату оплаты (через 1 месяц от даты регистрации)
  while (nextPaymentDate <= now) {
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  }

  document.getElementById('detShopName').textContent = admin.shop_name;
  document.getElementById('detUsername').textContent = '@' + admin.username;
  document.getElementById('detStatus').innerHTML = admin.is_active 
    ? '<span class="badge badge-green"><i class="ph-duotone ph-check-circle"></i> Активный</span>' 
    : '<span class="badge badge-red"><i class="ph-duotone ph-x-circle"></i> Заблокирован</span>';
  document.getElementById('detTariff').textContent = admin.tariff_name || 'Не назначен';
  document.getElementById('detCreated').textContent = createdDate.toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'});
  document.getElementById('detNextPayment').textContent = nextPaymentDate.toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'});
  document.getElementById('detClients').textContent = admin.client_count || 0;
  document.getElementById('detCampaigns').textContent = admin.campaign_count || 0;

  document.getElementById('adminListView').style.display = 'none';
  document.getElementById('adminDetailsView').style.display = 'block';
}

function hideAdminDetails() {
  document.getElementById('adminDetailsView').style.display = 'none';
  document.getElementById('adminListView').style.display = 'block';
}

function editAdmin(id) {
  const admin = admins.find(a => a.id === id);
  if (!admin) return;
  document.getElementById('editAdminId').value = id;
  document.getElementById('editShopName').value = admin.shop_name;
  document.getElementById('editTariff').value = admin.tariff_id || '';
  document.getElementById('editPassword').value = '';
  openModalById('editAdminModal');
}

async function updateAdmin() {
  const id = document.getElementById('editAdminId').value;
  const shop_name = document.getElementById('editShopName').value.trim();
  const tariff_id = document.getElementById('editTariff').value;
  const password = document.getElementById('editPassword').value;
  const body = { shop_name, tariff_id: tariff_id || null };
  if (password) body.password = password;
  try {
    const res = await fetch(`/api/admin-panel/admins/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Обновлено','success');
    closeModalById('editAdminModal');
    loadAdmins();
  } catch(e) { showToast(e.message,'error'); }
}

async function toggleAdminStatus(id, currentStatus) {
  if (!confirm(`${currentStatus?'Заблокировать':'Активировать'} этого админа?`)) return;
  try {
    const res = await fetch(`/api/admin-panel/admins/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_active:!currentStatus}) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    showToast(currentStatus?'Заблокирован':'Активирован','success');
    loadAdmins();
  } catch(e) { showToast(e.message,'error'); }
}

async function deleteAdmin(id, name) {
  if (!confirm(`Удалить "${name}" и все его данные?\nЭто нельзя отменить!`)) return;
  try {
    const res = await fetch(`/api/admin-panel/admins/${id}`, { method:'DELETE' });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    showToast(`"${name}" удалён`,'success');
    loadAdmins(); loadStats();
  } catch(e) { showToast(e.message,'error'); }
}

loadAdmins();
loadStats();
loadTariffs();
