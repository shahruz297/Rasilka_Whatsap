// ===== CLIENTS PAGE =====
let allClients = [];
let filteredClients = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let selectedIds = new Set();
let deleteTargetId = null;
let csvData = [];

// ===== LOAD =====
async function loadClients() {
  try {
    const search = document.getElementById('searchInput').value || '';
    const res = await apiGet(`/api/clients?search=${encodeURIComponent(search)}&limit=200`);
    allClients = res.clients || [];
    filteredClients = [...allClients];
    currentPage = 1;
    renderTable();
    document.getElementById('clientCount').textContent = `Всего: ${res.total} клиентов`;
  } catch(e) { showToast('Ошибка загрузки клиентов: ' + e.message, 'error'); }
}

function renderTable() {
  const body = document.getElementById('clientsBody');
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredClients.slice(start, start + PAGE_SIZE);

  if (!filteredClients.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <div class="empty-icon"><i class="ph-duotone ph-users" style="font-size: 1.1em; vertical-align: middle;"></i></div>
      <div class="empty-title">Клиентов не найдено</div>
      <div class="empty-text">Добавьте нового клиента или измените поиск</div>
    </div></td></tr>`;
    renderPagination();
    return;
  }

  body.innerHTML = page.map(c => {
    const checked = selectedIds.has(c.id) ? 'checked' : '';
    const bday = formatBirthday(c.birth_year, c.birth_month, c.birth_day);
    const initials = getInitials(c.first_name, c.last_name);
    const tags = c.tags ? c.tags.split(',').filter(Boolean).map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
    const date = new Date(c.created_at).toLocaleDateString('ru-RU', {day:'2-digit',month:'short',year:'numeric'});
    return `<tr id="row_${c.id}">
      <td><input type="checkbox" class="table-check" ${checked} onchange="toggleSelect(${c.id})"/></td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar">${initials}</div>
          <div>
            <div style="font-weight:600">${c.first_name} ${c.last_name}</div>
            ${c.notes ? `<div style="font-size:11px;color:var(--text-muted)">${c.notes.substring(0,40)}</div>` : ''}
          </div>
        </div>
      </td>
      <td><span class="phone-badge"><i class="ph-duotone ph-phone" style="font-size: 1.1em; vertical-align: middle;"></i> ${formatPhone(c.phone)}</span></td>
      <td style="color:var(--text-secondary);font-size:13px">${c.address || '—'}</td>
      <td style="font-size:13px;color:var(--text-secondary)">${bday}</td>
      <td>${tags || '<span style="color:var(--text-muted);font-size:12px">—</span>'}</td>
      <td style="color:var(--text-muted);font-size:12px">${date}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openEdit(${c.id})" title="Редактировать"><i class="ph-duotone ph-pencil-simple" style="font-size: 1.1em; vertical-align: middle;"></i></button>
          <button class="btn btn-danger btn-sm" onclick="openDelete(${c.id},'${c.first_name} ${c.last_name}')" title="Удалить"><i class="ph-duotone ph-trash" style="font-size: 1.1em; vertical-align: middle;"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPagination();
  updateBulkBtn();
}

function renderPagination() {
  const totalPages = Math.ceil(filteredClients.length / PAGE_SIZE);
  const pg = document.getElementById('pagination');
  if (totalPages <= 1) { pg.innerHTML = ''; return; }

  let html = `<div class="pagination">`;
  html += `<div class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'style="opacity:0.3;pointer-events:none"':''}>‹</div>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<div class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</div>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += `<div style="padding:0 4px;color:var(--text-muted)">…</div>`;
    }
  }
  html += `<div class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'style="opacity:0.3;pointer-events:none"':''}>›</div>`;
  html += `</div><div style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:8px">${(currentPage-1)*PAGE_SIZE+1}–${Math.min(currentPage*PAGE_SIZE,filteredClients.length)} из ${filteredClients.length}</div>`;
  pg.innerHTML = html;
}

function goPage(p) {
  const total = Math.ceil(filteredClients.length / PAGE_SIZE);
  if (p < 1 || p > total) return;
  currentPage = p;
  renderTable();
}

