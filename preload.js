const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDatos: () => ipcRenderer.invoke('get-datos'),
  guardarDatos: (datos) => ipcRenderer.invoke('guardar-datos', datos),
  getDetalle: (id) => ipcRenderer.invoke('get-detalle', id),
  eliminarPelicula: (id) => ipcRenderer.invoke('eliminar-pelicula', id),
  actualizarPelicula: (datos) => ipcRenderer.invoke('actualizar-pelicula', datos),
  seleccionarImagen: () => ipcRenderer.invoke('seleccionar-imagen')
});
