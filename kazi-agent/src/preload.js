/**
 * KAZI AGENT v2.0 — Preload / Context Bridge
 * Safely exposes IPC channels to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kazi', {

  // ── AUTH ──────────────────────────────────────────────────────────────────
  auth: {
    signup:  (data)            => ipcRenderer.invoke('auth:signup',  data),
    login:   (data)            => ipcRenderer.invoke('auth:login',   data),
    logout:  ()                => ipcRenderer.invoke('auth:logout'),
    getUser: ()                => ipcRenderer.invoke('auth:getUser'),
  },

  // ── AGENT ─────────────────────────────────────────────────────────────────
  agent: {
    sendCommand: (cmd)         => ipcRenderer.send('send-command',    cmd),
    onResponse:  (cb)          => ipcRenderer.on('agent-response',   (_, d) => cb(d)),
    onStatus:    (cb)          => ipcRenderer.on('agent-status',     (_, d) => cb(d)),
  },

  // ── BROWSER ───────────────────────────────────────────────────────────────
  browser: {
    navigate: (url)            => ipcRenderer.invoke('browser:navigate', url),
    hide:     ()               => ipcRenderer.invoke('browser:hide'),
    back:     ()               => ipcRenderer.invoke('browser:back'),
    forward:  ()               => ipcRenderer.invoke('browser:forward'),
    reload:   ()               => ipcRenderer.invoke('browser:reload'),
    onTitle:  (cb)             => ipcRenderer.on('browser:title',    (_, d) => cb(d)),
    onUrl:    (cb)             => ipcRenderer.on('browser:url',      (_, d) => cb(d)),
  },

  // ── MEMORY ────────────────────────────────────────────────────────────────
  memory: {
    get:   ()                  => ipcRenderer.invoke('memory:get'),
    clear: ()                  => ipcRenderer.invoke('memory:clear'),
  },

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  settings: {
    get:          ()           => ipcRenderer.invoke('settings:get'),
    save:         (s)          => ipcRenderer.invoke('settings:save',      s),
    saveApiKey:   (k)          => ipcRenderer.invoke('settings:saveApiKey',k),
    hasApiKey:    ()           => ipcRenderer.invoke('settings:hasApiKey'),
  },

  // ── WINDOW CONTROLS ───────────────────────────────────────────────────────
  window: {
    minimize: ()               => ipcRenderer.send('window:minimize'),
    maximize: ()               => ipcRenderer.send('window:maximize'),
    close:    ()               => ipcRenderer.send('window:close'),
  },

  // ── NAVIGATION EVENTS (from main → renderer) ──────────────────────────────
  onNavigate:       (cb)       => ipcRenderer.on('navigate',         (_, d) => cb(d)),
  onSessionRestore: (cb)       => ipcRenderer.on('session:restore',  (_, d) => cb(d)),

  // ── EXTERNAL LINKS ────────────────────────────────────────────────────────
  openExternal: (url)          => ipcRenderer.invoke('app:openExternal', url),
});
