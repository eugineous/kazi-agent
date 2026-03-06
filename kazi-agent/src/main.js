/**
 * KAZI AGENT v2.0 — Main Process
 * AI Desktop Agent with embedded browser, encrypted auth, persistent memory
 */

const {
  app, BrowserWindow, BrowserView, Tray, Menu,
  ipcMain, globalShortcut, safeStorage, shell, dialog
} = require('electron');
const path  = require('path');
const { spawn } = require('child_process');
const fs    = require('fs');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
let mainWindow, tray, browserView, pythonProcess;
let currentUser     = null;
let conversationMemory = [];
let pythonReady     = false;
let browserVisible  = false;

// ─────────────────────────────────────────────────────────────────────────────
// DATA PATHS  (stored in OS user-data folder, never in the app bundle)
// ─────────────────────────────────────────────────────────────────────────────
const userData      = app.getPath('userData');
const USERS_FILE    = path.join(userData, 'kazi_users.json');
const MEMORY_FILE   = path.join(userData, 'kazi_memory.json');
const SETTINGS_FILE = path.join(userData, 'kazi_settings.json');
const KEYS_FILE     = path.join(userData, 'kazi_keys.enc');
const SESSION_FILE  = path.join(userData, 'kazi_session.json');

function ensureDataDir() {
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD HASHING (PBKDF2 — built-in Node crypto, no extra deps)
// ─────────────────────────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 200000, 64, 'sha512').toString('hex');
}
function newSalt() {
  return crypto.randomBytes(32).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE))
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (_) {}
  return {};
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION PERSISTENCE  (auto-login on relaunch)
// ─────────────────────────────────────────────────────────────────────────────
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE))
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch (_) {}
  return null;
}
function saveSession(user) {
  if (user) fs.writeFileSync(SESSION_FILE, JSON.stringify({ id: user.id, name: user.name, email: user.email }));
  else if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function loadMemory(userId) {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const all = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      return all[userId] || [];
    }
  } catch (_) {}
  return [];
}
function saveMemory(userId, mem) {
  let all = {};
  try { if (fs.existsSync(MEMORY_FILE)) all = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (_) {}
  all[userId] = mem.slice(-200);   // keep last 200 messages
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(all, null, 2));
}
function clearMemory(userId) {
  let all = {};
  try { if (fs.existsSync(MEMORY_FILE)) all = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (_) {}
  all[userId] = [];
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(all, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEY SECURITY  (OS-level encryption via safeStorage)
// ─────────────────────────────────────────────────────────────────────────────
function storeApiKey(userId, apiKey) {
  let keys = {};
  try { if (fs.existsSync(KEYS_FILE)) keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch (_) {}

  if (safeStorage.isEncryptionAvailable()) {
    // OS keychain / DPAPI / libsecret — strongest available
    keys[userId] = safeStorage.encryptString(apiKey).toString('base64');
  } else {
    // Fallback: AES-256-GCM with a machine-derived key
    const machineKey = crypto
      .createHash('sha256')
      .update(app.getPath('userData') + 'kazi-v2-fallback')
      .digest();
    const iv  = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', machineKey, iv);
    const enc = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    keys[userId] = JSON.stringify({
      iv: iv.toString('base64'),
      enc: enc.toString('base64'),
      tag: tag.toString('base64')
    });
  }
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys));
}

function getApiKey(userId) {
  try {
    if (!fs.existsSync(KEYS_FILE)) return null;
    const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (!keys[userId]) return null;

    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(keys[userId], 'base64'));
    } else {
      const machineKey = crypto
        .createHash('sha256')
        .update(app.getPath('userData') + 'kazi-v2-fallback')
        .digest();
      const { iv, enc, tag } = JSON.parse(keys[userId]);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        machineKey,
        Buffer.from(iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return decipher.update(Buffer.from(enc, 'base64')) + decipher.final('utf8');
    }
  } catch (_) { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  alwaysOnTop:        true,
  startWithWindows:   false,
  hotkey:             'CommandOrControl+Shift+K',
  theme:              'dark',
  memoryEnabled:      true,
  maxMemoryMessages:  100
};
function loadSettings(userId) {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const all = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      return Object.assign({}, DEFAULT_SETTINGS, all[userId] || {});
    }
  } catch (_) {}
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings(userId, settings) {
  let all = {};
  try { if (fs.existsSync(SETTINGS_FILE)) all = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) {}
  all[userId] = settings;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WINDOW
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:         440,
    height:        720,
    minWidth:      360,
    minHeight:     500,
    frame:         false,
    transparent:   false,
    alwaysOnTop:   true,
    skipTaskbar:   false,
    resizable:     true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Resize → keep BrowserView in sync
  mainWindow.on('resize', () => {
    if (browserVisible && browserView) resizeBrowserView();
  });

  // Hide instead of close (lives in tray)
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER VIEW  (embedded Chromium panel)
// ─────────────────────────────────────────────────────────────────────────────
function createBrowserView() {
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      true
    }
  });

  browserView.webContents.on('page-title-updated', (_, title) => {
    mainWindow?.webContents.send('browser:title', title);
  });
  browserView.webContents.on('did-navigate', (_, url) => {
    mainWindow?.webContents.send('browser:url', url);
  });
  browserView.webContents.on('did-navigate-in-page', (_, url) => {
    mainWindow?.webContents.send('browser:url', url);
  });
}

