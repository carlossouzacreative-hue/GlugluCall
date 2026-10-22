'use strict';
// Ponte mínima e segura entre a página e o Electron. O main.js só atende
// estes canais se a página for do domínio configurado (ou a tela de "servidor offline").
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  isElectron: true,
  platform: process.platform,
  getSources: () => ipcRenderer.invoke('screen:sources'),
  selectSource: (opts) => ipcRenderer.invoke('screen:select', opts),
  clearSource: () => ipcRenderer.invoke('screen:clear'),
  info: () => ipcRenderer.invoke('app:info'),
  retry: () => ipcRenderer.invoke('app:retry'),
});
