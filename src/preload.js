const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kazi', {
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  onResponse: (callback) => ipcRenderer.on('agent-response', (event, data) => callback(data)),
  minimize: () => ipcRenderer.send('minimize-window')
});
