const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pacmanAPI', {
  getDesktopItems: () => ipcRenderer.invoke('get-desktop-items'),
  deleteItem: (itemPath) => ipcRenderer.invoke('delete-item', itemPath),
  getDemoFolderPath: () => ipcRenderer.invoke('get-demo-folder-path'),
});