// ===== SEARCH =====
const debounceSearch = debounce(() => {
  const q = document.getElementById('searchInput').value.toLowerCase();
  filteredClients = allClients.filter(c =>
    [c.first_name, c.last_name, c.phone, c.address, c.tags].some(f => f && f.toLowerCase().includes(q))
  );
  currentPage = 1;
  renderTable();
});

// ===== SELECT =====
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkBtn();
  updateSelectAllCheckbox();
}

function toggleSelectAll() {
  const checked = document.getElementById('selectAll').checked;
  if (checked) { filteredClients.forEach(c => selectedIds.add(c.id)); }
  else selectedIds.clear();
  renderTable();
  updateBulkBtn();
}

function updateSelectAllCheckbox() {
  const cb = document.getElementById('selectAll');
  if (!cb) return;
  const visibleIds = filteredClients.map(c => c.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  cb.checked = allSelected;
  cb.indeterminate = !allSelected && visibleIds.some(id => selectedIds.has(id));
}

function updateBulkBtn() {
  const btn = document.getElementById('bulkDeleteBtn');
  const cnt = document.getElementById('selectedCount');
  if (selectedIds.size > 0) {
    btn.style.display = 'inline-flex';
    btn.innerHTML = `<i class="ph-duotone ph-trash" style="font-size: 1.1em; vertical-align: middle;"></i> Удалить выбранные (${selectedIds.size})`;
    cnt.textContent = `выбрано: ${selectedIds.size}`;
  } else {
    btn.style.display = 'none';
    cnt.textContent = '';
  }
}

// ===== ADD/EDIT MODAL =====
function openAddModal() {
  resetForm();
  document.getElementById('modalTitle').textContent = 'Добавить клиента';
  document.getElementById('editId').value = '';
  openModalById('clientModal');
}

async function openEdit(id) {
  try {
    const c = await apiGet(`/api/clients/${id}`);
    document.getElementById('modalTitle').textContent = 'Редактировать клиента';
    document.getElementById('editId').value = c.id;
    document.getElementById('fFirstName').value = c.first_name || '';
    document.getElementById('fLastName').value = c.last_name || '';
    document.getElementById('fPhone').value = c.phone || '';
    document.getElementById('fAddress').value = c.address || '';
    document.getElementById('fBirthYear').value = c.birth_year || '';
    document.getElementById('fBirthMonth').value = c.birth_month || '';
    document.getElementById('fBirthDay').value = c.birth_day || '';
    document.getElementById('fTags').value = c.tags || '';
    document.getElementById('fNotes').value = c.notes || '';
    openModalById('clientModal');
  } catch(e) { showToast('Ошибка загрузки: ' + e.message, 'error'); }
}

function resetForm() {
  ['fFirstName','fLastName','fPhone','fAddress','fBirthYear','fBirthDay','fTags','fNotes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fBirthMonth').value = '';
}

function closeModal() { closeModalById('clientModal'); resetForm(); }

async function saveClient() {
  const id = document.getElementById('editId').value;
  const btn = document.getElementById('saveBtn');
  const data = {
    first_name: document.getElementById('fFirstName').value.trim(),
    last_name: document.getElementById('fLastName').value.trim(),
    phone: document.getElementById('fPhone').value.trim().replace(/[^0-9]/g, ''),
    address: document.getElementById('fAddress').value.trim(),
    birth_year: document.getElementById('fBirthYear').value || null,
    birth_month: document.getElementById('fBirthMonth').value || null,
    birth_day: document.getElementById('fBirthDay').value || null,
    tags: document.getElementById('fTags').value.trim(),
    notes: document.getElementById('fNotes').value.trim(),
  };

  if (!data.first_name || !data.last_name || !data.phone) {
    showToast('Имя, фамилия и телефон обязательны!', 'warning'); return;
  }

  btn.disabled = true; btn.innerHTML = '<i class="ph-duotone ph-hourglass-medium" style="font-size: 1.1em; vertical-align: middle;"></i> Сохранение...';
  try {
    if (id) { await apiPut(`/api/clients/${id}`, data); showToast('Клиент обновлен <i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i>', 'success'); }
    else { await apiPost('/api/clients', data); showToast('Клиент добавлен <i class="ph-duotone ph-check-circle" style="font-size: 1.1em; vertical-align: middle; color: var(--green);"></i>', 'success'); }
    closeModal();
    loadClients();
  } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
  btn.disabled = false; btn.innerHTML = '<i class="ph-duotone ph-floppy-disk" style="font-size: 1.1em; vertical-align: middle;"></i> Сохранить';
}

// ===== DELETE =====
function openDelete(id, name) {
  deleteTargetId = id;
  document.getElementById('deleteConfirmText').textContent = `Удалить клиента "${name}"? Это действие нельзя отменить.`;
  openModalById('deleteModal');
}

function closeDeleteModal() { closeModalById('deleteModal'); deleteTargetId = null; }

async function confirmDelete() {
  if (!deleteTargetId) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true; btn.innerHTML = '<i class="ph-duotone ph-hourglass-medium" style="font-size: 1.1em; vertical-align: middle;"></i> Удаление...';
  try {
    await apiDelete(`/api/clients/${deleteTargetId}`);
    showToast('Клиент удален', 'success');
    closeDeleteModal();
    selectedIds.delete(deleteTargetId);
    loadClients();
  } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
  btn.disabled = false; btn.innerHTML = 'Да, удалить';
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`Удалить ${selectedIds.size} клиентов?`)) return;
  try {
    await apiPost('/api/clients/bulk-delete', { ids: Array.from(selectedIds) });
    showToast(`${selectedIds.size} клиентов удалено`, 'success');
    selectedIds.clear();
    loadClients();
  } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
}

