/**
 * KAZI AGENT v3.0 — Main Process
 * Token-based auth: users sign in to kaziagent.com backend.
 * No API keys needed by users. All AI calls proxied through backend.
 */
'use strict';

const {
  app, BrowserWindow, BrowserView, Tray, Menu,
  ipcMain, globalShortcut, safeStorage, shell, dialog, Notification
} = require('electron');
const path   = require('path');
const { spawn } = require('child_process');
const fs     = require('fs');
const crypto = require('crypto');
const http   = require('http');
const url    = require('url');

// ── Auto-updater (electron-updater via GitHub Releases) ───────
let autoUpdater = null;
try {
  const eu = require('electron-updater');
  autoUpdater = eu.autoUpdater;
  autoUpdater.autoDownload    = false;   // ask user first
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;             // silence verbose logs

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', { version: info.version });
    // Also show native notification
    if (Notification.isSupported()) {
      new Notification({
        title: `Kazi Agent ${info.version} available`,
        body:  'Click to download and install the update automatically.',
        icon:  path.join(__dirname, '../assets/icon.png')
      }).show();
    }
  });

  autoUpdater.on('download-progress', (p) => {
    mainWindow?.webContents.send('update:progress', Math.round(p.percent));
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:ready');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'A new version of Kazi Agent has been downloaded.\nRestart to install it now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (e) => {
    console.error('[Updater]', e.message);
  });
} catch (_) {
  // electron-updater not available in dev
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.KAZI_BACKEND_URL || 'https://kazi-backend-stzv.onrender.com';

// ─────────────────────────────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
let mainWindow, pipWindow, tray, browserView, pythonProcess;
let currentUser        = null;
let conversationMemory = [];
let pythonReady        = false;
let browserVisible     = false;
let oauthServer        = null;
let wsClient           = null;

// ─────────────────────────────────────────────────────────────────────────────
// DATA PATHS
// ─────────────────────────────────────────────────────────────────────────────
const userData      = app.getPath('userData');
const JWT_FILE      = path.join(userData, 'kazi_jwt.enc');
const MEMORY_FILE   = path.join(userData, 'kazi_memory.json');
const SETTINGS_FILE = path.join(userData, 'kazi_settings.json');
const SESSION_FILE  = path.join(userData, 'kazi_session.json');
const OAUTH_FILE    = path.join(userData, 'kazi_oauth.json');  // public client IDs only

function ensureDataDir() {
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
  // Write default OAuth client IDs (public — not secrets) so no manual config needed
  const defaultOAuth = {
    github_client_id: '0v23li9rm4KDV249FMs0',
    google_client_id: '503460192245-3bja9ubr7f19rdc6107777f0c4il75u8.apps.googleusercontent.com'
  };
  if (!fs.existsSync(OAUTH_FILE)) {
    fs.writeFileSync(OAUTH_FILE, JSON.stringify(defaultOAuth, null, 2));
  } else {
    try {
      const existing = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8'));
      const merged = Object.assign({}, defaultOAuth, existing); // preserve user overrides
      fs.writeFileSync(OAUTH_FILE, JSON.stringify(merged, null, 2));
    } catch (_) {
      fs.writeFileSync(OAUTH_FILE, JSON.stringify(defaultOAuth, null, 2));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION HISTORY  (separate from conversation memory — stores session list)
// ─────────────────────────────────────────────────────────────────────────────
const SESSION_HISTORY_FILE = path.join(userData.replace(/userData$/, ''), 'kazi_session_history.json');
function loadSessionHistory(userId) {
  try {
    const file = path.join(app.getPath('userData'), 'kazi_session_history.json');
    if (!fs.existsSync(file)) return [];
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (all[userId] || []).slice(-50); // keep last 50 sessions
  } catch (_) { return []; }
}
function saveSessionToHistory(userId, session) {
  try {
    const file = path.join(app.getPath('userData'), 'kazi_session_history.json');
    let all = {};
    if (fs.existsSync(file)) { try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {} }
    if (!all[userId]) all[userId] = [];
    all[userId].unshift(session);
    all[userId] = all[userId].slice(0, 50);
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT STORAGE  (encrypted, same pattern as old API key storage)
// ─────────────────────────────────────────────────────────────────────────────
function storeJwt(userId, jwt) {
  let keys = {};
  try { if (fs.existsSync(JWT_FILE)) keys = JSON.parse(fs.readFileSync(JWT_FILE, 'utf8')); } catch (_) {}
  if (safeStorage.isEncryptionAvailable()) {
    keys[userId] = safeStorage.encryptString(jwt).toString('base64');
  } else {
    const mk  = crypto.createHash('sha256').update(userData + 'kazi-v3-jwt-key').digest();
    const iv  = crypto.randomBytes(12);
    const c   = crypto.createCipheriv('aes-256-gcm', mk, iv);
    const enc = Buffer.concat([c.update(jwt, 'utf8'), c.final()]);
    const tag = c.getAuthTag();
    keys[userId] = JSON.stringify({ iv: iv.toString('base64'), enc: enc.toString('base64'), tag: tag.toString('base64') });
  }
  fs.writeFileSync(JWT_FILE, JSON.stringify(keys));
}

function getJwt(userId) {
  try {
    if (!fs.existsSync(JWT_FILE)) return null;
    const keys = JSON.parse(fs.readFileSync(JWT_FILE, 'utf8'));
    if (!keys[userId]) return null;
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(keys[userId], 'base64'));
    const mk = crypto.createHash('sha256').update(userData + 'kazi-v3-jwt-key').digest();
    const { iv, enc, tag } = JSON.parse(keys[userId]);
    const d = crypto.createDecipheriv('aes-256-gcm', mk, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return d.update(Buffer.from(enc, 'base64')) + d.final('utf8');
  } catch (_) { return null; }
}

function clearJwt(userId) {
  try {
    if (!fs.existsSync(JWT_FILE)) return;
    const keys = JSON.parse(fs.readFileSync(JWT_FILE, 'utf8'));
    delete keys[userId];
    fs.writeFileSync(JWT_FILE, JSON.stringify(keys));
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION  (persists user info for auto-login)
// ─────────────────────────────────────────────────────────────────────────────
function loadSession() {
  try { if (fs.existsSync(SESSION_FILE)) return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch (_) {}
  return null;
}
function saveSession(user) {
  if (user) {
    const { id, name, email, role, plan, tokens_balance, avatarUrl } = user;
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ id, name, email, role, plan, tokens_balance, avatarUrl }));
  } else if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY
// ─────────────────────────────────────────────────────────────────────────────
function loadMemory(userId) {
  try { if (fs.existsSync(MEMORY_FILE)) { const a = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); return a[userId] || []; } } catch (_) {}
  return [];
}
function saveMemory(userId, mem) {
  let a = {}; try { if (fs.existsSync(MEMORY_FILE)) a = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (_) {}
  a[userId] = mem.slice(-200); fs.writeFileSync(MEMORY_FILE, JSON.stringify(a, null, 2));
}
function clearMemory(userId) {
  let a = {}; try { if (fs.existsSync(MEMORY_FILE)) a = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (_) {}
  a[userId] = []; fs.writeFileSync(MEMORY_FILE, JSON.stringify(a, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  alwaysOnTop: false, startWithWindows: false,
  hotkey: 'CommandOrControl+Shift+K', theme: 'dark',
  memoryEnabled: true, maxMemoryMessages: 100
};
function loadSettings(userId) {
  try { if (fs.existsSync(SETTINGS_FILE)) { const a = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); return Object.assign({}, DEFAULT_SETTINGS, a[userId] || {}); } } catch (_) {}
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings(userId, s) {
  let a = {}; try { if (fs.existsSync(SETTINGS_FILE)) a = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) {}
  a[userId] = s; fs.writeFileSync(SETTINGS_FILE, JSON.stringify(a, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND FETCH HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function backendFetch(endpoint, options = {}, jwt = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  return fetch(`${BACKEND_URL}${endpoint}`, { ...options, headers });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WINDOW
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480, height: 760, minWidth: 380, minHeight: 540,
    frame: false, transparent: false, alwaysOnTop: false, skipTaskbar: false,
    resizable: true, maximizable: true, fullscreenable: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), webSecurity: true
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false, titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('resize', () => { if (browserVisible && browserView) resizeBrowserView(); });
  mainWindow.on('maximize',          () => mainWindow.webContents.send('window:state', 'maximized'));
  mainWindow.on('unmaximize',        () => mainWindow.webContents.send('window:state', 'normal'));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window:state', 'fullscreen'));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window:state', 'normal'));
  mainWindow.on('close', (e) => { e.preventDefault(); mainWindow.hide(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// PICTURE-IN-PICTURE
// ─────────────────────────────────────────────────────────────────────────────
function togglePiP() {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.close(); pipWindow = null;
    mainWindow.webContents.send('pip:state', false);
    return;
  }
  const [mx, my] = mainWindow.getPosition();
  const [mw]     = mainWindow.getSize();
  pipWindow = new BrowserWindow({
    width: 340, height: 480, x: mx + mw + 8, y: my,
    frame: false, alwaysOnTop: true, skipTaskbar: false, resizable: true,
    minimizable: false, maximizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    icon: path.join(__dirname, '../assets/icon.png')
  });
  pipWindow.loadFile(path.join(__dirname, 'pip.html'));
  pipWindow.webContents.once('did-finish-load', () => {
    pipWindow?.webContents.send('agent-status', pythonReady ? 'ready' : 'disconnected');
  });
  pipWindow.on('closed', () => { pipWindow = null; mainWindow.webContents.send('pip:state', false); });
  mainWindow.webContents.send('pip:state', true);
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER VIEW
// ─────────────────────────────────────────────────────────────────────────────
function createBrowserView() {
  browserView = new BrowserView({ webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true } });
  browserView.webContents.on('page-title-updated', (_, t) => mainWindow?.webContents.send('browser:title', t));
  browserView.webContents.on('did-navigate',        (_, u) => mainWindow?.webContents.send('browser:url', u));
  browserView.webContents.on('did-navigate-in-page',(_, u) => mainWindow?.webContents.send('browser:url', u));
}
function resizeBrowserView() {
  if (!browserView || !mainWindow) return;
  const [w, h] = mainWindow.getSize();
  browserView.setBounds({ x: 0, y: 120, width: w, height: Math.max(h - 194, 100) });
}
function showBrowserView(targetUrl) {
  if (!browserView) createBrowserView();
  mainWindow.setBrowserView(browserView);
  browserView.setAutoResize({ width: true, height: true });
  resizeBrowserView();
  browserVisible = true;
  if (targetUrl) {
    const loadUrl = /^https?:\/\//i.test(targetUrl) ? targetUrl : 'https://' + targetUrl;
    browserView.webContents.loadURL(loadUrl);
  }
}
function hideBrowserView() {
  if (mainWindow && browserView) try { mainWindow.removeBrowserView(browserView); } catch (_) {}
  browserVisible = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAY
// ─────────────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  tray = new Tray(iconPath);
  const rebuild = () => {
    const planLabel  = currentUser?.plan  ? ` (${currentUser.plan})`          : '';
    const tokLabel   = currentUser?.tokens_balance != null ? ` ⚡${currentUser.tokens_balance}` : '';
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: currentUser ? `⚡ Kazi — ${currentUser.name}${planLabel}${tokLabel}` : '⚡ Kazi Agent', enabled: false },
      { type: 'separator' },
      { label: 'Show', click: () => { mainWindow.show(); mainWindow.focus(); } },
      { label: 'Hide', click: () => mainWindow.hide() },
      { type: 'separator' },
      { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: app.getPath('exe') }) },
      { type: 'separator' },
      { label: '⚙️ Settings', click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', 'settings'); } },
      { label: '🖥️ Picture-in-Picture', click: () => togglePiP() },
      { type: 'separator' },
      { label: '🚪 Quit', click: () => {
          if (currentUser) saveMemory(currentUser.id, conversationMemory);
          if (pythonProcess) try { pythonProcess.kill(); } catch (_) {}
          if (wsClient) try { wsClient.close(); } catch (_) {}
          app.exit();
      }}
    ]));
  };
  rebuild();
  tray.setToolTip('Kazi Agent — AI Desktop Assistant  (Ctrl+Shift+K)');
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus()));
  ipcMain.on('tray:rebuild', rebuild);
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT — process I/O
// ─────────────────────────────────────────────────────────────────────────────
function setupAgentIO(proc, jwt) {
  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('Kazi Agent ready!')) {
        const match = line.match(/Tokens:\s*(\d+)/);
        const bal   = match ? parseInt(match[1]) : null;
        pythonReady = true;
        if (bal != null && currentUser) {
          currentUser.tokens_balance = bal;
          saveSession(currentUser);
        }
        mainWindow?.webContents.send('agent-status', 'ready');
        if (bal != null) mainWindow?.webContents.send('tokens:update', bal);
        pipWindow?.webContents.send('agent-status', 'ready');
        ipcMain.emit('tray:rebuild');
      } else {
        conversationMemory.push({ role: 'assistant', content: line, timestamp: new Date().toISOString() });
        if (currentUser) saveMemory(currentUser.id, conversationMemory);
        mainWindow?.webContents.send('agent-response', line);
        pipWindow?.webContents.send('agent-response', line);
      }
    }
  });
  proc.stderr.on('data', (data) => {
    const txt = data.toString();
    if (txt.includes('ModuleNotFoundError') || txt.includes('No module named'))
      mainWindow?.webContents.send('agent-status', 'error:nodeps');
    console.error('[Agent]', txt.trim());
  });
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null && currentUser) {
      pythonReady = false;
      mainWindow?.webContents.send('agent-status', 'disconnected');
      pipWindow?.webContents.send('agent-status', 'disconnected');
      const j = getJwt(currentUser.id);
      if (j) setTimeout(() => { if (currentUser) startAgent(j); }, 5000);
    }
  });
  pythonProcess = proc;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT — start
// ─────────────────────────────────────────────────────────────────────────────
function startAgent(jwt) {
  if (pythonProcess) { try { pythonProcess.kill(); } catch (_) {} pythonProcess = null; pythonReady = false; }

  const env = {
    ...process.env,
    KAZI_SESSION_TOKEN: jwt,
    KAZI_BACKEND_URL:   BACKEND_URL,
    PYTHONIOENCODING:   'utf-8',
    PYTHONUNBUFFERED:   '1'
  };

  // Try bundled exe first
  const exePath = app.isPackaged
    ? path.join(process.resourcesPath, 'agent', 'screen_agent.exe')
    : path.join(__dirname, '../../dist/screen_agent.exe');

  if (fs.existsSync(exePath)) {
    const proc = spawn(exePath, [], { env });
    proc.on('error', (e) => {
      console.error('[Agent] exe error:', e.message);
      mainWindow?.webContents.send('agent-status', 'error:agent');
    });
    setupAgentIO(proc, jwt);
    return;
  }

  if (app.isPackaged) {
    mainWindow?.webContents.send('agent-status', 'error:noexe');
    return;
  }

  // Dev fallback: use Python directly
  const scriptPath = path.join(__dirname, '../python/screen_agent.py');
  const pyPaths = process.platform === 'win32'
    ? [
        (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python313\\python.exe',
        (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python312\\python.exe',
        (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python311\\python.exe',
        (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python310\\python.exe',
        'C:\\Python313\\python.exe', 'C:\\Python312\\python.exe', 'C:\\Python311\\python.exe',
        'python', 'python3', 'py'
      ]
    : ['python3', 'python'];

  function tryNext(i) {
    if (i >= pyPaths.length) { mainWindow?.webContents.send('agent-status', 'error:nopython'); return; }
    const proc = spawn(pyPaths[i], [scriptPath], { env });
    proc.on('error', () => tryNext(i + 1));
    setupAgentIO(proc, jwt);
  }
  tryNext(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET CLIENT (receives workflow triggers & token updates from backend)
// ─────────────────────────────────────────────────────────────────────────────
function connectWebSocket(jwt) {
  if (wsClient) { try { wsClient.close(); } catch (_) {} wsClient = null; }
  try {
    const WS    = require('ws');
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
    wsClient    = new WS(wsUrl, { headers: { Authorization: `Bearer ${jwt}` } });

    wsClient.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'workflow:trigger' && msg.command) {
          if (pythonReady && pythonProcess) {
            conversationMemory.push({ role: 'user', content: `[Workflow] ${msg.command}`, timestamp: new Date().toISOString() });
            if (currentUser) saveMemory(currentUser.id, conversationMemory);
            mainWindow?.webContents.send('agent-response', `📅 Workflow: ${msg.name || msg.command}`);
            pythonProcess.stdin.write(msg.command + '\n');
          }
        } else if (msg.type === 'tokens:updated') {
          if (currentUser) { currentUser.tokens_balance = msg.balance; saveSession(currentUser); }
          mainWindow?.webContents.send('tokens:update', msg.balance);
          ipcMain.emit('tray:rebuild');
        }
      } catch (_) {}
    });

    wsClient.on('error', () => {});
    wsClient.on('close', () => {
      wsClient = null;
      // Reconnect after 30s if still logged in
      setTimeout(() => {
        if (currentUser) {
          const j = getJwt(currentUser.id);
          if (j) connectWebSocket(j);
        }
      }, 30000);
    });
  } catch (e) {
    console.log('[WS] not available:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OAUTH LOCAL CALLBACK SERVER
// ─────────────────────────────────────────────────────────────────────────────
function startOAuthServer(onCode) {
  return new Promise((resolve, reject) => {
    if (oauthServer) { try { oauthServer.close(); } catch (_) {} }
    oauthServer = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      const code   = parsed.query.code;
      const error  = parsed.query.error;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (code) {
        res.end(`<html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;">
          <h2 style="color:#00d9ff">✓ Authentication successful</h2>
          <p>You can close this tab and return to Kazi Agent.</p>
          <script>setTimeout(()=>window.close(),2000)</script></body></html>`);
        onCode(code, null);
      } else {
        res.end(`<html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;padding:40px;">
          <h2 style="color:#f85149">✗ Authentication failed</h2><p>${error || 'Unknown error'}</p></body></html>`);
        onCode(null, error || 'cancelled');
      }
      oauthServer.close(); oauthServer = null;
    });
    oauthServer.listen(0, '127.0.0.1', () => resolve(oauthServer.address().port));
    oauthServer.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-LOGIN HELPER
// ─────────────────────────────────────────────────────────────────────────────
function onLoginSuccess(data) {
  const jwt = data.jwt || data.token; // backend returns 'token', normalize to 'jwt'
  storeJwt(data.user.id, jwt);
  currentUser = { ...data.user, jwt };
  conversationMemory = loadMemory(data.user.id);
  saveSession(currentUser);
  ipcMain.emit('tray:rebuild');
  startAgent(jwt);
  connectWebSocket(jwt);
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC — AUTH
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('auth:signup', async (_, { name, email, password }) => {
  try {
    ensureDataDir();
    const resp = await backendFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: data.error || 'Signup failed' };
    onLoginSuccess(data);
    return { success: true, user: currentUser };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('auth:login', async (_, { email, password }) => {
  try {
    const resp = await backendFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: data.error || 'Login failed' };
    onLoginSuccess(data);
    return { success: true, user: currentUser };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('auth:logout', async () => {
  if (currentUser) { saveMemory(currentUser.id, conversationMemory); clearJwt(currentUser.id); }
  if (pythonProcess) { try { pythonProcess.kill(); } catch (_) {} pythonProcess = null; }
  if (wsClient)     { try { wsClient.close();      } catch (_) {} wsClient = null; }
  currentUser = null; conversationMemory = []; pythonReady = false;
  saveSession(null); hideBrowserView(); ipcMain.emit('tray:rebuild');
  return { success: true };
});

ipcMain.handle('auth:getUser', async () => currentUser);

// ─────────────────────────────────────────────────────────────────────────────
// IPC — OAUTH
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('oauth:github', async () => {
  try {
    let creds = {};
    try { if (fs.existsSync(OAUTH_FILE)) creds = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')); } catch (_) {}
    const clientId = creds.github_client_id || process.env.GITHUB_CLIENT_ID;
    if (!clientId) return { success: false, error: 'no_client_id', message: 'GitHub OAuth App not configured.' };

    let portRef = null;
    const port = await startOAuthServer(async (code, err) => {
      if (err) { mainWindow?.webContents.send('oauth:result', { provider: 'github', success: false, error: err }); return; }
      try {
        const resp = await backendFetch('/auth/oauth/github', {
          method: 'POST',
          body: JSON.stringify({ code, redirect_uri: `http://127.0.0.1:${portRef}/callback` })
        });
        const data = await resp.json();
        if (!resp.ok || (!data.jwt && !data.token)) {
          mainWindow?.webContents.send('oauth:result', { provider: 'github', success: false, error: data.error || 'OAuth failed' });
          return;
        }
        onLoginSuccess(data);
        mainWindow?.webContents.send('oauth:result', { provider: 'github', success: true, user: currentUser });
      } catch (e) {
        mainWindow?.webContents.send('oauth:result', { provider: 'github', success: false, error: e.message });
      }
    });
    portRef = port;
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}/callback`)}` +
      `&scope=user:email&state=${crypto.randomBytes(16).toString('hex')}`;
    await shell.openExternal(authUrl);
    return { success: true, pending: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('oauth:google', async () => {
  try {
    let creds = {};
    try { if (fs.existsSync(OAUTH_FILE)) creds = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')); } catch (_) {}
    const clientId = creds.google_client_id || process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return { success: false, error: 'no_client_id', message: 'Google OAuth not configured.' };

    let portRef = null;
    const port = await startOAuthServer(async (code, err) => {
      if (err) { mainWindow?.webContents.send('oauth:result', { provider: 'google', success: false, error: err }); return; }
      try {
        const redirectUri = `http://127.0.0.1:${portRef}/callback`;
        const resp = await backendFetch('/auth/oauth/google', {
          method: 'POST',
          body: JSON.stringify({ code, redirect_uri: redirectUri })
        });
        const data = await resp.json();
        if (!resp.ok || (!data.jwt && !data.token)) {
          mainWindow?.webContents.send('oauth:result', { provider: 'google', success: false, error: data.error || 'OAuth failed' });
          return;
        }
        onLoginSuccess(data);
        mainWindow?.webContents.send('oauth:result', { provider: 'google', success: true, user: currentUser });
      } catch (e) {
        mainWindow?.webContents.send('oauth:result', { provider: 'google', success: false, error: e.message });
      }
    });
    portRef = port;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent('openid email profile')}` +
      `&state=${crypto.randomBytes(16).toString('hex')}&access_type=offline`;
    await shell.openExternal(authUrl);
    return { success: true, pending: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('oauth:saveCreds', async (_, creds) => {
  let existing = {};
  try { if (fs.existsSync(OAUTH_FILE)) existing = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')); } catch (_) {}
  fs.writeFileSync(OAUTH_FILE, JSON.stringify(Object.assign(existing, creds), null, 2));
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — BROWSER
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('browser:navigate', async (_, u) => { showBrowserView(u); return { success: true }; });
ipcMain.handle('browser:hide',     async ()     => { hideBrowserView(); return { success: true }; });
ipcMain.handle('browser:back',     async ()     => { if (browserView?.webContents.canGoBack())    browserView.webContents.goBack();    return { success: true }; });
ipcMain.handle('browser:forward',  async ()     => { if (browserView?.webContents.canGoForward()) browserView.webContents.goForward(); return { success: true }; });
ipcMain.handle('browser:reload',   async ()     => { browserView?.webContents.reload(); return { success: true }; });

// ─────────────────────────────────────────────────────────────────────────────
// IPC — MEMORY
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('memory:get',   async () => conversationMemory);
ipcMain.handle('memory:clear', async () => { conversationMemory = []; if (currentUser) clearMemory(currentUser.id); return { success: true }; });
ipcMain.handle('history:get',  async () => currentUser ? loadSessionHistory(currentUser.id) : []);
ipcMain.handle('history:saveSession', async (_, session) => {
  if (currentUser) saveSessionToHistory(currentUser.id, session);
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get',  async ()     => currentUser ? loadSettings(currentUser.id) : Object.assign({}, DEFAULT_SETTINGS));
ipcMain.handle('settings:save', async (_, s) => {
  if (!currentUser) return { success: false };
  saveSettings(currentUser.id, s);
  if (s.alwaysOnTop !== undefined)    mainWindow.setAlwaysOnTop(s.alwaysOnTop);
  if (s.startWithWindows !== undefined) app.setLoginItemSettings({ openAtLogin: s.startWithWindows, path: app.getPath('exe') });
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — AGENT
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.on('send-command', (_, command) => {
  if (!pythonProcess || !pythonReady) {
    mainWindow?.webContents.send('agent-response', '[ERROR] Agent not ready. Please wait…');
    return;
  }
  const recent   = conversationMemory.slice(-10);
  const ctxLines = recent.map(m => `${m.role}: ${m.content.substring(0, 120)}`).join('\n');
  const payload  = ctxLines ? `[CONTEXT:\n${ctxLines}\n]\nCOMMAND: ${command}` : command;
  conversationMemory.push({ role: 'user', content: command, timestamp: new Date().toISOString() });
  if (currentUser) saveMemory(currentUser.id, conversationMemory);
  pythonProcess.stdin.write(payload + '\n');
});

ipcMain.handle('agent:balance', async () => {
  if (!currentUser) return { success: false };
  try {
    const jwt  = getJwt(currentUser.id);
    const resp = await backendFetch('/agent/balance', {}, jwt);
    if (!resp.ok) return { success: false };
    const data = await resp.json();
    currentUser.tokens_balance = data.balance;
    saveSession(currentUser);
    mainWindow?.webContents.send('tokens:update', data.balance);
    ipcMain.emit('tray:rebuild');
    return { success: true, balance: data.balance, plan: data.plan };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — PAYMENTS (M-Pesa)
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('payments:initiate', async (_, { plan, phone }) => {
  if (!currentUser) return { success: false, error: 'Not signed in' };
  try {
    const jwt  = getJwt(currentUser.id);
    const resp = await backendFetch('/payments/mpesa/initiate', {
      method: 'POST', body: JSON.stringify({ plan, phone })
    }, jwt);
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: data.error || 'Payment initiation failed' };
    return { success: true, ...data };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('payments:history', async () => {
  if (!currentUser) return { success: false, payments: [] };
  try {
    const jwt  = getJwt(currentUser.id);
    const resp = await backendFetch('/payments/history', {}, jwt);
    const data = await resp.json();
    return resp.ok ? { success: true, payments: data.payments || [] } : { success: false, payments: [] };
  } catch (e) { return { success: false, payments: [] }; }
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('workflows:list', async () => {
  if (!currentUser) return { success: false, workflows: [] };
  try {
    const jwt  = getJwt(currentUser.id);
    const resp = await backendFetch('/workflows', {}, jwt);
    const data = await resp.json();
    return resp.ok ? { success: true, workflows: data.workflows || [] } : { success: false, workflows: [] };
  } catch (e) { return { success: false, workflows: [] }; }
});

ipcMain.handle('workflows:create', async (_, payload) => {
  if (!currentUser) return { success: false };
  try {
    const jwt  = getJwt(currentUser.id);
    const resp = await backendFetch('/workflows', { method: 'POST', body: JSON.stringify(payload) }, jwt);
    const data = await resp.json();
    return resp.ok ? { success: true, workflow: data.workflow } : { success: false, error: data.error };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('workflows:update', async (_, { id, ...payload }) => {
  if (!currentUser) return { success: false };
  try {
    const jwt  = getJwt(currentUser.id);
    const resp = await backendFetch(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, jwt);
    const data = await resp.json();
    return resp.ok ? { success: true } : { success: false, error: data.error };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('workflows:delete', async (_, id) => {
  if (!currentUser) return { success: false };
  try {
    const jwt  = getJwt(currentUser.id);
    const resp = await backendFetch(`/workflows/${id}`, { method: 'DELETE' }, jwt);
    return { success: resp.ok };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — WINDOW CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.on('window:minimize',    () => mainWindow.minimize());
ipcMain.on('window:maximize',    () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window:close',       () => mainWindow.hide());
ipcMain.on('window:show',        () => { mainWindow.show(); mainWindow.focus(); });
ipcMain.on('window:quit',        () => {
  if (pythonProcess) try { pythonProcess.kill(); } catch (_) {}
  if (wsClient)     try { wsClient.close();      } catch (_) {}
  app.exit();
});
ipcMain.on('window:pip',         () => togglePiP());
ipcMain.on('window:fullscreen',  () => mainWindow.setFullScreen(!mainWindow.isFullScreen()));
ipcMain.on('window:alwaystop',   (_, v) => mainWindow.setAlwaysOnTop(v));
ipcMain.handle('app:openExternal',   async (_, u) => { await shell.openExternal(u); return { success: true }; });
ipcMain.handle('window:isMaximized', async () => mainWindow.isMaximized());

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
// IPC — UPDATE
ipcMain.handle('update:check',   async () => { try { autoUpdater?.checkForUpdates(); } catch(_){} return { success: true }; });
ipcMain.handle('update:download',async () => { try { autoUpdater?.downloadUpdate();  } catch(_){} return { success: true }; });
ipcMain.handle('update:install', async () => { try { autoUpdater?.quitAndInstall();  } catch(_){} return { success: true }; });

app.whenReady().then(async () => {
  ensureDataDir();
  createWindow();
  createTray();
  createBrowserView();

  globalShortcut.register('CommandOrControl+Shift+K', () => {
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });

  // Check for updates 5 seconds after launch (production only)
  if (app.isPackaged && autoUpdater) {
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch(_){} }, 5000);
  }

  const session = loadSession();
  if (session?.id) {
    const jwt = getJwt(session.id);
    if (jwt) {
      try {
        const resp = await backendFetch('/auth/me', {}, jwt);
        if (resp.ok) {
          const data = await resp.json();
          currentUser = { ...data.user, jwt };
          conversationMemory = loadMemory(data.user.id);
          saveSession(currentUser);
          ipcMain.emit('tray:rebuild');
          mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.send('session:restore', currentUser);
            startAgent(jwt);
            connectWebSocket(jwt);
          });
        }
        // If not ok: JWT expired — user will see auth screen
      } catch (_) {
        // Offline: restore UI from cache, agent won't start
        currentUser = session;
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.webContents.send('session:restore', session);
          mainWindow.webContents.send('agent-status', 'error:offline');
        });
      }
    }
  }
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (currentUser && conversationMemory.length) saveMemory(currentUser.id, conversationMemory);
  if (pythonProcess) try { pythonProcess.kill(); } catch (_) {}
  if (wsClient)     try { wsClient.close();      } catch (_) {}
  if (oauthServer)  try { oauthServer.close();   } catch (_) {}
});
app.on('activate', () => { if (!mainWindow.isVisible()) mainWindow.show(); });
