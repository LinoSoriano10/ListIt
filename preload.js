const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDatos: () => ipcRenderer.invoke('get-datos'),
  guardarDatos: (datos) => ipcRenderer.invoke('guardar-datos', datos)
});