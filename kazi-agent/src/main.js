/**
 * KAZI AGENT v2.1 — Main Process
 * AI Desktop Agent: embedded browser, encrypted auth, persistent memory,
 * OAuth (GitHub / Google), picture-in-picture, full computer control
 */

const {
  app, BrowserWindow, BrowserView, Tray, Menu,
  ipcMain, globalShortcut, safeStorage, shell, dialog, protocol
} = require('electron');
const path   = require('path');
const { spawn } = require('child_process');
const fs     = require('fs');
const crypto = require('crypto');
const http   = require('http');
const url    = require('url');

// ─────────────────────────────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
let mainWindow, pipWindow, tray, browserView, pythonProcess;
let currentUser        = null;
let conversationMemory = [];
let pythonReady        = false;
let browserVisible     = false;
let oauthServer        = null;   // temporary local HTTP server for OAuth callbacks

// ─────────────────────────────────────────────────────────────────────────────
// DATA PATHS
// ─────────────────────────────────────────────────────────────────────────────
const userData      = app.getPath('userData');
const USERS_FILE    = path.join(userData, 'kazi_users.json');
const MEMORY_FILE   = path.join(userData, 'kazi_memory.json');
const SETTINGS_FILE = path.join(userData, 'kazi_settings.json');
const KEYS_FILE     = path.join(userData, 'kazi_keys.enc');
const SESSION_FILE  = path.join(userData, 'kazi_session.json');
const OAUTH_FILE    = path.join(userData, 'kazi_oauth.json');

function ensureDataDir() {
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD HASHING
// ─────────────────────────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 200000, 64, 'sha512').toString('hex');
}
function newSalt() { return crypto.randomBytes(32).toString('hex'); }

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function loadUsers() {
  try { if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (_) {}
  return {};
}
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }

