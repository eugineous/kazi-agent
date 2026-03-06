/**
 * KAZI AGENT v2.0 — Renderer Process
 * Handles all UI logic: auth, chat, browser, memory, settings
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let currentUser  = null;
let agentReady   = false;
let browserActive = false;
let dropdownOpen  = false;

// ─────────────────────────────────────────────────────────────────────────────
// DOM HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');

function toast(msg, type = 'info', duration = 2800) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toast-container').appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function setStatus(text, state = 'ready') {
  const dot  = $('#status-dot');
  const span = $('#status-text');
  if (span) span.textContent = text;
  if (dot) {
    dot.className = 'status-dot';
    if (state === 'loading') dot.classList.add('loading');
    if (state === 'warning') dot.classList.add('warning');
    if (state === 'error')   dot.classList.add('error');
  }
}

function updateMemoryCount(n) {
  const el = $('#memory-count');
  if (el) el.textContent = `${n} memor${n === 1 ? 'y' : 'ies'}`;
}

// Auto-grow textarea
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN SWITCHING
// ─────────────────────────────────────────────────────────────────────────────
function showAuthScreen() {
  show($('#screen-auth'));
  hide($('#screen-app'));
}

function showAppScreen(user) {
  currentUser = user;
  hide($('#screen-auth'));
  show($('#screen-app'));

  // Populate user info
  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  $('#tb-avatar').textContent    = initials;
  $('#tb-username').textContent  = user.name.split(' ')[0];
  $('#profile-avatar').textContent = initials;
  $('#profile-name').textContent   = user.name;
  $('#profile-email').textContent  = user.email;
  $('#dd-name').textContent  = user.name;
  $('#dd-email').textContent = user.email;

  // Load settings & memory
  loadSettingsUI();
  loadMemoryUI();

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
  $('#login-error').textContent  = '';
  $('#signup-error').textContent = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — LOGIN
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
  $('#btn-login').textContent = 'Sign In';

  if (result.success) {
    showAppScreen(result.user);
    toast(`Welcome back, ${result.user.name.split(' ')[0]}! ⚡`, 'success');
  } else {
    $('#login-error').textContent = result.error || 'Login failed.';
  }
});

$('#form-login').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-login').click();
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — SIGNUP
// ─────────────────────────────────────────────────────────────────────────────
$('#btn-signup').addEventListener('click', async () => {
  const name     = $('#signup-name').value.trim();
  const email    = $('#signup-email').value.trim();
  const password = $('#signup-password').value;
  const apiKey   = $('#signup-apikey').value.trim();

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

  const result = await window.kazi.auth.signup({ name, email, password, apiKey });

  $('#btn-signup').disabled    = false;
  $('#btn-signup').textContent = 'Create Account';

  if (result.success) {
    showAppScreen(result.user);
    toast(`Account created! Welcome, ${result.user.name.split(' ')[0]}! 🎉`, 'success');
    if (!apiKey) {
      setTimeout(() => {
        switchTab('settings');
        toast('Add your Gemini API key to activate the agent 🔑', 'info', 4000);
      }, 1000);
    }
  } else {
    $('#signup-error').textContent = result.error || 'Signup failed.';
  }
});

$('#form-signup').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-signup').click();
});

// External links in auth
$('#get-key-link-signup').addEventListener('click', () => {
  window.kazi.openExternal('https://aistudio.google.com/app/apikey');
});

// ─────────────────────────────────────────────────────────────────────────────
// SESSION RESTORE  (auto-login from saved session)
// ─────────────────────────────────────────────────────────────────────────────
window.kazi.onSessionRestore((user) => {
  if (user) showAppScreen(user);
});

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
$('#btn-minimize').addEventListener('click', () => window.kazi.window.minimize());
$('#btn-close').addEventListener('click',    () => window.kazi.window.close());

// ─────────────────────────────────────────────────────────────────────────────
// USER DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
$('#btn-user-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  const dd = $('#user-dropdown');
  dropdownOpen = !dropdownOpen;
  dropdownOpen ? show(dd) : hide(dd);
});
document.addEventListener('click', () => {
  if (dropdownOpen) { hide($('#user-dropdown')); dropdownOpen = false; }
});
$('#dd-settings').addEventListener('click', () => { switchTab('settings'); hide($('#user-dropdown')); dropdownOpen = false; });
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
    // If browser view is loaded, show it
    const url = $('#url-input').value.trim();
    if (url) window.kazi.browser.navigate(url);
  } else {
    browserBar.classList.remove('visible');
    if (browserActive) {
      window.kazi.browser.hide();
      browserActive = false;
    }
  }

  if (name === 'memory')   loadMemoryUI();
  if (name === 'settings') loadSettingsUI();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Navigate event from main (e.g. tray menu → settings)
window.kazi.onNavigate((tab) => switchTab(tab));

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER
// ─────────────────────────────────────────────────────────────────────────────
const urlInput = $('#url-input');

function navigateBrowser(url) {
  if (!url) return;
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  urlInput.value = full;
  hide($('#browser-placeholder'));
  window.kazi.browser.navigate(full);
}

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateBrowser(urlInput.value.trim());
});

$('#btn-back').addEventListener('click',    () => window.kazi.browser.back());
$('#btn-forward').addEventListener('click', () => window.kazi.browser.forward());
$('#btn-reload').addEventListener('click',  () => window.kazi.browser.reload());

document.querySelectorAll('.quick-link-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab('browser');
    navigateBrowser(btn.dataset.url);
  });
});

window.kazi.browser.onUrl((url)     => { if (urlInput) urlInput.value = url; });
window.kazi.browser.onTitle((title) => { document.title = `Kazi — ${title}`; });

// ─────────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────────
const chatContainer = $('#chatContainer');
const commandInput  = $('#commandInput');
const sendBtn       = $('#sendBtn');

function addMsg(text, type) {
  // Remove existing typing indicator
  document.querySelectorAll('.typing').forEach(e => e.remove());

  const div = document.createElement('div');
  div.className = `msg ${type}`;

  // Parse [DONE] / [ERROR] / [QUESTION] prefixes
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
    toast('Agent not ready yet — check your API key in Settings', 'error');
    return;
  }

  addMsg(cmd, 'user');
  addTypingIndicator();
  setStatus('Working…', 'loading');
  sendBtn.disabled = true;
  commandInput.value = '';
  autoGrow(commandInput);

  window.kazi.agent.sendCommand(cmd);
}

sendBtn.addEventListener('click', sendCommand);

commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCommand();
  }
  autoGrow(commandInput);
});
commandInput.addEventListener('input', () => autoGrow(commandInput));

// Receive agent responses
window.kazi.agent.onResponse((response) => {
  document.querySelectorAll('.typing').forEach(e => e.remove());
  addMsg(response, 'agent');
  sendBtn.disabled = false;
  setStatus('Ready', 'ready');
  updateMemoryCount(getApproxMemoryCount());
});

// Agent status updates
window.kazi.agent.onStatus((status) => {
  switch (status) {
    case 'ready':
      agentReady = true;
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
      addMsg('⚠️ Python was not found on your system. Please install Python 3.8+ and restart Kazi.', 'agent error');
      break;
    case 'error:nodeps':
      agentReady = false;
      setStatus('Missing Python packages', 'error');
      addMsg('⚠️ Some Python packages are missing. Run: pip install -r python/requirements.txt', 'agent error');
      break;
    case 'error:nokey':
      agentReady = false;
      setStatus('No API key', 'warning');
      addMsg('🔑 No Gemini API key found. Go to Settings → 🔑 API Key to add yours.', 'agent');
      break;
  }
});

function getApproxMemoryCount() {
  // Approximate — actual count fetched async in loadMemoryUI
  return parseInt($('#memory-count').textContent) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY
// ─────────────────────────────────────────────────────────────────────────────
async function loadMemoryUI() {
  const list = $('#memory-list');
  const mem  = await window.kazi.memory.get();
  updateMemoryCount(mem.length);

  if (!mem.length) {
    list.innerHTML = '<div class="memory-empty">No memories yet — start chatting!</div>';
    return;
  }

  list.innerHTML = '';
  // Show in reverse-chronological order
  [...mem].reverse().forEach(item => {
    const div = document.createElement('div');
    div.className = `memory-item ${item.role === 'user' ? 'user-mem' : 'agent-mem'}`;

    const time = item.timestamp
      ? new Date(item.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';

    div.innerHTML = `
      <div class="mem-role">${item.role === 'user' ? '👤 You' : '⚡ Kazi'}</div>
      <div class="mem-text">${escapeHtml(item.content.slice(0, 200))}${item.content.length > 200 ? '…' : ''}</div>
      <div class="mem-time">${time}</div>
    `;
    list.appendChild(div);
  });
}

$('#btn-clear-memory').addEventListener('click', async () => {
  if (!confirm('Clear all conversation memory? This cannot be undone.')) return;
  await window.kazi.memory.clear();
  await loadMemoryUI();
  toast('Memory cleared', 'info');
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
async function loadSettingsUI() {
  const settings = await window.kazi.settings.get();
  $('#pref-always-on-top').checked  = settings.alwaysOnTop  !== false;
  $('#pref-start-windows').checked  = !!settings.startWithWindows;
  $('#pref-memory').checked         = settings.memoryEnabled !== false;

  const hasKey = await window.kazi.settings.hasApiKey();
  if (hasKey) {
    $('#key-status').textContent  = '● API key saved and encrypted ✓';
    $('#key-status').className    = 'key-status set';
  } else {
    $('#key-status').textContent  = '● No API key set — add one below';
    $('#key-status').className    = 'key-status unset';
  }
}

// Toggle API key visibility
$('#btn-toggle-key').addEventListener('click', () => {
  const inp = $('#settings-apikey');
  if (inp.type === 'password') {
    inp.type = 'text';
    $('#btn-toggle-key').textContent = '🙈';
  } else {
    inp.type = 'password';
    $('#btn-toggle-key').textContent = '👁';
  }
});

// Save API key
$('#btn-save-apikey').addEventListener('click', async () => {
  const key = $('#settings-apikey').value.trim();
  if (!key) { toast('Please enter an API key', 'error'); return; }
  if (!key.startsWith('AIza')) { toast('That doesn\'t look like a valid Gemini key', 'error'); return; }

  $('#btn-save-apikey').textContent = 'Saving…';
  const result = await window.kazi.settings.saveApiKey(key);
  $('#btn-save-apikey').textContent = '💾 Save API Key';

  if (result.success) {
    $('#settings-apikey').value = '';
    await loadSettingsUI();
    toast('API key saved and encrypted! 🔒', 'success');
  } else {
    toast(result.error || 'Failed to save key', 'error');
  }
});

// External link for API key
$('#get-key-link-settings').addEventListener('click', (e) => {
  e.preventDefault();
  window.kazi.openExternal('https://aistudio.google.com/app/apikey');
});

// Save preferences
$('#btn-save-settings').addEventListener('click', async () => {
  const settings = {
    alwaysOnTop:      $('#pref-always-on-top').checked,
    startWithWindows: $('#pref-start-windows').checked,
    memoryEnabled:    $('#pref-memory').checked
  };
  const result = await window.kazi.settings.save(settings);
  if (result.success) toast('Preferences saved ✓', 'success');
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
async function handleLogout() {
  hide($('#user-dropdown')); dropdownOpen = false;
  await window.kazi.auth.logout();
  currentUser  = null;
  agentReady   = false;
  browserActive = false;
  // Reset chat
  $('#chatContainer').innerHTML = '<div class="msg agent">Hey! I\'m <strong>Kazi</strong> ⚡ — your AI desktop agent.</div>';
  // Reset tabs
  switchTab('chat');
  showAuthScreen();
  toast('Signed out', 'info');
}

$('#btn-logout').addEventListener('click', handleLogout);

// ─────────────────────────────────────────────────────────────────────────────
// INIT — check for existing session
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const user = await window.kazi.auth.getUser();
  if (user) {
    showAppScreen(user);
  } else {
    showAuthScreen();
    setStatus('Not signed in', 'warning');
  }
})();
