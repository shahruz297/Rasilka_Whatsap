let allTemplates = [];

async function loadTemplates() {
  const tbody = document.getElementById('templatesTbody');
  try {
    allTemplates = await apiGet('/api/templates');
    renderTemplates();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--red)">Ошибка загрузки шаблонов: ${e.message}</td></tr>`;
  }
}

function renderTemplates() {
  const tbody = document.getElementById('templatesTbody');
  const countEl = document.getElementById('totalCount');
  const term = document.getElementById('templateSearch').value.toLowerCase();
  
  const filtered = allTemplates.filter(t => 
    t.name.toLowerCase().includes(term) || t.text.toLowerCase().includes(term)
  );
  
  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted)">Шаблоны не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const d = new Date(t.created_at);
    const dateStr = `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
    const shortText = t.text.length > 80 ? t.text.substring(0, 80) + '...' : t.text;
    
    return `
      <tr>
        <td style="font-weight:600">${escapeHtml(t.name)}</td>
        <td style="color:var(--text-muted);white-space:pre-wrap;font-size:13px">${escapeHtml(shortText)}</td>
        <td style="font-size:13px;color:var(--text-muted)">${dateStr}</td>
        <td style="text-align:right">
          <button class="btn btn-secondary btn-sm" style="padding:4px 8px;margin-right:4px" onclick="editTemplate(${t.id})" title="Редактировать">
            <i class="ph-bold ph-pencil-simple"></i>
          </button>
          <button class="btn btn-secondary btn-sm" style="padding:4px 8px;color:var(--red)" onclick="deleteTemplate(${t.id})" title="Удалить">
            <i class="ph-bold ph-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterTemplates() {
  renderTemplates();
}

function openAddTemplateModal() {
  document.getElementById('templateForm').reset();
  document.getElementById('templateId').value = '';
  document.getElementById('templateModalTitle').textContent = 'Добавить шаблон';
  openModalById('templateModal');
}

function editTemplate(id) {
  const t = allTemplates.find(x => x.id === id);
  if (!t) return;
  
  document.getElementById('templateId').value = t.id;
  document.getElementById('templateName').value = t.name;
  document.getElementById('templateText').value = t.text;
  document.getElementById('templateModalTitle').textContent = 'Редактировать шаблон';
  
  openModalById('templateModal');
}

document.getElementById('templateForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveTemplateBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';

  const id = document.getElementById('templateId').value;
  const data = {
    name: document.getElementById('templateName').value.trim(),
    text: document.getElementById('templateText').value.trim()
  };

  try {
    if (id) {
      await apiPut(`/api/templates/${id}`, data);
      showToast('Шаблон успешно обновлен', 'success');
    } else {
      await apiPost('/api/templates', data);
      showToast('Шаблон успешно добавлен', 'success');
    }
    closeModalById('templateModal');
    loadTemplates();
  } catch(err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
});

async function deleteTemplate(id) {
  if (!confirm('Вы уверены, что хотите удалить этот шаблон?')) return;
  try {
    await apiDelete(`/api/templates/${id}`);
    showToast('Шаблон удален', 'success');
    loadTemplates();
  } catch(err) {
    showToast(err.message, 'error');
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', () => {
  loadTemplates();
});