function resizeBrowserView() {
  if (!browserView || !mainWindow) return;
  const [w, h] = mainWindow.getSize();
  // Reserve: 40px titlebar + 40px nav + 52px url bar = 132px top
  //          60px input + 28px statusbar = 88px bottom
  browserView.setBounds({ x: 0, y: 132, width: w, height: Math.max(h - 220, 100) });
}

function showBrowserView(url) {
  if (!browserView) createBrowserView();
  mainWindow.setBrowserView(browserView);
  browserView.setAutoResize({ width: true, height: true });
  resizeBrowserView();
  browserVisible = true;

  if (url) {
    const loadUrl = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    browserView.webContents.loadURL(loadUrl);
  }
}

function hideBrowserView() {
  if (mainWindow && browserView) {
    try { mainWindow.removeBrowserView(browserView); } catch (_) {}
  }
  browserVisible = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM TRAY
// ─────────────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  tray = new Tray(iconPath);

  const rebuild = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: currentUser ? `⚡ Kazi — ${currentUser.name}` : '⚡ Kazi Agent',
        enabled: false
      },
      { type: 'separator' },
      { label: 'Show',  click: () => { mainWindow.show(); mainWindow.focus(); } },
      { label: 'Hide',  click: () => mainWindow.hide() },
      { type: 'separator' },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: app.getPath('exe') })
      },
      { type: 'separator' },
      { label: '⚙️ Settings', click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', 'settings'); } },
      { type: 'separator' },
      {
        label: '🚪 Quit', click: () => {
          if (currentUser) saveMemory(currentUser.id, conversationMemory);
          if (pythonProcess) pythonProcess.kill();
          app.exit();
        }
      }
    ]));
  };

  rebuild();
  tray.setToolTip('Kazi Agent — AI Desktop Assistant  (Ctrl+Shift+K)');
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus()));

  // Rebuild menu when user changes
  ipcMain.on('tray:rebuild', rebuild);
}