// ===== FILE IMPORT (CSV + Excel) =====
function openImportModal() {
  openModalById('importModal');
  // Setup drag-and-drop
  setTimeout(() => {
    const dropZone = document.getElementById('importDropZone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--green)';
      dropZone.style.background = 'var(--green-glow)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--bg-secondary)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--bg-secondary)';
      const file = e.dataTransfer.files[0];
      if (file) {
        // Put file into input for consistency
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('csvFile').files = dt.files;
        previewFile();
      }
    });
  }, 100);
}
function closeImportModal() { closeModalById('importModal'); csvData = []; document.getElementById('csvPreview').style.display='none'; document.getElementById('importBtn').disabled = true; }

function downloadTemplate() {
  const csv = 'first_name,last_name,phone,address,birth_year,birth_month,birth_day\nАлибек,Жумабеков,77071234567,Алматы,1990,6,15\n';
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'clients_template.csv'; a.click();
}

function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') { showToast('Библиотека Excel не загружена', 'error'); return; }
  const data = [
    { first_name: 'Алибек', last_name: 'Жумабеков', phone: '77071234567', address: 'Алматы', birth_year: 1990, birth_month: 6, birth_day: 15 },
    { first_name: 'Айгуль', last_name: 'Сериковна', phone: '77059876543', address: 'Астана', birth_year: 1995, birth_month: 3, birth_day: 22 },
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Клиенты');
  XLSX.writeFile(wb, 'clients_template.xlsx');
}

