const $ = (s) => document.querySelector(s);
const groupsList = $('#groupsList');
const btnFetch = $('#btnFetch');
const btnLogin = $('#btnLogin');
const btnLogout = $('#btnLogout');
const loginBadge = $('#loginBadge');
const fetchStatus = $('#fetchStatus');
const groupsCountEl = $('#groupsCount');
const selectedCountEl = $('#selectedCount');
const groupsStats = $('#groupsStats');
const chkAll = $('#chkAll');
const searchInput = $('#searchGroups');
const btnSave = $('#btnSaveSelection');
const saveStatus = $('#saveStatus');
const btnStart = $('#btnStart');
const btnStop = $('#btnStop');
const btnManualPoll = $('#btnManualPoll');
const monitorStatus = $('#monitorStatus');
const monitorDot = $('#monitorDot');
const btnTestNotif = $('#btnTestNotif');
const logItems = $('#logItems');

let allGroups = [];
let filteredGroups = [];
let selectedIds = new Set();
let isMonitoring = false;

async function refreshLoginUI() {
  const { loggedIn } = await window.bobtop.checkLogin();
  if (loggedIn) {
    loginBadge.textContent = 'مسجل ✓';
    loginBadge.className = 'badge ok';
    btnLogin.style.display = 'none';
    btnLogout.style.display = 'inline-flex';
    btnFetch.disabled = false;
  } else {
    loginBadge.textContent = 'غير مسجل';
    loginBadge.className = 'badge bad';
    btnLogin.style.display = 'inline-flex';
    btnLogout.style.display = 'none';
    btnFetch.disabled = true;
  }
}

function renderGroups() {
  const q = (searchInput.value || '').trim().toLowerCase();
  filteredGroups = q ? allGroups.filter(g => g.name.toLowerCase().includes(q) || g.url.toLowerCase().includes(q) || g.id.toLowerCase().includes(q)) : allGroups;

  if (filteredGroups.length === 0) {
    if (allGroups.length === 0) {
      groupsList.innerHTML = `<div class="empty"><div class="empty-icon">📦</div><div>لسه مسحبناش الجروبات</div><div class="muted small">سجل دخول بالاكونت النضيف وبعدين دوس "اسحب الجروبات الآن"</div></div>`;
    } else {
      groupsList.innerHTML = `<div class="empty"><div class="muted">لا يوجد نتائج لـ "${q}"</div></div>`;
    }
    return;
  }

  groupsList.innerHTML = filteredGroups.map(g => `
    <label class="group-item">
      <input type="checkbox" data-id="${g.id}" ${selectedIds.has(g.id) ? 'checked' : ''}>
      <div class="group-info">
        <div class="group-name" title="${g.name}">${escapeHtml(g.name)}</div>
        <div class="group-url" title="${g.url}">${escapeHtml(g.url)}</div>
      </div>
      <a href="#" class="btn btn-ghost btn-open" data-open="${g.url}">فتح ↗</a>
    </label>
  `).join('');

  // bind
  groupsList.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
      updateCounts();
      syncCheckAll();
    });
  });
  groupsList.querySelectorAll('[data-open]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const url = a.dataset.open;
      window.open(url, '_blank');
    });
  });
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function updateCounts() {
  groupsCountEl.textContent = `${allGroups.length} جروب`;
  selectedCountEl.textContent = `${selectedIds.size} محدد`;
  groupsStats.style.display = allGroups.length ? 'flex' : 'none';
  btnStart.disabled = selectedIds.size === 0 || isMonitoring;
  btnManualPoll.disabled = selectedIds.size === 0 || !isMonitoring;
  // sync save button state? we allow save anytime
}

function syncCheckAll() {
  if (filteredGroups.length === 0) { chkAll.checked = false; chkAll.indeterminate = false; return; }
  const allChecked = filteredGroups.every(g => selectedIds.has(g.id));
  const someChecked = filteredGroups.some(g => selectedIds.has(g.id));
  chkAll.checked = allChecked;
  chkAll.indeterminate = !allChecked && someChecked;
}

chkAll.addEventListener('change', () => {
  if (chkAll.checked) {
    filteredGroups.forEach(g => selectedIds.add(g.id));
  } else {
    filteredGroups.forEach(g => selectedIds.delete(g.id));
  }
  renderGroups();
  updateCounts();
});

searchInput.addEventListener('input', () => { renderGroups(); syncCheckAll(); });

btnLogin.addEventListener('click', async () => {
  await window.bobtop.openLogin();
  // poll for login
  let tries = 0;
  const iv = setInterval(async () => {
    tries++;
    await refreshLoginUI();
    const { loggedIn } = await window.bobtop.checkLogin();
    if (loggedIn || tries>30) clearInterval(iv);
    if (loggedIn) fetchStatus.textContent = '✓ تم تسجيل الدخول، اسحب الجروبات الآن';
  }, 1500);
});