// ─────────────────────────────────────────────────────────────────────────────
// PYTHON AGENT
// ─────────────────────────────────────────────────────────────────────────────
function startPythonAgent(apiKey) {
  if (pythonProcess) {
    try { pythonProcess.kill(); } catch (_) {}
    pythonProcess = null;
    pythonReady   = false;
  }

  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'screen_agent.py')
    : path.join(__dirname, '../python/screen_agent.py');

  const env = {
    ...process.env,
    GEMINI_API_KEY:     apiKey,
    PYTHONIOENCODING:   'utf-8',
    PYTHONUNBUFFERED:   '1'
  };

  const cmds = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

  function tryNext(i) {
    if (i >= cmds.length) {
      mainWindow?.webContents.send('agent-status', 'error:nopython');
      return;
    }
    const proc = spawn(cmds[i], [scriptPath], { env });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (line === 'Kazi Agent ready!') {
          pythonReady = true;
          mainWindow?.webContents.send('agent-status', 'ready');
        } else {
          // Store AI response in memory
          conversationMemory.push({
            role:      'assistant',
            content:   line,
            timestamp: new Date().toISOString()
          });
          if (currentUser) saveMemory(currentUser.id, conversationMemory);
          mainWindow?.webContents.send('agent-response', line);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const txt = data.toString();
      if (txt.includes('ModuleNotFoundError') || txt.includes('No module named')) {
        mainWindow?.webContents.send('agent-status', 'error:nodeps');
      }
      console.error('[Python]', txt.trim());
    });

    proc.on('error', () => tryNext(i + 1));

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null && currentUser) {
        pythonReady = false;
        mainWindow?.webContents.send('agent-status', 'disconnected');
        // Auto-restart after 4 seconds
        setTimeout(() => {
          if (currentUser) {
            const key = getApiKey(currentUser.id);
            if (key) startPythonAgent(key);
          }
        }, 4000);
      }
    });

    pythonProcess = proc;
  }

  tryNext(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC — AUTH
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('auth:signup', async (_, { name, email, password, apiKey }) => {
  try {
    ensureDataDir();
    const users    = loadUsers();
    const emailKey = email.toLowerCase().trim();

    if (users[emailKey]) return { success: false, error: 'Email already registered' };

    const salt = newSalt();
    const user = {
      id:           crypto.randomUUID(),
      name:         name.trim(),
      email:        emailKey,
      passwordHash: hashPassword(password, salt),
      salt,
      createdAt:    new Date().toISOString(),
      lastLogin:    new Date().toISOString()
    };
    users[emailKey] = user;
    saveUsers(users);

    if (apiKey && apiKey.trim()) storeApiKey(user.id, apiKey.trim());

    currentUser        = { id: user.id, name: user.name, email: emailKey };
    conversationMemory = loadMemory(user.id);
    saveSession(currentUser);
    ipcMain.emit('tray:rebuild');

    if (apiKey && apiKey.trim()) startPythonAgent(apiKey.trim());

    return { success: true, user: currentUser };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('auth:login', async (_, { email, password }) => {
  try {
    const users    = loadUsers();
    const emailKey = email.toLowerCase().trim();
    const user     = users[emailKey];

    if (!user)                                         return { success: false, error: 'No account found with this email' };
    if (hashPassword(password, user.salt) !== user.passwordHash)
                                                       return { success: false, error: 'Incorrect password' };

    user.lastLogin  = new Date().toISOString();
    users[emailKey] = user;
    saveUsers(users);

    currentUser        = { id: user.id, name: user.name, email: emailKey };
    conversationMemory = loadMemory(user.id);
    saveSession(currentUser);
    ipcMain.emit('tray:rebuild');

    const apiKey = getApiKey(user.id);
    if (apiKey) startPythonAgent(apiKey);
    else mainWindow?.webContents.send('agent-status', 'error:nokey');

    return { success: true, user: currentUser };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  if (currentUser) saveMemory(currentUser.id, conversationMemory);
  if (pythonProcess) { try { pythonProcess.kill(); } catch (_) {} pythonProcess = null; }
  currentUser        = null;
  conversationMemory = [];
  pythonReady        = false;
  saveSession(null);
  hideBrowserView();
  ipcMain.emit('tray:rebuild');
  return { success: true };
});

ipcMain.handle('auth:getUser', async () => currentUser);

// ─────────────────────────────────────────────────────────────────────────────
// IPC — BROWSER
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('browser:navigate', async (_, url) => {
  showBrowserView(url);
  return { success: true };
});
ipcMain.handle('browser:hide', async () => {
  hideBrowserView();
  return { success: true };
});
ipcMain.handle('browser:back', async () => {
  if (browserView?.webContents.canGoBack()) browserView.webContents.goBack();
  return { success: true };
});
ipcMain.handle('browser:forward', async () => {
  if (browserView?.webContents.canGoForward()) browserView.webContents.goForward();
  return { success: true };
});
ipcMain.handle('browser:reload', async () => {
  browserView?.webContents.reload();
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — MEMORY
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('memory:get', async () => conversationMemory);
ipcMain.handle('memory:clear', async () => {
  conversationMemory = [];
  if (currentUser) clearMemory(currentUser.id);
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', async () => {
  if (!currentUser) return Object.assign({}, DEFAULT_SETTINGS);
  return loadSettings(currentUser.id);
});
ipcMain.handle('settings:save', async (_, settings) => {
  if (!currentUser) return { success: false };
  saveSettings(currentUser.id, settings);
  if (settings.alwaysOnTop !== undefined) mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
  if (settings.startWithWindows !== undefined)
    app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, path: app.getPath('exe') });
  return { success: true };
});
ipcMain.handle('settings:saveApiKey', async (_, apiKey) => {
  if (!currentUser) return { success: false, error: 'Not signed in' };
  storeApiKey(currentUser.id, apiKey.trim());
  startPythonAgent(apiKey.trim());
  return { success: true };
});
ipcMain.handle('settings:hasApiKey', async () => {
  if (!currentUser) return false;
  return !!getApiKey(currentUser.id);
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — AGENT COMMANDS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.on('send-command', (_, command) => {
  if (!pythonProcess || !pythonReady) {
    mainWindow?.webContents.send('agent-response', '[ERROR] Agent not ready. Check your API key in Settings.');
    return;
  }

  // Build context string from last 5 exchanges
  const recent = conversationMemory.slice(-10);
  const ctxLines = recent.map(m => `${m.role}: ${m.content.substring(0, 120)}`).join('\n');
  const payload  = ctxLines
    ? `[CONTEXT:\n${ctxLines}\n]\nCOMMAND: ${command}`
    : command;

  // Save user message to memory
  conversationMemory.push({ role: 'user', content: command, timestamp: new Date().toISOString() });
  if (currentUser) saveMemory(currentUser.id, conversationMemory);

  pythonProcess.stdin.write(payload + '\n');
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — WINDOW CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.on('window:minimize',  () => mainWindow.hide());
ipcMain.on('window:maximize',  () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window:close',     () => mainWindow.hide());
ipcMain.on('minimize-window',  () => mainWindow.hide()); // legacy compat

ipcMain.handle('app:openExternal', async (_, url) => {
  await shell.openExternal(url);
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  ensureDataDir();
  createWindow();
  createTray();
  createBrowserView();

  // Register global hotkey
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });

  // Auto-restore last session
  const session = loadSession();
  if (session) {
    const users = loadUsers();
    const user  = users[session.email];
    if (user) {
      currentUser        = { id: user.id, name: user.name, email: user.email };
      conversationMemory = loadMemory(user.id);
      // Tell renderer to skip auth screen
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('session:restore', currentUser);
        const apiKey = getApiKey(user.id);
        if (apiKey) startPythonAgent(apiKey);
        else mainWindow.webContents.send('agent-status', 'error:nokey');
      });
    }
  }
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep alive in tray

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (currentUser && conversationMemory.length) saveMemory(currentUser.id, conversationMemory);
  if (pythonProcess) try { pythonProcess.kill(); } catch (_) {}
});

app.on('activate', () => { // macOS dock click
  if (!mainWindow.isVisible()) mainWindow.show();
});