function previewFile() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const dropZone = document.getElementById('importDropZone');

  if (ext === 'csv') {
    // CSV parsing
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.replace(/\r/g,'').split('\n').filter(Boolean);
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      csvData = lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
        return obj;
      }).filter(r => r.phone);
      showPreviewResult(file.name, csvData.length);
    };
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    // Excel parsing
    if (typeof XLSX === 'undefined') {
      showToast('Библиотека Excel загружается, подождите...', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Normalize headers (support both English and Russian column names)
        const headerMap = {
          'имя': 'first_name', 'фамилия': 'last_name', 'телефон': 'phone',
          'адрес': 'address', 'год_рождения': 'birth_year', 'месяц_рождения': 'birth_month',
          'день_рождения': 'birth_day', 'теги': 'tags', 'заметка': 'notes',
          'first_name': 'first_name', 'last_name': 'last_name', 'phone': 'phone',
          'address': 'address', 'birth_year': 'birth_year', 'birth_month': 'birth_month',
          'birth_day': 'birth_day', 'tags': 'tags', 'notes': 'notes',
        };

        csvData = raw.map(row => {
          const obj = {};
          Object.keys(row).forEach(key => {
            const normalized = headerMap[key.toLowerCase().trim()];
            if (normalized) obj[normalized] = String(row[key]).trim();
          });
          return obj;
        }).filter(r => r.phone && r.phone !== '');

        showPreviewResult(file.name, csvData.length);
      } catch (err) {
        showToast('Ошибка чтения Excel файла: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    showToast('Неподдерживаемый формат. Используйте .xlsx, .xls или .csv', 'warning');
  }
}

function showPreviewResult(fileName, count) {
  const preview = document.getElementById('csvPreview');
  const dropZone = document.getElementById('importDropZone');
  preview.style.display = 'block';

  if (count > 0) {
    // Show first 5 rows as preview table
    const previewRows = csvData.slice(0, 5);
    let tableHtml = `<div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:14px;font-size:13px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <i class="ph-duotone ph-check-circle" style="font-size:1.2em;color:var(--green)"></i>
        <strong>${count}</strong> клиентов найдено в файле <span style="color:var(--text-muted)">${fileName}</span>
      </div>
      <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:rgba(255,255,255,0.03)">
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase">Имя</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase">Фамилия</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase">Телефон</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase">Адрес</th>
          </tr></thead><tbody>`;
    previewRows.forEach(r => {
      tableHtml += `<tr>
        <td style="padding:6px 10px;border-top:1px solid var(--border-subtle)">${r.first_name || '—'}</td>
        <td style="padding:6px 10px;border-top:1px solid var(--border-subtle)">${r.last_name || '—'}</td>
        <td style="padding:6px 10px;border-top:1px solid var(--border-subtle);color:var(--green)">${r.phone || '—'}</td>
        <td style="padding:6px 10px;border-top:1px solid var(--border-subtle);color:var(--text-secondary)">${r.address || '—'}</td>
      </tr>`;
    });
    if (count > 5) tableHtml += `<tr><td colspan="4" style="padding:6px 10px;text-align:center;color:var(--text-muted);font-style:italic;border-top:1px solid var(--border-subtle)">...и ещё ${count - 5}</td></tr>`;
    tableHtml += `</tbody></table></div></div>`;
    preview.innerHTML = tableHtml;

    // Update drop zone to show selected file
    dropZone.innerHTML = `<div style="font-size:32px;margin-bottom:8px">✅</div>
      <div style="font-weight:600;color:var(--green)">${fileName}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Нажмите, чтобы выбрать другой файл</div>`;
  } else {
    preview.innerHTML = `<div style="background:var(--red-soft);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--red)">
      <i class="ph-duotone ph-warning" style="font-size:1.1em;vertical-align:middle"></i> Клиенты не найдены. Проверьте колонку <strong>phone</strong> в файле.
    </div>`;
  }
  document.getElementById('importBtn').disabled = count === 0;
}

async function importCSV() {
  if (!csvData.length) return;
  const btn = document.getElementById('importBtn');
  btn.disabled = true; btn.innerHTML = '<i class="ph-duotone ph-hourglass-medium" style="font-size: 1.1em; vertical-align: middle;"></i> Импортирование...';
  let success = 0, failed = 0;
  for (const row of csvData) {
    try {
      await apiPost('/api/clients', {
        first_name: row.first_name || '', last_name: row.last_name || '',
        phone: (row.phone || '').replace(/[^0-9]/g,''),
        address: row.address || '',
        birth_year: row.birth_year || null, birth_month: row.birth_month || null, birth_day: row.birth_day || null,
        tags: row.tags || '', notes: row.notes || '',
      });
      success++;
    } catch(e) { failed++; }
  }
  showToast(`Импорт завершен: ${success} добавлено, ${failed} ошибок`, success > 0 ? 'success' : 'warning');
  closeImportModal();
  loadClients();
  btn.disabled = false; btn.innerHTML = '<i class="ph-duotone ph-download-simple" style="font-size: 1.1em; vertical-align: middle;"></i> Импортировать';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', loadClients);