// ─────────────────────────────────────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────────────────────────────────────
function loadSession() {
  try { if (fs.existsSync(SESSION_FILE)) return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch (_) {}
  return null;
}
function saveSession(user) {
  if (user) fs.writeFileSync(SESSION_FILE, JSON.stringify({ id: user.id, name: user.name, email: user.email }));
  else if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
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
// API KEY SECURITY
// ─────────────────────────────────────────────────────────────────────────────
function storeApiKey(userId, apiKey) {
  let keys = {}; try { if (fs.existsSync(KEYS_FILE)) keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch (_) {}
  if (safeStorage.isEncryptionAvailable()) {
    keys[userId] = safeStorage.encryptString(apiKey).toString('base64');
  } else {
    const mk  = crypto.createHash('sha256').update(app.getPath('userData') + 'kazi-v2-fallback').digest();
    const iv  = crypto.randomBytes(12);
    const c   = crypto.createCipheriv('aes-256-gcm', mk, iv);
    const enc = Buffer.concat([c.update(apiKey, 'utf8'), c.final()]);
    const tag = c.getAuthTag();
    keys[userId] = JSON.stringify({ iv: iv.toString('base64'), enc: enc.toString('base64'), tag: tag.toString('base64') });
  }
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys));
}
function getApiKey(userId) {
  try {
    if (!fs.existsSync(KEYS_FILE)) return null;
    const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (!keys[userId]) return null;
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(keys[userId], 'base64'));
    const mk = crypto.createHash('sha256').update(app.getPath('userData') + 'kazi-v2-fallback').digest();
    const { iv, enc, tag } = JSON.parse(keys[userId]);
    const d = crypto.createDecipheriv('aes-256-gcm', mk, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return d.update(Buffer.from(enc, 'base64')) + d.final('utf8');
  } catch (_) { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = { alwaysOnTop: false, startWithWindows: false, hotkey: 'CommandOrControl+Shift+K', theme: 'dark', memoryEnabled: true, maxMemoryMessages: 100 };
function loadSettings(userId) {
  try { if (fs.existsSync(SETTINGS_FILE)) { const a = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); return Object.assign({}, DEFAULT_SETTINGS, a[userId] || {}); } } catch (_) {}
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings(userId, s) {
  let a = {}; try { if (fs.existsSync(SETTINGS_FILE)) a = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) {}
  a[userId] = s; fs.writeFileSync(SETTINGS_FILE, JSON.stringify(a, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WINDOW  — proper desktop window with system frame-like controls
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:         480,
    height:        760,
    minWidth:      380,
    minHeight:     540,
    frame:         false,          // custom titlebar
    transparent:   false,
    alwaysOnTop:   false,
    skipTaskbar:   false,
    resizable:     true,
    maximizable:   true,
    fullscreenable: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    titleBarStyle: 'hidden',       // use custom titlebar on all platforms
    trafficLightPosition: { x: 12, y: 12 }  // macOS
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('resize', () => { if (browserVisible && browserView) resizeBrowserView(); });
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:state', 'maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:state', 'normal'));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window:state', 'fullscreen'));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window:state', 'normal'));

  // Hide to tray on close button (user can truly quit from tray)
  mainWindow.on('close', (e) => { e.preventDefault(); mainWindow.hide(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// PICTURE-IN-PICTURE WINDOW
// ─────────────────────────────────────────────────────────────────────────────
function togglePiP() {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.close();
    pipWindow = null;
    mainWindow.webContents.send('pip:state', false);
    return;
  }
  const [mx, my] = mainWindow.getPosition();
  const [mw]     = mainWindow.getSize();
  pipWindow = new BrowserWindow({
    width:         340,
    height:        480,
    x:             mx + mw + 8,
    y:             my,
    frame:         false,
    alwaysOnTop:   true,
    skipTaskbar:   false,
    resizable:     true,
    minimizable:   false,
    maximizable:   false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });
  pipWindow.loadFile(path.join(__dirname, 'pip.html'));
  // When PiP is ready, sync agent status so it shows correctly
  pipWindow.webContents.once('did-finish-load', () => {
    pipWindow?.webContents.send('agent-status', pythonReady ? 'ready' : 'disconnected');
  });
  pipWindow.on('closed', () => {
    pipWindow = null;
    mainWindow.webContents.send('pip:state', false);
  });
  mainWindow.webContents.send('pip:state', true);
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER VIEW
// ─────────────────────────────────────────────────────────────────────────────
function createBrowserView() {
  browserView = new BrowserView({
    webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true }
  });
  browserView.webContents.on('page-title-updated', (_, t) => mainWindow?.webContents.send('browser:title', t));
  browserView.webContents.on('did-navigate', (_, u) => mainWindow?.webContents.send('browser:url', u));
  browserView.webContents.on('did-navigate-in-page', (_, u) => mainWindow?.webContents.send('browser:url', u));
}

function resizeBrowserView() {
  if (!browserView || !mainWindow) return;
  const [w, h] = mainWindow.getSize();
  // 42 titlebar + 38 nav + 40 url bar = 120; 48 input + 26 status = 74
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
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: currentUser ? `⚡ Kazi — ${currentUser.name}` : '⚡ Kazi Agent', enabled: false },
      { type: 'separator' },
      { label: 'Show',  click: () => { mainWindow.show(); mainWindow.focus(); } },
      { label: 'Hide',  click: () => mainWindow.hide() },
      { type: 'separator' },
      {
        label: 'Start with Windows', type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: app.getPath('exe') })
      },
      { type: 'separator' },
      { label: '⚙️ Settings', click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', 'settings'); } },
      { label: '🖥️ Picture-in-Picture', click: () => togglePiP() },
      { type: 'separator' },
      { label: '🚪 Quit', click: () => {
        if (currentUser) saveMemory(currentUser.id, conversationMemory);
        if (pythonProcess) pythonProcess.kill();
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
// PYTHON AGENT
// ─────────────────────────────────────────────────────────────────────────────
function startPythonAgent(apiKey) {
  if (pythonProcess) { try { pythonProcess.kill(); } catch (_) {} pythonProcess = null; pythonReady = false; }

  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'screen_agent.py')
    : path.join(__dirname, '../python/screen_agent.py');

  const env = { ...process.env, GEMINI_API_KEY: apiKey, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };

  // Search Python in PATH and common Windows install locations
  const pySearchPaths = process.platform === 'win32'
    ? [
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python312\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python311\\python.exe',
        process.env.LOCALAPPDATA + '\\Programs\\Python\\Python310\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
        'python', 'python3', 'py'
      ]
    : ['python3', 'python'];

  function tryNext(i) {
    if (i >= pySearchPaths.length) { mainWindow?.webContents.send('agent-status', 'error:nopython'); return; }
    const cmd  = pySearchPaths[i];
    const proc = spawn(cmd, [scriptPath], { env });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (line === 'Kazi Agent ready!') {
          pythonReady = true;
          mainWindow?.webContents.send('agent-status', 'ready');
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
      console.error('[Python]', txt.trim());
    });
    proc.on('error', () => tryNext(i + 1));
    proc.on('exit', (code) => {
      if (code !== 0 && code !== null && currentUser) {
        pythonReady = false;
        mainWindow?.webContents.send('agent-status', 'disconnected');
        pipWindow?.webContents.send('agent-status', 'disconnected');
        setTimeout(() => { if (currentUser) { const k = getApiKey(currentUser.id); if (k) startPythonAgent(k); } }, 4000);
      }
    });
    pythonProcess = proc;
  }
  tryNext(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// OAUTH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Start a temporary local HTTP server to catch OAuth redirect callbacks
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
        res.end(`<html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;padding:40px;"><h2 style="color:#f85149">✗ Authentication failed</h2><p>${error || 'Unknown error'}</p></body></html>`);
        onCode(null, error || 'cancelled');
      }
      oauthServer.close();
      oauthServer = null;
    });
    oauthServer.listen(0, '127.0.0.1', () => {
      const port = oauthServer.address().port;
      resolve(port);
    });
    oauthServer.on('error', reject);
  });
}

// GitHub OAuth flow
ipcMain.handle('oauth:github', async () => {
  try {
    // Load stored client credentials (user must supply their own GitHub OAuth App)
    let oauthCreds = {};
    try { if (fs.existsSync(OAUTH_FILE)) oauthCreds = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')); } catch (_) {}
    const clientId = oauthCreds.github_client_id || process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
      return { success: false, error: 'no_client_id', message: 'GitHub OAuth App client ID not configured.' };
    }

    const port = await startOAuthServer(async (code, err) => {
      if (err) { mainWindow?.webContents.send('oauth:result', { provider: 'github', success: false, error: err }); return; }
      // Exchange code for token
      try {
        const clientSecret = oauthCreds.github_client_secret || process.env.GITHUB_CLIENT_SECRET;
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: `http://127.0.0.1:${port}/callback` })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          mainWindow?.webContents.send('oauth:result', { provider: 'github', success: false, error: tokenData.error_description || 'Token exchange failed' });
          return;
        }
        // Get user info
        const userRes  = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const ghUser   = await userRes.json();
        const emailRes = await fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const emails   = await emailRes.json();
        const primary  = (Array.isArray(emails) ? emails.find(e => e.primary) : null) || { email: `${ghUser.login}@users.noreply.github.com` };

        // Create or update local account
        const users    = loadUsers();
        const emailKey = primary.email.toLowerCase();
        let user       = users[emailKey];
        if (!user) {
          user = {
            id:           crypto.randomUUID(),
            name:         ghUser.name || ghUser.login,
            email:        emailKey,
            passwordHash: null,   // OAuth user — no password
            salt:         null,
            provider:     'github',
            providerId:   String(ghUser.id),
            avatarUrl:    ghUser.avatar_url,
            createdAt:    new Date().toISOString(),
            lastLogin:    new Date().toISOString()
          };
          users[emailKey] = user;
        } else {
          user.lastLogin = new Date().toISOString();
          user.avatarUrl = ghUser.avatar_url;
          users[emailKey] = user;
        }
        saveUsers(users);
        currentUser = { id: user.id, name: user.name, email: emailKey, avatarUrl: user.avatarUrl };
        conversationMemory = loadMemory(user.id);
        saveSession(currentUser);
        ipcMain.emit('tray:rebuild');
        const apiKey = getApiKey(user.id);
        if (apiKey) startPythonAgent(apiKey);
        mainWindow?.webContents.send('oauth:result', { provider: 'github', success: true, user: currentUser });
      } catch (e) {
        mainWindow?.webContents.send('oauth:result', { provider: 'github', success: false, error: e.message });
      }
    });

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}/callback`)}&scope=user:email&state=${crypto.randomBytes(16).toString('hex')}`;
    await shell.openExternal(authUrl);
    return { success: true, pending: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Google OAuth flow
ipcMain.handle('oauth:google', async () => {
  try {
    let oauthCreds = {};
    try { if (fs.existsSync(OAUTH_FILE)) oauthCreds = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')); } catch (_) {}
    const clientId     = oauthCreds.google_client_id     || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = oauthCreds.google_client_secret || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId) {
      return { success: false, error: 'no_client_id', message: 'Google OAuth client ID not configured.' };
    }

    const port = await startOAuthServer(async (code, err) => {
      if (err) { mainWindow?.webContents.send('oauth:result', { provider: 'google', success: false, error: err }); return; }
      try {
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          mainWindow?.webContents.send('oauth:result', { provider: 'google', success: false, error: tokenData.error_description || 'Token exchange failed' });
          return;
        }
        const userRes  = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const gUser    = await userRes.json();
        const users    = loadUsers();
        const emailKey = gUser.email.toLowerCase();
        let user       = users[emailKey];
        if (!user) {
          user = {
            id:           crypto.randomUUID(),
            name:         gUser.name,
            email:        emailKey,
            passwordHash: null,
            salt:         null,
            provider:     'google',
            providerId:   gUser.id,
            avatarUrl:    gUser.picture,
            createdAt:    new Date().toISOString(),
            lastLogin:    new Date().toISOString()
          };
          users[emailKey] = user;
        } else {
          user.lastLogin = new Date().toISOString();
          user.avatarUrl = gUser.picture;
          users[emailKey] = user;
        }
        saveUsers(users);
        currentUser = { id: user.id, name: user.name, email: emailKey, avatarUrl: user.avatarUrl };
        conversationMemory = loadMemory(user.id);
        saveSession(currentUser);
        ipcMain.emit('tray:rebuild');
        const apiKey = getApiKey(user.id);
        if (apiKey) startPythonAgent(apiKey);
        mainWindow?.webContents.send('oauth:result', { provider: 'google', success: true, user: currentUser });
      } catch (e) {
        mainWindow?.webContents.send('oauth:result', { provider: 'google', success: false, error: e.message });
      }
    });

    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent('openid email profile')}` +
      `&state=${crypto.randomBytes(16).toString('hex')}&access_type=offline`;
    await shell.openExternal(authUrl);
    return { success: true, pending: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Save OAuth credentials (GitHub/Google client IDs & secrets)
ipcMain.handle('oauth:saveCreds', async (_, creds) => {
  let existing = {};
  try { if (fs.existsSync(OAUTH_FILE)) existing = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8')); } catch (_) {}
  const merged = Object.assign(existing, creds);
  fs.writeFileSync(OAUTH_FILE, JSON.stringify(merged, null, 2));
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — AUTH (email/password)
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('auth:signup', async (_, { name, email, password, apiKey }) => {
  try {
    ensureDataDir();
    const users = loadUsers(); const emailKey = email.toLowerCase().trim();
    if (users[emailKey]) return { success: false, error: 'Email already registered' };
    const salt = newSalt();
    const user = { id: crypto.randomUUID(), name: name.trim(), email: emailKey, passwordHash: hashPassword(password, salt), salt, provider: 'email', createdAt: new Date().toISOString(), lastLogin: new Date().toISOString() };
    users[emailKey] = user; saveUsers(users);
    if (apiKey?.trim()) storeApiKey(user.id, apiKey.trim());
    currentUser = { id: user.id, name: user.name, email: emailKey };
    conversationMemory = loadMemory(user.id);
    saveSession(currentUser); ipcMain.emit('tray:rebuild');
    if (apiKey?.trim()) startPythonAgent(apiKey.trim());
    return { success: true, user: currentUser };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('auth:login', async (_, { email, password }) => {
  try {
    const users = loadUsers(); const emailKey = email.toLowerCase().trim(); const user = users[emailKey];
    if (!user) return { success: false, error: 'No account found with this email' };
    if (user.provider !== 'email' || !user.passwordHash) return { success: false, error: `This account uses ${user.provider || 'social'} login` };
    if (hashPassword(password, user.salt) !== user.passwordHash) return { success: false, error: 'Incorrect password' };
    user.lastLogin = new Date().toISOString(); users[emailKey] = user; saveUsers(users);
    currentUser = { id: user.id, name: user.name, email: emailKey };
    conversationMemory = loadMemory(user.id); saveSession(currentUser); ipcMain.emit('tray:rebuild');
    const apiKey = getApiKey(user.id);
    if (apiKey) startPythonAgent(apiKey); else mainWindow?.webContents.send('agent-status', 'error:nokey');
    return { success: true, user: currentUser };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('auth:logout', async () => {
  if (currentUser) saveMemory(currentUser.id, conversationMemory);
  if (pythonProcess) { try { pythonProcess.kill(); } catch (_) {} pythonProcess = null; }
  currentUser = null; conversationMemory = []; pythonReady = false;
  saveSession(null); hideBrowserView(); ipcMain.emit('tray:rebuild');
  return { success: true };
});

ipcMain.handle('auth:getUser', async () => currentUser);

// ─────────────────────────────────────────────────────────────────────────────
// IPC — BROWSER
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('browser:navigate', async (_, u) => { showBrowserView(u); return { success: true }; });
ipcMain.handle('browser:hide',     async ()     => { hideBrowserView(); return { success: true }; });
ipcMain.handle('browser:back',     async ()     => { if (browserView?.webContents.canGoBack()) browserView.webContents.goBack(); return { success: true }; });
ipcMain.handle('browser:forward',  async ()     => { if (browserView?.webContents.canGoForward()) browserView.webContents.goForward(); return { success: true }; });
ipcMain.handle('browser:reload',   async ()     => { browserView?.webContents.reload(); return { success: true }; });

// ─────────────────────────────────────────────────────────────────────────────
// IPC — MEMORY
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('memory:get',   async () => conversationMemory);
ipcMain.handle('memory:clear', async () => { conversationMemory = []; if (currentUser) clearMemory(currentUser.id); return { success: true }; });

// ─────────────────────────────────────────────────────────────────────────────
// IPC — SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get',       async ()      => currentUser ? loadSettings(currentUser.id) : Object.assign({}, DEFAULT_SETTINGS));
ipcMain.handle('settings:save',      async (_, s)  => {
  if (!currentUser) return { success: false };
  saveSettings(currentUser.id, s);
  if (s.alwaysOnTop !== undefined) mainWindow.setAlwaysOnTop(s.alwaysOnTop);
  if (s.startWithWindows !== undefined) app.setLoginItemSettings({ openAtLogin: s.startWithWindows, path: app.getPath('exe') });
  return { success: true };
});
ipcMain.handle('settings:saveApiKey', async (_, k) => {
  if (!currentUser) return { success: false, error: 'Not signed in' };
  storeApiKey(currentUser.id, k.trim()); startPythonAgent(k.trim()); return { success: true };
});
ipcMain.handle('settings:hasApiKey', async () => currentUser ? !!getApiKey(currentUser.id) : false);

// ─────────────────────────────────────────────────────────────────────────────
// IPC — AGENT
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.on('send-command', (_, command) => {
  if (!pythonProcess || !pythonReady) {
    mainWindow?.webContents.send('agent-response', '[ERROR] Agent not ready. Check your API key in Settings.');
    return;
  }
  const recent   = conversationMemory.slice(-10);
  const ctxLines = recent.map(m => `${m.role}: ${m.content.substring(0, 120)}`).join('\n');
  const payload  = ctxLines ? `[CONTEXT:\n${ctxLines}\n]\nCOMMAND: ${command}` : command;
  conversationMemory.push({ role: 'user', content: command, timestamp: new Date().toISOString() });
  if (currentUser) saveMemory(currentUser.id, conversationMemory);
  pythonProcess.stdin.write(payload + '\n');
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC — WINDOW CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.on('window:minimize',    () => mainWindow.minimize());        // true minimize to taskbar
ipcMain.on('window:maximize',    () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window:close',       () => mainWindow.hide());            // hide to tray
ipcMain.on('window:show',        () => { mainWindow.show(); mainWindow.focus(); });
ipcMain.on('window:quit',        () => { if (pythonProcess) try { pythonProcess.kill(); } catch (_) {} app.exit(); });
ipcMain.on('window:pip',         () => togglePiP());
ipcMain.on('window:fullscreen',  () => mainWindow.setFullScreen(!mainWindow.isFullScreen()));
ipcMain.on('window:alwaystop',   (_, v) => mainWindow.setAlwaysOnTop(v));
ipcMain.handle('app:openExternal', async (_, u) => { await shell.openExternal(u); return { success: true }; });
ipcMain.handle('window:isMaximized', async () => mainWindow.isMaximized());

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  ensureDataDir();
  createWindow();
  createTray();
  createBrowserView();

  globalShortcut.register('CommandOrControl+Shift+K', () => {
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });

  const session = loadSession();
  if (session) {
    const users = loadUsers(); const user = users[session.email];
    if (user) {
      currentUser = { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
      conversationMemory = loadMemory(user.id);
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('session:restore', currentUser);
        const apiKey = getApiKey(user.id);
        if (apiKey) startPythonAgent(apiKey);
        else mainWindow.webContents.send('agent-status', 'error:nokey');
      });
    }
  }
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (currentUser && conversationMemory.length) saveMemory(currentUser.id, conversationMemory);
  if (pythonProcess) try { pythonProcess.kill(); } catch (_) {}
  if (oauthServer) try { oauthServer.close(); } catch (_) {}
});
app.on('activate', () => { if (!mainWindow.isVisible()) mainWindow.show(); });
