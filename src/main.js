const { app, BrowserWindow, ipcMain, Notification, shell, session, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Simple store without electron-store for MVP (file based)
const STORE_PATH = path.join(app.getPath('userData'), 'bobtop-store.json');

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {}
  return { groups: [], selectedGroupIds: [], monitoredGroups: [], lastSeenPosts: {} };
}
function saveStore(data) {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (e) { console.error('saveStore', e); }
}

let store = loadStore();
let mainWindow;
let fbWindow = null;
let monitorInterval = null;
let isMonitoring = false;
let tray = null;
let isQuitting = false;

function getIconPath() {
  const candidates = [
    path.join(__dirname, '../assets/icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, 'renderer/assets/icon.png'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}

function createTray() {
  if (tray) return;
  const iconPath = getIconPath();
  let trayIcon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (trayIcon.isEmpty()) {
    // fallback 16x16
    trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABFUlEQVR4AWNgGAXDEQwMDP8ZGBgY/v//HwMDEwM3gYHhPwMDA8M/BgaG////MzAwMPz//x/BgYHhPwYGBgZGRkYGRgYGD4D8EGNgYGBgZGRgYGD4D8EGNgYGBgZGRgYGD4DwEGNgYGBgZGRgYGD4DwEGNgYGBgZGRgYGDoHwEGNgYGBgZGRgYGD4DwEGNgYGBgZGRgYGD4DwEGNgYGBgZGRgYGD4DwEGNgYGBgZGRgYGD4DwEGNgYGBgZGRgYGD4DwEGNgYGBgZGRgYGD4D8EGABBgAEQ7xW4k1o3xAAAAABJRU5ErkJggg==');
  }
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('BobTop - مراقب جروبات التصميم');
  updateTrayMenu();
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.focus();
      else { mainWindow.show(); mainWindow.focus(); }
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const template = [
    { label: isMonitoring ? '● يراقب الآن' : '○ متوقف', enabled: false },
    { type: 'separator' },
    { label: 'إظهار الواجهة', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: isMonitoring ? 'إيقاف المراقبة' : 'ابدأ المراقبة', click: () => {
        if (isMonitoring) { stopMonitoring(); } else { try{ startMonitoring(); }catch(e){} }
        updateTrayMenu();
        if (mainWindow) mainWindow.webContents.send('monitor:status', { isMonitoring });
      }},
    { label: 'فحص الآن', enabled: isMonitoring, click: () => pollGroups() },
    { type: 'separator' },
    { label: 'خروج', click: () => { isQuitting=true; app.quit(); } }
  ];
  const menu = Menu.buildFromTemplate(template);
  tray.setContextMenu(menu);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    title: 'BobTop - مراقب جروبات التصميم',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Hide to tray instead of close
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (isMonitoring) {
        new Notification({ title: 'BobTop', body: 'البرنامج شغال في الخلفية جنب الساعة - يراقب الجروبات' }).show();
      }
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  // single instance
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    app.on('second-instance', () => {
      if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
    });
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); else if (mainWindow) mainWindow.show(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { /* keep in tray if monitoring */ if (!isMonitoring) app.quit(); }});
app.on('before-quit', () => { isQuitting = true; });

// ---------- Helpers ----------
function ensureFbWindow() {
  if (fbWindow && !fbWindow.isDestroyed()) return fbWindow;
  fbWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      partition: 'persist:bobtop-fb',
      contextIsolation: true,
    }
  });
  fbWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  fbWindow.on('close', (e) => {
    if (isMonitoring) {
      e.preventDefault();
      fbWindow.hide();
    }
  });
  return fbWindow;
}

async function checkLoginStatus() {
  const ses = session.fromPartition('persist:bobtop-fb');
  const cookies = await ses.cookies.get({ domain: '.facebook.com' });
  const cUser = cookies.find(c => c.name === 'c_user');
  const xs = cookies.find(c => c.name === 'xs');
  return { loggedIn: !!(cUser && xs), cUser: cUser?.value || null };
}

// ---------- IPC ----------

ipcMain.handle('app:getStore', () => store);
ipcMain.handle('app:saveSelectedGroups', (e, selectedIds) => {
  store.selectedGroupIds = selectedIds;
  store.monitoredGroups = store.groups.filter(g => selectedIds.includes(g.id));
  saveStore(store);
  return store;
});
ipcMain.handle('app:toggleMonitoring', (e, shouldStart) => {
  if (shouldStart) startMonitoring();
  else stopMonitoring();
  updateTrayMenu();
  return { isMonitoring };
});
ipcMain.handle('app:getMonitoringStatus', () => ({ isMonitoring, monitoredCount: store.monitoredGroups.length }));