btnLogout.addEventListener('click', async () => {
  await window.bobtop.logout();
  await refreshLoginUI();
  fetchStatus.textContent = 'تم تسجيل الخروج';
});

btnFetch.addEventListener('click', async () => {
  btnFetch.disabled = true;
  fetchStatus.textContent = 'جاري سحب الجروبات... (هيفتح فيسبوك في الخلفية ويعمل سكرول)';
  try {
    const { groups } = await window.bobtop.fetchGroups();
    allGroups = groups || [];
    // keep selectedIds as is but filter non-existing
    selectedIds = new Set([...selectedIds].filter(id => allGroups.some(g=>g.id===id)));
    fetchStatus.textContent = `✓ تم سحب ${allGroups.length} جروب`;
    renderGroups(); updateCounts(); syncCheckAll();
  } catch (e) {
    fetchStatus.textContent = '✗ ' + (e.message || 'فشل السحب');
  } finally {
    btnFetch.disabled = false;
    await refreshLoginUI();
  }
});

btnSave.addEventListener('click', async () => {
  saveStatus.textContent = 'جاري الحفظ...';
  await window.bobtop.saveSelectedGroups([...selectedIds]);
  saveStatus.textContent = `✓ تم حفظ ${selectedIds.size} جروب للمراقبة`;
  setTimeout(()=> saveStatus.textContent='', 3000);
  updateCounts();
});

btnTestNotif.addEventListener('click', async () => {
  await window.bobtop.testNotification();
});

function setMonitoringUI(monitoring) {
  isMonitoring = monitoring;
  if (monitoring) {
    btnStart.style.display='none';
    btnStop.style.display='inline-flex';
    monitorStatus.textContent='نشط - يراقب كل 3-4.5 دقايق';
    monitorDot.className='monitor-dot active';
    btnManualPoll.disabled = selectedIds.size===0;
  } else {
    btnStart.style.display='inline-flex';
    btnStop.style.display='none';
    monitorStatus.textContent='متوقف';
    monitorDot.className='monitor-dot idle';
    btnManualPoll.disabled = true;
  }
  updateCounts();
}

btnStart.addEventListener('click', async () => {
  // auto save
  await window.bobtop.saveSelectedGroups([...selectedIds]);
  try {
    await window.bobtop.toggleMonitoring(true);
    setMonitoringUI(true);
    addLog('بدأت المراقبة - سيتم فحص كل الجروبات المحددة وإرسال اشعار عند اي بوست جديد');
  } catch(e) {
    alert(e.message);
  }
});
btnStop.addEventListener('click', async () => {
  await window.bobtop.toggleMonitoring(false);
  setMonitoringUI(false);
  addLog('توقفت المراقبة');
});
btnManualPoll.addEventListener('click', async () => {
  monitorStatus.textContent='جاري الفحص الآن...';
  await window.bobtop.manualPoll();
  monitorStatus.textContent='نشط - تم الفحص';
  setTimeout(()=> { if(isMonitoring) monitorStatus.textContent='نشط - يراقب كل 3-4.5 دقايق'; },2000);
});

function addLog(msg) {
  const at = new Date().toLocaleTimeString('ar-EG');
  if (logItems.querySelector('.muted')) logItems.innerHTML='';
  const div = document.createElement('div');
  div.className='log-entry';
  div.innerHTML = `<div>${escapeHtml(msg)}</div><div class="t">${at}</div>`;
  logItems.prepend(div);
}

// events from main
window.bobtop.onNewPost(({group, post}) => {
  addLog(`🔔 منشور جديد في ${group.name} - ${post.author || ''}: ${post.text?.substring(0,80) || ''}`);
});
window.bobtop.onStatus(({isMonitoring}) => setMonitoringUI(isMonitoring));

(async function init(){
  await refreshLoginUI();
  const store = await window.bobtop.getStore();
  allGroups = store.groups || [];
  selectedIds = new Set(store.selectedGroupIds || []);
  // If we have monitoredGroups but no selectedIds, migrate
  if (store.monitoredGroups && store.monitoredGroups.length && selectedIds.size===0) {
    selectedIds = new Set(store.monitoredGroups.map(g=>g.id));
  }
  const { isMonitoring: mon } = await window.bobtop.getMonitoringStatus();
  renderGroups(); updateCounts(); syncCheckAll();
  setMonitoringUI(mon);
  if (allGroups.length) fetchStatus.textContent = `محفوظ ${allGroups.length} جروب - اضغط اسحب للتحديث`;
})();
