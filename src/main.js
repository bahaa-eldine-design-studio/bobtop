const { app, BrowserWindow, ipcMain, Notification, shell, session } = require('electron');
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
let fbWindow = null; // hidden FB window for login/scraping
let monitorInterval = null;
let isMonitoring = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    title: 'BobTop - مراقب جروبات التصميم',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: undefined
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- Helpers ----------
function ensureFbWindow() {
  if (fbWindow && !fbWindow.isDestroyed()) return fbWindow;
  fbWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // hidden by default, we show when login needed
    webPreferences: {
      partition: 'persist:bobtop-fb',
      contextIsolation: true,
    }
  });
  // Allow opening external links in default browser
  fbWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  fbWindow.on('close', (e) => {
    // Hide instead of destroy when monitoring? For now allow close but keep reference
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

// Fetch groups automatically - uses hidden fbWindow to scrape m.facebook.com/groups/?seemore
ipcMain.handle('fb:fetchGroups', async () => {
  const login = await checkLoginStatus();
  if (!login.loggedIn) throw new Error('يجب تسجيل الدخول أولاً بالاكونت النضيف');

  const win = ensureFbWindow();
  // Use m.facebook.com for lighter parsing
  const targetUrl = 'https://m.facebook.com/groups/?seemore&soft=bookmarks';

  // If window not loaded, load target
  try {
    win.show(); // show briefly so user sees progress, then hide if monitoring not active
    await win.loadURL(targetUrl);
    // wait for load
    await new Promise(r => setTimeout(r, 4000));

    // Inject scraper: scroll and collect
    const groups = await win.webContents.executeJavaScript(`
      (async () => {
        // Scroll to trigger lazy load
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
            // Normalize href
            if (href.startsWith('/')) href = 'https://www.facebook.com' + href.split('?')[0];
            else href = href.split('?')[0];
            // Filter: must be /groups/<id or name> and not /groups/feed etc
            const m = href.match(/\\/groups\\/([^\\/\\?#]+)/);
            if (!m) continue;
            const id = m[1];
            // Exclude generic paths
            if (['feed','joins','create','discover','bookmarks'].includes(id)) continue;
            // Name from text or aria-label
            let name = (a.textContent || '').trim().replace(/\\s+/g,' ');
            // Try to get better name from parent
            if (!name || name.length < 2 || name.length > 80) {
                const parent = a.closest('div');
                if (parent) {
                    const t = parent.innerText ? parent.innerText.split('\\n')[0].trim() : '';
                    if (t && t.length>2 && t.length<80) name = t;
                }
            }
            if (!name || name.length < 2) name = id;
            // Deduplicate by id
            if (!seen.has(id)) {
                seen.set(id, { id, name: name.substring(0,80), url: 'https://www.facebook.com/groups/' + id });
            } else {
                // Keep longer name
                const cur = seen.get(id);
                if (name.length > cur.name.length && name !== id) cur.name = name.substring(0,80);
            }
          } catch(e){}
        }
        return Array.from(seen.values());
      })()
    `);

    // Also try alternative parsing via m.facebook.com HTML if few results, fallback to desktop groups page
    let finalGroups = groups;
    if (!finalGroups || finalGroups.length < 3) {
      // Try desktop groups page as fallback
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

    // Merge with stored, update store
    // Keep existing monitored selection
    store.groups = finalGroups;
    // Preserve selected ids that still exist
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

// Mock notification test
ipcMain.handle('app:testNotification', async () => {
  const n = new Notification({ title: 'BobTop - اختبار', body: 'منشور جديد في جروب [مصممين جرافيك] - مطلوب مصمم لوجو بميزانية ممتازة', silent: false });
  n.show();
  n.on('click', () => shell.openExternal('https://www.facebook.com'));
  return { ok: true };
});

// Monitoring logic
async function pollGroups() {
  if (!isMonitoring || store.monitoredGroups.length === 0) return;
  const win = ensureFbWindow();
  // Ensure logged in
  const login = await checkLoginStatus();
  if (!login.loggedIn) {
    console.log('[monitor] not logged in, skip');
    return;
  }

  for (const group of store.monitoredGroups) {
    try {
      // Use m.facebook.com group page
      const url = `https://m.facebook.com/groups/${group.id}/`;
      await win.loadURL(url);
      await new Promise(r => setTimeout(r, 2500 + Math.random()*1500)); // human-like delay

      const result = await win.webContents.executeJavaScript(`
        (() => {
          // m.facebook.com posts are in articles or divs with data-ft or story
          const posts = [];
          // Try to get first 3 posts links
          const anchors = Array.from(document.querySelectorAll('a[href*="/groups/"][href*="/permalink/"], a[href*="/story.php"], a[href*="/photo.php"]'));
          // Fallback: any link with story id
          const articles = Array.from(document.querySelectorAll('article, div[data-ft]'));
          let postId = null;
          let text = '';
          let author = '';
          // Try to extract first post text
          const story = document.querySelector('[data-ft]');
          if (story) {
            try {
              const ft = JSON.parse(story.getAttribute('data-ft')||'{}');
              postId = ft.top_level_post_id || ft.tl_objid || null;
            } catch {}
          }
          if (!postId) {
            // try to find permalink
            const link = document.querySelector('a[href*="permalink"]');
            if (link) {
              const h = link.getAttribute('href');
              const m = h && h.match(/permalink\\/([0-9]+)/) || h.match(/story_fbid=([0-9]+)/);
              if (m) postId = m[1];
            }
          }
          // Extract text from first article
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
        // First time seeing this group, just store without notifying to avoid spam on first run
        store.lastSeenPosts[group.id] = result.postId;
        saveStore(store);
        continue;
      }
      if (result.postId !== lastSeen) {
        // New post detected!
        store.lastSeenPosts[group.id] = result.postId;
        saveStore(store);

        const notifTitle = `منشور جديد في ${group.name}`;
        const notifBody = result.author ? `${result.author}: ${result.text || 'افتح لرؤية التفاصيل'}` : (result.text || 'منشور جديد - اضغط للفتح');
        const notif = new Notification({ title: notifTitle, body: notifBody.substring(0, 180), silent: false });
        notif.show();
        notif.on('click', () => {
          shell.openExternal(group.url);
        });

        // Also send to renderer for activity log
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('monitor:newPost', { group, post: result, at: new Date().toISOString() });
        }
      }

      // Random delay between groups to be human-like
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
  // Ensure win exists but hidden
  ensureFbWindow().hide();
  // Immediate poll then interval with randomization 2.5-4.5 min
  pollGroups();
  const scheduleNext = () => {
    const delay = 150000 + Math.random()*120000; // 2.5 to 4.5 min
    monitorInterval = setTimeout(async () => {
      await pollGroups();
      if (isMonitoring) scheduleNext();
    }, delay);
  };
  scheduleNext();
  if (mainWindow) mainWindow.webContents.send('monitor:status', { isMonitoring: true });
}

function stopMonitoring() {
  isMonitoring = false;
  if (monitorInterval) clearTimeout(monitorInterval);
  monitorInterval = null;
  if (mainWindow) mainWindow.webContents.send('monitor:status', { isMonitoring: false });
}

ipcMain.handle('monitor:manualPoll', async () => {
  await pollGroups();
  return { ok: true };
});
