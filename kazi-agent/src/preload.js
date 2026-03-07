/**
 * KAZI AGENT v3.0 — Preload (IPC bridge)
 * Exposes safe APIs to renderer via contextBridge
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kazi', {

  // ── Auth ─────────────────────────────────────────────────────────────────
  auth: {
    signup:  (d) => ipcRenderer.invoke('auth:signup', d),
    login:   (d) => ipcRenderer.invoke('auth:login',  d),
    logout:  ()  => ipcRenderer.invoke('auth:logout'),
    getUser: ()  => ipcRenderer.invoke('auth:getUser'),
  },

  // ── OAuth (GitHub / Google) ──────────────────────────────────────────────
  oauth: {
    github:    ()  => ipcRenderer.invoke('oauth:github'),
    google:    ()  => ipcRenderer.invoke('oauth:google'),
    saveCreds: (c) => ipcRenderer.invoke('oauth:saveCreds', c),
    onResult:  (fn)=> ipcRenderer.on('oauth:result', (_, data) => fn(data)),
  },

  // ── Agent ────────────────────────────────────────────────────────────────
  agent: {
    sendCommand:    (cmd) => ipcRenderer.send('send-command', cmd),
    onResponse:     (fn)  => ipcRenderer.on('agent-response', (_, r) => fn(r)),
    onStatus:       (fn)  => ipcRenderer.on('agent-status',   (_, s) => fn(s)),
    balance:        ()    => ipcRenderer.invoke('agent:balance'),
    onTokensUpdate: (fn)  => ipcRenderer.on('tokens:update',  (_, b) => fn(b)),
  },

  // ── Payments (M-Pesa) ────────────────────────────────────────────────────
  payments: {
    initiate: (d) => ipcRenderer.invoke('payments:initiate', d),
    history:  ()  => ipcRenderer.invoke('payments:history'),
  },

  // ── Workflows ────────────────────────────────────────────────────────────
  workflows: {
    list:   ()    => ipcRenderer.invoke('workflows:list'),
    create: (d)   => ipcRenderer.invoke('workflows:create', d),
    update: (d)   => ipcRenderer.invoke('workflows:update', d),
    delete: (id)  => ipcRenderer.invoke('workflows:delete', id),
  },

  // ── Embedded browser ────────────────────────────────────────────────────
  browser: {
    navigate: (u)  => ipcRenderer.invoke('browser:navigate', u),
    hide:     ()   => ipcRenderer.invoke('browser:hide'),
    back:     ()   => ipcRenderer.invoke('browser:back'),
    forward:  ()   => ipcRenderer.invoke('browser:forward'),
    reload:   ()   => ipcRenderer.invoke('browser:reload'),
    onTitle:  (fn) => ipcRenderer.on('browser:title', (_, t) => fn(t)),
    onUrl:    (fn) => ipcRenderer.on('browser:url',   (_, u) => fn(u)),
  },

  // ── Memory ──────────────────────────────────────────────────────────────
  memory: {
    get:   () => ipcRenderer.invoke('memory:get'),
    clear: () => ipcRenderer.invoke('memory:clear'),
  },

  // ── Session History ──────────────────────────────────────────────────────
  history: {
    get:         ()  => ipcRenderer.invoke('history:get'),
    saveSession: (s) => ipcRenderer.invoke('history:saveSession', s),
  },

  // ── Settings ────────────────────────────────────────────────────────────
  settings: {
    get:  ()  => ipcRenderer.invoke('settings:get'),
    save: (s) => ipcRenderer.invoke('settings:save', s),
  },

  // ── Window controls ─────────────────────────────────────────────────────
  window: {
    minimize:    () => ipcRenderer.send('window:minimize'),
    maximize:    () => ipcRenderer.send('window:maximize'),
    close:       () => ipcRenderer.send('window:close'),
    show:        () => ipcRenderer.send('window:show'),
    quit:        () => ipcRenderer.send('window:quit'),
    pip:         () => ipcRenderer.send('window:pip'),
    fullscreen:  () => ipcRenderer.send('window:fullscreen'),
    alwaysTop:   (v)=> ipcRenderer.send('window:alwaystop', v),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onState:     (fn)=> ipcRenderer.on('window:state', (_, s) => fn(s)),
    onPip:       (fn)=> ipcRenderer.on('pip:state',    (_, s) => fn(s)),
  },

  // ── Updates (auto-updater) ───────────────────────────────────────────────────
  update: {
    check:       ()    => ipcRenderer.invoke('update:check'),
    download:    ()    => ipcRenderer.invoke('update:download'),
    install:     ()    => ipcRenderer.invoke('update:install'),
    onAvailable: (fn)  => ipcRenderer.on('update:available', (_, info) => fn(info)),
    onProgress:  (fn)  => ipcRenderer.on('update:progress',  (_, pct)  => fn(pct)),
    onReady:     (fn)  => ipcRenderer.on('update:ready',     ()        => fn()),
  },

  // ── App-level ────────────────────────────────────────────────────────────
  onNavigate:       (fn) => ipcRenderer.on('navigate',        (_, r) => fn(r)),
  onSessionRestore: (fn) => ipcRenderer.on('session:restore', (_, u) => fn(u)),
  openExternal:     (u)  => ipcRenderer.invoke('app:openExternal', u),
});
