/**
 * KAZI MOBILE — app.js
 * Standalone AI chat using Gemini API directly from the browser.
 * API key stored in localStorage (user's own device).
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const STORAGE_USERS  = 'kazi_mobile_users';
const STORAGE_MEM    = 'kazi_mobile_mem';
const STORAGE_SESS   = 'kazi_mobile_session';
const STORAGE_KEYS   = 'kazi_mobile_keys';

let currentUser = null;
let chatHistory = [];   // [{role:'user'|'model', parts:[{text:'...'}]}]

// ── Helpers ────────────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');

function toast(msg, type = 'inf', ms = 2800) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function hashStr(s) {
  // Simple djb2 — good enough for local device auth
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// ── Storage helpers ────────────────────────────────────────────────────────
function getUsers()       { try { return JSON.parse(localStorage.getItem(STORAGE_USERS) || '{}'); } catch { return {}; } }
function saveUsers(u)     { localStorage.setItem(STORAGE_USERS, JSON.stringify(u)); }
function getSession()     { try { return JSON.parse(localStorage.getItem(STORAGE_SESS) || 'null'); } catch { return null; } }
function saveSession(u)   { localStorage.setItem(STORAGE_SESS, u ? JSON.stringify(u) : 'null'); }
function getApiKey(uid)   { try { const k = JSON.parse(localStorage.getItem(STORAGE_KEYS) || '{}'); return k[uid] || ''; } catch { return ''; } }
function saveApiKey(uid, k) { const m = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS) || '{}'); } catch { return {}; } })(); m[uid] = k; localStorage.setItem(STORAGE_KEYS, JSON.stringify(m)); }
function getMemory(uid)   { try { const m = JSON.parse(localStorage.getItem(STORAGE_MEM) || '{}'); return m[uid] || []; } catch { return []; } }
function saveMemory(uid, mem) { const m = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_MEM) || '{}'); } catch { return {}; } })(); m[uid] = mem.slice(-100); localStorage.setItem(STORAGE_MEM, JSON.stringify(m)); }

// ── Screens ────────────────────────────────────────────────────────────────
function showAuth() { show($('#screen-auth')); hide($('#screen-app')); }
function showApp(user) {
  currentUser = user;
  hide($('#screen-auth'));
  show($('#screen-app'));

  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  $('#hdr-avatar').textContent   = initials;
  $('#profile-av').textContent   = initials;
  $('#profile-nm').textContent   = user.name;
  $('#profile-em').textContent   = user.email;

  chatHistory = getMemory(user.id).slice(-20).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  loadKeyStatus();
}

// ── Auth tabs ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $(`#form-${tab.dataset.tab}`).classList.add('active');
    $('#login-err').textContent = '';
    $('#signup-err').textContent = '';
  });
});

// ── Auth — login ───────────────────────────────────────────────────────────
$('#btn-login').addEventListener('click', () => {
  const email = $('#a-email').value.trim().toLowerCase();
  const pass  = $('#a-pass').value;
  if (!email || !pass) { $('#login-err').textContent = 'Fill all fields.'; return; }

  const users = getUsers();
  const user  = users[email];
  if (!user || user.passwordHash !== hashStr(pass + user.salt)) {
    $('#login-err').textContent = 'Invalid email or password.';
    return;
  }

  saveSession(user);
  showApp(user);
  toast(`Welcome back, ${user.name.split(' ')[0]}! ⚡`, 'ok');
});
$('#form-login').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-login').click(); });

// ── Auth — signup ──────────────────────────────────────────────────────────
$('#btn-signup').addEventListener('click', () => {
  const name  = $('#b-name').value.trim();
  const email = $('#b-email').value.trim().toLowerCase();
  const pass  = $('#b-pass').value;
  const key   = $('#b-key').value.trim();

  if (!name || !email || !pass) { $('#signup-err').textContent = 'Name, email and password required.'; return; }
  if (pass.length < 6)          { $('#signup-err').textContent = 'Password must be 6+ characters.'; return; }

  const users = getUsers();
  if (users[email]) { $('#signup-err').textContent = 'Email already registered.'; return; }

  const salt = Math.random().toString(36).slice(2);
  const user = { id: Date.now().toString(36), name, email, passwordHash: hashStr(pass + salt), salt, createdAt: new Date().toISOString() };
  users[email] = user;
  saveUsers(users);

  if (key) saveApiKey(user.id, key);
  saveSession(user);
  showApp(user);
  toast(`Account created! Welcome, ${name.split(' ')[0]}! 🎉`, 'ok');
});

$('#get-key-link').addEventListener('click', () => window.open('https://aistudio.google.com/app/apikey', '_blank'));

// ── Nav ────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'settings') loadKeyStatus();
}
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// ── Chat ───────────────────────────────────────────────────────────────────
const msgInput    = $('#msgInput');
const chatMessages = $('#chatMessages');

function addBubble(text, role) {
  document.querySelectorAll('.typing-row').forEach(e => e.remove());
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  if (text.startsWith('[ERROR]')) { div.classList.add('error'); text = '❌ ' + text.slice(7).trim(); }
  div.innerHTML = text.replace(/\n/g, '<br>');
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTyping() {
  const d = document.createElement('div');
  d.className = 'typing-row';
  d.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  chatMessages.appendChild(d);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  const apiKey = getApiKey(currentUser.id);
  if (!apiKey) {
    toast('Add your Gemini API key in Settings first 🔑', 'err', 3500);
    return;
  }

  addBubble(text, 'user');
  addTyping();
  msgInput.value = '';
  autoGrow(msgInput);
  $('#sendBtn').disabled = true;

  chatHistory.push({ role: 'user', parts: [{ text }] });
  if (currentUser) saveMemory(currentUser.id, chatHistory.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.parts[0].text })));

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const body = {
      contents: chatHistory,
      systemInstruction: {
        parts: [{ text: 'You are Kazi, an AI assistant. Be helpful, concise, and friendly. You are running as a mobile companion app. You cannot control the desktop from here — for desktop automation, the user needs the Kazi desktop app.' }]
      }
    };

    const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || 'API error';
      document.querySelectorAll('.typing-row').forEach(e => e.remove());
      addBubble(`[ERROR] ${errMsg}`, 'agent');
    } else {
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
      document.querySelectorAll('.typing-row').forEach(e => e.remove());
      addBubble(reply, 'agent');
      chatHistory.push({ role: 'model', parts: [{ text: reply }] });
      if (currentUser) saveMemory(currentUser.id, chatHistory.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.parts[0].text })));
    }
  } catch (err) {
    document.querySelectorAll('.typing-row').forEach(e => e.remove());
    addBubble(`[ERROR] Network error — ${err.message}`, 'agent');
  } finally {
    $('#sendBtn').disabled = false;
  }
}

$('#sendBtn').addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  autoGrow(msgInput);
});
msgInput.addEventListener('input', () => autoGrow(msgInput));

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

// ── Settings ───────────────────────────────────────────────────────────────
function loadKeyStatus() {
  const key = currentUser ? getApiKey(currentUser.id) : '';
  const badge = $('#key-badge');
  if (key) { badge.textContent = '● API key saved ✓'; badge.className = 'status-badge set'; }
  else      { badge.textContent = '● No API key';      badge.className = 'status-badge unset'; }
}

$('#eye-btn').addEventListener('click', () => {
  const inp = $('#key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  $('#eye-btn').textContent = inp.type === 'password' ? '👁' : '🙈';
});

$('#save-key-btn').addEventListener('click', () => {
  const key = $('#key-input').value.trim();
  if (!key) { toast('Enter an API key', 'err'); return; }
  saveApiKey(currentUser.id, key);
  $('#key-input').value = '';
  loadKeyStatus();
  toast('API key saved! 🔒', 'ok');
});

$('#get-key-settings').addEventListener('click', () => window.open('https://aistudio.google.com/app/apikey', '_blank'));
$('#desktop-link').addEventListener('click', () => window.open('https://github.com/eugineous/kazi-agent/releases', '_blank'));

$('#btn-logout').addEventListener('click', () => {
  currentUser = null;
  chatHistory = [];
  saveSession(null);
  $('#chatMessages').innerHTML = '<div class="bubble agent">Hey! I\'m <strong>Kazi</strong> ⚡<br>Your AI assistant.</div>';
  switchTab('chat');
  showAuth();
  toast('Signed out', 'inf');
});

// ── Init ───────────────────────────────────────────────────────────────────
(function init() {
  const session = getSession();
  if (session && session.id) {
    showApp(session);
  } else {
    showAuth();
  }
})();
