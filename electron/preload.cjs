const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  isDesktop: true,
  openThemesFolder: () => ipcRenderer.invoke('open-themes-folder')
});