ipcMain.handle('fb:checkLogin', async () => {
  return await checkLoginStatus();
});

ipcMain.handle('fb:openLogin', async () => {
  const win = ensureFbWindow();
  win.show();
  win.focus();
  await win.loadURL('https://www.facebook.com/login');
  return { opened: true };
});

ipcMain.handle('fb:logout', async () => {
  const ses = session.fromPartition('persist:bobtop-fb');
  await ses.clearStorageData({ storages: ['cookies'] });
  if (fbWindow && !fbWindow.isDestroyed()) {
    await fbWindow.loadURL('about:blank');
    fbWindow.hide();
  }
  return { loggedIn: false };
});

ipcMain.handle('fb:fetchGroups', async () => {
  const login = await checkLoginStatus();
  if (!login.loggedIn) throw new Error('يجب تسجيل الدخول أولاً بالاكونت النضيف');

  const win = ensureFbWindow();
  const targetUrl = 'https://m.facebook.com/groups/?seemore&soft=bookmarks';
  try {
    win.show();
    await win.loadURL(targetUrl);
    await new Promise(r => setTimeout(r, 4000));
    const groups = await win.webContents.executeJavaScript(`
      (async () => {
        for (let i=0; i<6; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(r => setTimeout(r, 1200));
        }
        const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        const seen = new Map();
        for (const a of links) {
          try {
            let href = a.getAttribute('href') || '';
            if (!href) continue;
            if (href.startsWith('/')) href = 'https://www.facebook.com' + href.split('?')[0];
            else href = href.split('?')[0];
            const m = href.match(/\\/groups\\/([^\\/\\?#]+)/);
            if (!m) continue;
            const id = m[1];
            if (['feed','joins','create','discover','bookmarks'].includes(id)) continue;
            let name = (a.textContent || '').trim().replace(/\\s+/g,' ');
            if (!name || name.length < 2 || name.length > 80) {
                const parent = a.closest('div');
                if (parent) {
                    const t = parent.innerText ? parent.innerText.split('\\n')[0].trim() : '';
                    if (t && t.length>2 && t.length<80) name = t;
                }
            }
            if (!name || name.length < 2) name = id;
            if (!seen.has(id)) {
                seen.set(id, { id, name: name.substring(0,80), url: 'https://www.facebook.com/groups/' + id });
            } else {
                const cur = seen.get(id);
                if (name.length > cur.name.length && name !== id) cur.name = name.substring(0,80);
            }
          } catch(e){}
        }
        return Array.from(seen.values());
      })()
    `);
    let finalGroups = groups;
    if (!finalGroups || finalGroups.length < 3) {
      await win.loadURL('https://www.facebook.com/groups/joins');
      await new Promise(r => setTimeout(r, 4000));
      for (let i=0;i<4;i++) { await win.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)'); await new Promise(r=>setTimeout(r,1000)); }
      const fallback = await win.webContents.executeJavaScript(`
        (() => {
          const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
          const seen = new Map();
          for (const a of links) {
            let href = a.getAttribute('href')||'';
            if (href.startsWith('/')) href='https://www.facebook.com'+href.split('?')[0];
            else href=href.split('?')[0];
            const m=href.match(/\\/groups\\/([^\\/\\?#]+)/);
            if(!m) continue;
            const id=m[1];
            if(['feed','joins','create','discover','bookmarks','notifications'].includes(id)) continue;
            let name=(a.textContent||'').trim().replace(/\\s+/g,' ');
            if(!name||name.length<2) {
                const aria=a.getAttribute('aria-label');
                if(aria) name=aria;
            }
            if(!name||name.length<2) name=id;
            if(!seen.has(id)) seen.set(id,{id,name:name.substring(0,80),url:'https://www.facebook.com/groups/'+id});
          }
          return Array.from(seen.values());
        })()
      `);
      if (fallback && fallback.length > finalGroups.length) finalGroups = fallback;
    }
    store.groups = finalGroups;
    store.selectedGroupIds = store.selectedGroupIds.filter(id => finalGroups.some(g=>g.id===id));
    store.monitoredGroups = finalGroups.filter(g=>store.selectedGroupIds.includes(g.id));
    saveStore(store);
    if (!isMonitoring) win.hide();
    return { groups: finalGroups, count: finalGroups.length };
  } catch (e) {
    console.error('fetchGroups error', e);
    if (!isMonitoring && win && !win.isDestroyed()) win.hide();
    throw new Error(e.message || 'فشل سحب الجروبات');
  }
});

