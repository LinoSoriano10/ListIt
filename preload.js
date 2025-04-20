const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDatos: () => ipcRenderer.invoke('get-datos'),
  guardarDatos: (datos) => ipcRenderer.invoke('guardar-datos', datos),
  abrirDetalle: (id) => ipcRenderer.send('abrir-detalle', id),
  getDetalle: (id) => ipcRenderer.invoke('get-detalle', id),
  onCargarDetalle: (callback) => ipcRenderer.on('cargar-detalle', (event, id) => callback(id)),
  abrirNueva: () => ipcRenderer.send('abrir-nueva')

});
