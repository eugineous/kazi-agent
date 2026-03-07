/**
 * KAZI AGENT v2.1 — Renderer Process
 * Handles all UI logic: auth, OAuth, chat, browser, memory, settings, window controls
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let currentUser   = null;
let agentReady    = false;
let browserActive = false;
let dropdownOpen  = false;
let isMaximized   = false;
let pipActive     = false;
let aotActive     = false;

// ─────────────────────────────────────────────────────────────────────────────
// DOM HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');

function toast(msg, type = 'info', duration = 2800) {
  const map = { success: 'ok', error: 'err', info: 'inf' };
  const t = document.createElement('div');
  t.className = `toast ${map[type] || 'inf'}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function setStatus(text, state = 'ready') {
  const dot  = $('#status-dot');
  const span = $('#status-text');
  if (span) span.textContent = text;
  if (dot) {
    dot.className = 'st-dot';
    if (state === 'loading') dot.classList.add('load');
    if (state === 'warning') dot.classList.add('warn');
    if (state === 'error')   dot.classList.add('err');
  }
}

function updateMemoryCount(n) {
  const el = $('#mem-count');
  if (el) el.textContent = `${n} memor${n === 1 ? 'y' : 'ies'}`;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// Update maximize ↔ restore icon
function updateMaxIcon(maximized) {
  const icon = $('#max-icon');
  if (!icon) return;
  isMaximized = maximized;
  if (maximized) {
    // Restore icon: two overlapping squares
    icon.innerHTML = `
      <rect x="2" y="0" width="8" height="8" rx="0" fill="none" stroke="currentColor" stroke-width="1"/>
      <rect x="0" y="2" width="8" height="8" rx="0" fill="none" stroke="currentColor" stroke-width="1"/>`;
  } else {
    // Maximize icon: single square
    icon.innerHTML = `<rect x="0.5" y="0.5" width="9" height="9" rx="0" fill="none" stroke="currentColor" stroke-width="1"/>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN SWITCHING
// ─────────────────────────────────────────────────────────────────────────────
function showAuthScreen() {
  show($('#screen-auth'));
  hide($('#screen-app'));
  currentUser = null;
  agentReady  = false;
}

function showAppScreen(user) {
  currentUser = user;
  hide($('#screen-auth'));
  show($('#screen-app'));

  const name     = user.name  || 'User';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const firstName = name.split(' ')[0];

  // Titlebar user chip
  const tbAv = $('#tb-avatar');
  if (tbAv) {
    if (user.avatarUrl) {
      tbAv.innerHTML = `<img src="${user.avatarUrl}" alt="${firstName}">`;
    } else {
      tbAv.innerHTML   = '';
      tbAv.textContent = initials;
    }
  }
  const tbUser = $('#tb-username');
  if (tbUser) tbUser.textContent = firstName;

  // Dropdown
  const ddName  = $('#dd-name');
  const ddEmail = $('#dd-email');
  if (ddName)  ddName.textContent  = name;
  if (ddEmail) ddEmail.textContent = user.email || '—';

  // Settings profile card
  const profAv = $('#profile-avatar');
  if (profAv) {
    if (user.avatarUrl) {
      profAv.innerHTML = `<img src="${user.avatarUrl}" alt="${firstName}">`;
    } else {
      profAv.innerHTML   = '';
      profAv.textContent = initials;
    }
  }
  const profName  = $('#profile-name');
  const profEmail = $('#profile-email');
  if (profName)  profName.textContent  = name;
  if (profEmail) profEmail.textContent = user.email || '—';

  // Provider badge
  const badge = $('#provider-badge');
  if (badge) {
    const p   = user.provider || 'email';
    const ico = { github: '🐙', google: '🔵', email: '📧' };
    badge.textContent = `${ico[p] || '📧'} ${p}`;
  }

  loadSettingsUI();
  loadMemoryUI();
  initModelSelector();
  startNewSession();
  setStatus('Agent starting…', 'loading');
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — TABS
// ─────────────────────────────────────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $(`#form-${tab.dataset.tab}`).classList.add('active');
    clearAuthErrors();
  });
});

function clearAuthErrors() {
  const le = $('#login-error');  if (le)  le.textContent  = '';
  const se = $('#signup-error'); if (se)  se.textContent = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// OAUTH — async result listener (main process sends result after browser redirect)
// ─────────────────────────────────────────────────────────────────────────────
window.kazi.oauth.onResult((data) => {
  // Re-enable all social buttons
  ['btn-github-login', 'btn-google-login', 'btn-github-signup', 'btn-google-signup'].forEach(id => {
    const btn = $(`#${id}`);
    if (!btn) return;
    btn.disabled = false;
    if (btn._origHTML) btn.innerHTML = btn._origHTML;
  });

  if (data.success) {
    showAppScreen(data.user);
    toast(`Welcome, ${(data.user.name || 'there').split(' ')[0]}! ⚡`, 'success');
  } else {
    const errEl = document.querySelector('.auth-form.active .auth-err');
    if (errEl) errEl.textContent = data.error || 'Sign-in failed.';
    toast(data.error || 'OAuth sign-in failed', 'error');
  }
});

async function handleOAuthBtn(provider, btn) {
  // Save original HTML (SVG + text) and show loading state
  btn._origHTML = btn.innerHTML;
  btn.disabled  = true;
  btn.textContent = 'Opening browser…';

  try {
    const result = await window.kazi.oauth[provider]();
    // result.pending = true means we're waiting for the redirect → oauth:result event
    if (result && !result.pending) {
      // Immediate response (usually an error — e.g. no client_id configured)
      btn.disabled = false;
      btn.innerHTML = btn._origHTML;
      const errEl = document.querySelector('.auth-form.active .auth-err');
      const msg = result.message || result.error || 'OAuth is not configured. Add client credentials in Settings.';
      if (errEl) errEl.textContent = msg;
      toast(msg, 'error', 4000);
    }
    // If pending: wait for oauth:result event (handled above)
  } catch (e) {
    btn.disabled  = false;
    btn.innerHTML = btn._origHTML;
    const errEl = document.querySelector('.auth-form.active .auth-err');
    if (errEl) errEl.textContent = 'Error: ' + e.message;
    toast('OAuth error: ' + e.message, 'error');
  }
}

$('#btn-github-login').addEventListener('click',  () => handleOAuthBtn('github', $('#btn-github-login')));
$('#btn-google-login').addEventListener('click',  () => handleOAuthBtn('google', $('#btn-google-login')));
$('#btn-github-signup').addEventListener('click', () => handleOAuthBtn('github', $('#btn-github-signup')));
$('#btn-google-signup').addEventListener('click', () => handleOAuthBtn('google', $('#btn-google-signup')));

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — LOGIN (email/password)
// ─────────────────────────────────────────────────────────────────────────────
$('#btn-login').addEventListener('click', async () => {
  const email    = $('#login-email').value.trim();
  const password = $('#login-password').value;

  if (!email || !password) {
    $('#login-error').textContent = 'Please fill in all fields.';
    return;
  }

  $('#btn-login').disabled    = true;
  $('#btn-login').textContent = 'Signing in…';

  const result = await window.kazi.auth.login({ email, password });

  $('#btn-login').disabled    = false;
  $('#btn-login').textContent = 'Sign In →';

  if (result.success) {
    showAppScreen(result.user);
    toast(`Welcome back, ${(result.user.name || '').split(' ')[0]}! ⚡`, 'success');
  } else {
    $('#login-error').textContent = result.error || 'Login failed.';
  }
});

$('#form-login').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-login').click(); });

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — SIGNUP (email/password)
// ─────────────────────────────────────────────────────────────────────────────
$('#btn-signup').addEventListener('click', async () => {
  const name     = $('#signup-name').value.trim();
  const email    = $('#signup-email').value.trim();
  const password = $('#signup-password').value;

  if (!name || !email || !password) {
    $('#signup-error').textContent = 'Name, email and password are required.';
    return;
  }
  if (password.length < 6) {
    $('#signup-error').textContent = 'Password must be at least 6 characters.';
    return;
  }

  $('#btn-signup').disabled    = true;
  $('#btn-signup').textContent = 'Creating account…';

  const result = await window.kazi.auth.signup({ name, email, password });

  $('#btn-signup').disabled    = false;
  $('#btn-signup').textContent = 'Create Account →';

  if (result.success) {
    showAppScreen(result.user);
    toast(`Account created! Welcome, ${(result.user.name || '').split(' ')[0]}! 🎉`, 'success');
  } else {
    $('#signup-error').textContent = result.error || 'Signup failed.';
  }
});

$('#form-signup').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-signup').click(); });

// ─────────────────────────────────────────────────────────────────────────────
// SESSION RESTORE  (auto-login from saved session)
// ─────────────────────────────────────────────────────────────────────────────
window.kazi.onSessionRestore((user) => { if (user) showAppScreen(user); });

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
$('#btn-minimize').addEventListener('click', () => window.kazi.window.minimize());

$('#btn-maximize').addEventListener('click', () => {
  window.kazi.window.maximize();
  // Icon updates via window:state event below
});

$('#btn-close').addEventListener('click', () => window.kazi.window.close());

$('#btn-pip').addEventListener('click', () => {
  pipActive = !pipActive;
  $('#btn-pip').classList.toggle('active', pipActive);
  window.kazi.window.pip();
});

$('#btn-aot').addEventListener('click', () => {
  aotActive = !aotActive;
  $('#btn-aot').classList.toggle('active', aotActive);
  window.kazi.window.alwaysTop(aotActive);
  toast(aotActive ? 'Always on top: ON 📌' : 'Always on top: OFF', 'info', 1600);
});

// Window state events from main process
window.kazi.window.onState((state) => {
  updateMaxIcon(state === 'maximized' || state === 'fullscreen');
});

// PiP state events
window.kazi.window.onPip((active) => {
  pipActive = active;
  $('#btn-pip').classList.toggle('active', active);
});

// ─────────────────────────────────────────────────────────────────────────────
// USER DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
$('#btn-user-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  const dd = $('#user-dd');
  dropdownOpen = !dropdownOpen;
  dropdownOpen ? show(dd) : hide(dd);
});

document.addEventListener('click', () => {
  if (dropdownOpen) { hide($('#user-dd')); dropdownOpen = false; }
});

$('#dd-settings').addEventListener('click', () => {
  switchTab('settings');
  hide($('#user-dd'));
  dropdownOpen = false;
});

$('#dd-pip').addEventListener('click', () => {
  hide($('#user-dd'));
  dropdownOpen = false;
  pipActive = !pipActive;
  $('#btn-pip').classList.toggle('active', pipActive);
  window.kazi.window.pip();
});

$('#dd-logout').addEventListener('click', handleLogout);

// ─────────────────────────────────────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));

  const browserBar = $('#browser-bar');
  if (name === 'browser') {
    browserBar.classList.add('visible');
    browserActive = true;
    const u = $('#url-input').value.trim();
    if (u) window.kazi.browser.navigate(u);
  } else {
    browserBar.classList.remove('visible');
    if (browserActive) { window.kazi.browser.hide(); browserActive = false; }
  }

  if (name === 'memory')   loadMemoryUI();
  if (name === 'settings') loadSettingsUI();
  if (name === 'history')  loadHistoryUI();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

window.kazi.onNavigate((tab) => switchTab(tab));

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER
// ─────────────────────────────────────────────────────────────────────────────
const urlInput = $('#url-input');

function navigateBrowser(u) {
  if (!u) return;
  const full = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  urlInput.value = full;
  hide($('#browser-ph'));
  window.kazi.browser.navigate(full);
}

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateBrowser(urlInput.value.trim());
});

$('#btn-back').addEventListener('click',    () => window.kazi.browser.back());
$('#btn-forward').addEventListener('click', () => window.kazi.browser.forward());
$('#btn-reload').addEventListener('click',  () => window.kazi.browser.reload());

document.querySelectorAll('.ql-btn').forEach(btn => {
  btn.addEventListener('click', () => { switchTab('browser'); navigateBrowser(btn.dataset.url); });
});

window.kazi.browser.onUrl((u)     => { if (urlInput) urlInput.value = u; });
window.kazi.browser.onTitle((t)   => { document.title = `Kazi — ${t}`; });

// ─────────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────────
const chatContainer = $('#chatContainer');
const commandInput  = $('#commandInput');
const sendBtn       = $('#sendBtn');

function addMsg(text, type) {
  document.querySelectorAll('.typing').forEach(e => e.remove());
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  if (text.startsWith('[DONE]'))     { div.classList.add('done');  text = '✅ ' + text.slice(6).trim(); }
  if (text.startsWith('[ERROR]'))    { div.classList.add('error'); text = '❌ ' + text.slice(7).trim(); }
  if (text.startsWith('[QUESTION]')) { text = '❓ ' + text.slice(10).trim(); }
  div.innerHTML = text.replace(/\n/g, '<br>');
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'msg agent typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function sendCommand() {
  const cmd = commandInput.value.trim();
  if (!cmd) return;
  if (!agentReady) {
    toast('Agent not ready — check your API key in Settings', 'error');
    return;
  }
  addMsg(cmd, 'user');
  recordSessionMsg('user', cmd);
  addTypingIndicator();
  setStatus('Working…', 'loading');
  sendBtn.disabled   = true;
  commandInput.value = '';
  autoGrow(commandInput);
  window.kazi.agent.sendCommand(cmd);
}

sendBtn.addEventListener('click', sendCommand);

commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCommand(); }
  autoGrow(commandInput);
});
commandInput.addEventListener('input', () => autoGrow(commandInput));

window.kazi.agent.onResponse((response) => {
  document.querySelectorAll('.typing').forEach(e => e.remove());
  addMsg(response, 'agent');
  recordSessionMsg('agent', response);
  sendBtn.disabled = false;
  setStatus('Ready', 'ready');
  loadMemoryUI();
});

window.kazi.agent.onStatus((status) => {
  switch (status) {
    case 'ready':
      agentReady       = true;
      sendBtn.disabled = false;
      setStatus('Agent ready ⚡', 'ready');
      toast('Kazi agent is ready! ⚡', 'success');
      break;
    case 'disconnected':
      agentReady = false;
      setStatus('Reconnecting…', 'warning');
      break;
    case 'error:nopython':
      agentReady = false;
      setStatus('Python not found', 'error');
      addMsg('⚠️ Python 3.8+ is required but was not found on your system.\nPlease install Python from python.org and restart Kazi.', 'agent');
      break;
    case 'error:nodeps':
      agentReady = false;
      setStatus('Missing packages', 'error');
      addMsg('⚠️ Some Python packages are missing.\nRun: pip install -r python/requirements.txt', 'agent');
      break;
    case 'error:nokey':
      agentReady = false;
      setStatus('No API key', 'warning');
      addMsg('🔑 No Gemini API key found. Go to Settings → 🔑 API Key to add yours.', 'agent');
      break;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

async function loadMemoryUI() {
  const list = $('#memory-list');
  const mem  = await window.kazi.memory.get();
  updateMemoryCount(mem.length);

  if (!mem.length) {
    list.innerHTML = '<div class="mem-empty">No memories yet — start chatting!</div>';
    return;
  }

  list.innerHTML = '';
  [...mem].reverse().forEach(item => {
    const div     = document.createElement('div');
    const isUser  = item.role === 'user';
    div.className = `mem-item ${isUser ? 'u' : 'a'}`;
    const time    = item.timestamp
      ? new Date(item.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const content = (item.content || '').slice(0, 200);
    div.innerHTML = `
      <div class="mem-role">${isUser ? '👤 You' : '⚡ Kazi'}</div>
      <div class="mem-text">${escapeHtml(content)}${(item.content || '').length > 200 ? '…' : ''}</div>
      <div class="mem-time">${time}</div>`;
    list.appendChild(div);
  });
}

$('#btn-clear-memory').addEventListener('click', async () => {
  if (!confirm('Clear all conversation memory? This cannot be undone.')) return;
  await window.kazi.memory.clear();
  await loadMemoryUI();
  toast('Memory cleared', 'info');
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
async function loadSettingsUI() {
  const settings = await window.kazi.settings.get();
  const pAot   = $('#pref-aot');
  const pStart = $('#pref-startup');
  const pMem   = $('#pref-memory');
  if (pAot)   pAot.checked   = !!settings.alwaysOnTop;
  if (pStart) pStart.checked = !!settings.startWithWindows;
  if (pMem)   pMem.checked   = settings.memoryEnabled !== false;

  aotActive = !!settings.alwaysOnTop;
  const aotBtn = $('#btn-aot');
  if (aotBtn) aotBtn.classList.toggle('active', aotActive);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI MODEL SELECTOR
// ─────────────────────────────────────────────────────────────────────────────
const MODEL_URLS = {
  'chatgpt':    'https://chat.openai.com',
  'claude':     'https://claude.ai',
  'notebooklm': 'https://notebooklm.google.com',
  'gemini-pro': 'https://gemini.google.com'
};
let activeModel = 'gemini-flash';

function initModelSelector() {
  document.querySelectorAll('.model-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activeModel = btn.dataset.model;
      document.querySelectorAll('.model-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (MODEL_URLS[activeModel]) {
        // Open web-based models in the browser tab
        switchTab('browser');
        navigateBrowser(MODEL_URLS[activeModel]);
        toast(`Opening ${btn.textContent.trim()} in browser ↗`, 'info', 2000);
      } else {
        // Gemini Flash/local — already the default agent
        toast(`Model: ${btn.textContent.trim()} ⚡`, 'info', 1500);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION HISTORY
// ─────────────────────────────────────────────────────────────────────────────
let currentSessionId   = null;
let currentSessionMsgs = [];

function startNewSession() {
  currentSessionId   = Date.now().toString();
  currentSessionMsgs = [];
}

function recordSessionMsg(role, content) {
  if (!currentSessionId) startNewSession();
  currentSessionMsgs.push({ role, content, ts: new Date().toISOString() });
  if (currentSessionMsgs.length === 1 && window.kazi.history) {
    // Save session to history on first message
    const preview = currentSessionMsgs[0]?.content?.slice(0, 120) || '';
    window.kazi.history.saveSession({
      id:       currentSessionId,
      ts:       new Date().toISOString(),
      preview,
      msgCount: currentSessionMsgs.length
    });
  }
}

async function loadHistoryUI() {
  const list = $('#history-list');
  if (!list || !window.kazi.history) return;
  const sessions = await window.kazi.history.get();
  if (!sessions.length) {
    list.innerHTML = '<div class="hist-empty">No history yet.<br>Every conversation is saved here automatically.</div>';
    return;
  }
  list.innerHTML = '';
  sessions.forEach(s => {
    const d   = document.createElement('div');
    d.className = 'hist-card';
    const when = s.ts ? new Date(s.ts).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    d.innerHTML = `
      <div class="hist-card-top">
        <span class="hist-time">${when}</span>
        <span class="hist-msgs">${s.msgCount || 1} msg${(s.msgCount || 1) !== 1 ? 's' : ''}</span>
      </div>
      <div class="hist-preview">${escapeHtml((s.preview || 'Empty session').slice(0, 100))}</div>`;
    d.addEventListener('click', () => {
      switchTab('chat');
      addMsg(`Resuming session from ${when}…`, 'agent');
      toast('Session loaded — continue chatting!', 'info');
    });
    list.appendChild(d);
  });
}

document.querySelector('#btn-clear-history')?.addEventListener('click', async () => {
  if (!confirm('Clear all session history?')) return;
  const list = $('#history-list');
  if (list) list.innerHTML = '<div class="hist-empty">History cleared.</div>';
  toast('History cleared', 'info');
});

$('#btn-save-settings').addEventListener('click', async () => {
  const settings = {
    alwaysOnTop:      ($('#pref-aot')     || {}).checked || false,
    startWithWindows: ($('#pref-startup') || {}).checked || false,
    memoryEnabled:    ($('#pref-memory')  || {}).checked !== false,
  };
  // Apply AOT immediately
  aotActive = settings.alwaysOnTop;
  const aotBtn = $('#btn-aot');
  if (aotBtn) aotBtn.classList.toggle('active', aotActive);
  window.kazi.window.alwaysTop(aotActive);

  const result = await window.kazi.settings.save(settings);
  if (result.success) toast('Preferences saved ✓', 'success');
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
async function handleLogout() {
  hide($('#user-dd')); dropdownOpen = false;
  await window.kazi.auth.logout();
  currentUser   = null;
  agentReady    = false;
  browserActive = false;
  pipActive     = false;
  aotActive     = false;
  const cc = $('#chatContainer');
  if (cc) cc.innerHTML = '<div class="msg agent">Hey! I\'m <strong>Kazi</strong> ⚡ — your AI desktop agent.<br>Tell me what to do and I\'ll handle it on your screen.</div>';
  switchTab('chat');
  showAuthScreen();
  toast('Signed out', 'info');
}

// Both settings sign-out button and dropdown sign-out
$('#btn-logout').addEventListener('click', handleLogout);

// ─────────────────────────────────────────────────────────────────────────────
// INIT — check for existing session or restore
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  // Init maximize icon from actual window state
  try {
    const maximized = await window.kazi.window.isMaximized();
    updateMaxIcon(maximized);
  } catch (_) {}

  const user = await window.kazi.auth.getUser();
  if (user) {
    showAppScreen(user);
  } else {
    showAuthScreen();
    setStatus('Not signed in', 'warning');
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// THEME TOGGLE — Dark / Light mode
// ─────────────────────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('kazi-theme') || 'dark';
  applyTheme(saved);
})();

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  localStorage.setItem('kazi-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND PALETTE — Ctrl+K
// ─────────────────────────────────────────────────────────────────────────────
const CMD_COMMANDS = [
  { icon: '💬', label: 'Go to Chat',        kbd: 'Ctrl+1',     action: () => switchTab('chat') },
  { icon: '🌐', label: 'Go to Browser',     kbd: 'Ctrl+2',     action: () => switchTab('browser') },
  { icon: '🕐', label: 'Go to History',     kbd: 'Ctrl+3',     action: () => switchTab('history') },
  { icon: '⚙️', label: 'Go to Settings',    kbd: 'Ctrl+4',     action: () => switchTab('settings') },
  { icon: '🧠', label: 'Go to Memory',      kbd: '',           action: () => switchTab('memory') },
  { icon: '⚙',  label: 'Go to Workflows',   kbd: '',           action: () => switchTab('workflows') },
  { icon: '☀️', label: 'Toggle Theme',       kbd: 'Ctrl+Shift+T', action: () => toggleTheme() },
  { icon: '📌', label: 'Toggle Always on Top', kbd: '',        action: () => document.getElementById('btn-aot')?.click() },
  { icon: '🚪', label: 'Sign Out',           kbd: '',           action: () => document.getElementById('btn-logout')?.click() },
  { icon: '🆕', label: 'New Chat Session',   kbd: 'Ctrl+N',    action: () => { if (typeof startNewSession === 'function') startNewSession(); switchTab('chat'); } },
  { icon: '⊡',  label: 'Picture-in-Picture', kbd: '',          action: () => document.getElementById('btn-pip')?.click() },
];

let cmdSelectedIdx = 0;
let cmdVisible = false;
let cmdFiltered = [...CMD_COMMANDS];

function openCmdPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  cmdVisible = true;
  cmdSelectedIdx = 0;
  renderCmdResults('');
  setTimeout(() => document.getElementById('cmd-input')?.focus(), 50);
}

function closeCmdPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  cmdVisible = false;
  const inp = document.getElementById('cmd-input');
  if (inp) inp.value = '';
}

function renderCmdResults(query) {
  const q = query.toLowerCase().trim();
  cmdFiltered = q ? CMD_COMMANDS.filter(c => c.label.toLowerCase().includes(q)) : [...CMD_COMMANDS];
  const container = document.getElementById('cmd-results');
  if (!container) return;
  if (cmdFiltered.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">No commands found</div>';
    return;
  }
  container.innerHTML = cmdFiltered.map((c, i) => `
    <div class="cmd-item${i === cmdSelectedIdx ? ' selected' : ''}" data-idx="${i}">
      <span class="cmd-icon">${c.icon}</span>
      <span class="cmd-label">${c.label}</span>
      ${c.kbd ? `<kbd class="cmd-kbd">${c.kbd}</kbd>` : ''}
    </div>
  `).join('');
  // Attach click handlers
  container.querySelectorAll('.cmd-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      if (cmdFiltered[idx]) { closeCmdPalette(); cmdFiltered[idx].action(); }
    });
  });
}

document.getElementById('cmd-input')?.addEventListener('input', e => {
  cmdSelectedIdx = 0;
  renderCmdResults(e.target.value);
});

document.getElementById('cmd-input')?.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { cmdSelectedIdx = Math.min(cmdSelectedIdx + 1, cmdFiltered.length - 1); renderCmdResults(e.target.value); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { cmdSelectedIdx = Math.max(cmdSelectedIdx - 1, 0); renderCmdResults(e.target.value); e.preventDefault(); }
  else if (e.key === 'Enter') { if (cmdFiltered[cmdSelectedIdx]) { closeCmdPalette(); cmdFiltered[cmdSelectedIdx].action(); } }
  else if (e.key === 'Escape') { closeCmdPalette(); }
});

document.getElementById('cmd-palette-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('cmd-palette-overlay')) closeCmdPalette();
});

document.getElementById('btn-cmdpal')?.addEventListener('click', openCmdPalette);

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Ignore when typing in input/textarea
  const tag = document.activeElement?.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true';

  // Ctrl+K → Command Palette (always works)
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (cmdVisible) closeCmdPalette(); else openCmdPalette();
    return;
  }

  // Ctrl+Shift+T → Toggle theme
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
    e.preventDefault();
    toggleTheme();
    return;
  }

  if (isTyping) return;  // Don't intercept below when typing

  // Ctrl+1-4 → Switch tabs
  if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); switchTab('chat'); }
  else if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); switchTab('browser'); }
  else if ((e.ctrlKey || e.metaKey) && e.key === '3') { e.preventDefault(); switchTab('history'); }
  else if ((e.ctrlKey || e.metaKey) && e.key === '4') { e.preventDefault(); switchTab('settings'); }

  // Ctrl+N → New chat session
  else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    if (typeof startNewSession === 'function') startNewSession();
    switchTab('chat');
  }

  // Escape → Close modals / clear command input
  else if (e.key === 'Escape') {
    if (cmdVisible) closeCmdPalette();
  }
});

// Helper: switch tab by name
function switchTab(name) {
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (btn) btn.click();
}