ipcMain.handle('app:testNotification', async () => {
  const n = new Notification({ title: 'BobTop - اختبار', body: 'منشور جديد في جروب [مصممين جرافيك] - مطلوب مصمم لوجو بميزانية ممتازة', silent: false });
  n.show();
  n.on('click', () => shell.openExternal('https://www.facebook.com'));
  return { ok: true };
});

async function pollGroups() {
  if (!isMonitoring || store.monitoredGroups.length === 0) return;
  const win = ensureFbWindow();
  const login = await checkLoginStatus();
  if (!login.loggedIn) {
    console.log('[monitor] not logged in, skip');
    return;
  }
  for (const group of store.monitoredGroups) {
    try {
      const url = `https://m.facebook.com/groups/${group.id}/`;
      await win.loadURL(url);
      await new Promise(r => setTimeout(r, 2500 + Math.random()*1500));
      const result = await win.webContents.executeJavaScript(`
        (() => {
          let postId = null;
          let text = '';
          let author = '';
          const story = document.querySelector('[data-ft]');
          if (story) {
            try {
              const ft = JSON.parse(story.getAttribute('data-ft')||'{}');
              postId = ft.top_level_post_id || ft.tl_objid || null;
            } catch {}
          }
          if (!postId) {
            const link = document.querySelector('a[href*="permalink"]');
            if (link) {
              const h = link.getAttribute('href');
              const m = h && h.match(/permalink\\/([0-9]+)/) || h.match(/story_fbid=([0-9]+)/);
              if (m) postId = m[1];
            }
          }
          const firstArticle = document.querySelector('article') || document.querySelector('div.story_body_container') || document.body;
          if (firstArticle) {
            text = (firstArticle.innerText || '').substring(0, 140).replace(/\\n/g,' ').trim();
            const authorEl = firstArticle.querySelector('h3, strong, a strong');
            if (authorEl) author = authorEl.innerText.trim().substring(0,40);
          }
          return { postId: postId || ('fallback_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)), text: text.substring(0,120), author };
        })()
      `);
      if (!result || !result.postId) continue;
      const lastSeen = store.lastSeenPosts[group.id];
      if (!lastSeen) {
        store.lastSeenPosts[group.id] = result.postId;
        saveStore(store);
        continue;
      }
      if (result.postId !== lastSeen) {
        store.lastSeenPosts[group.id] = result.postId;
        saveStore(store);
        const notifTitle = `منشور جديد في ${group.name}`;
        const notifBody = result.author ? `${result.author}: ${result.text || 'افتح لرؤية التفاصيل'}` : (result.text || 'منشور جديد - اضغط للفتح');
        const notif = new Notification({ title: notifTitle, body: notifBody.substring(0, 180), silent: false });
        notif.show();
        notif.on('click', () => shell.openExternal(group.url));
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('monitor:newPost', { group, post: result, at: new Date().toISOString() });
        }
      }
      await new Promise(r => setTimeout(r, 1200 + Math.random()*1800));
    } catch (e) {
      console.error('poll group', group.id, e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function startMonitoring() {
  if (isMonitoring) return;
  if (store.monitoredGroups.length === 0) throw new Error('اختر جروب واحد على الأقل');
  isMonitoring = true;
  ensureFbWindow().hide();
  pollGroups();
  const scheduleNext = () => {
    const delay = 150000 + Math.random()*120000;
    monitorInterval = setTimeout(async () => {
      await pollGroups();
      if (isMonitoring) scheduleNext();
    }, delay);
  };
  scheduleNext();
  if (mainWindow) mainWindow.webContents.send('monitor:status', { isMonitoring: true });
  updateTrayMenu();
}

function stopMonitoring() {
  isMonitoring = false;
  if (monitorInterval) clearTimeout(monitorInterval);
  monitorInterval = null;
  if (mainWindow) mainWindow.webContents.send('monitor:status', { isMonitoring: false });
  updateTrayMenu();
}

ipcMain.handle('monitor:manualPoll', async () => {
  await pollGroups();
  return { ok: true };
});
