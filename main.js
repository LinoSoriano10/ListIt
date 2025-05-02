const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('src/index.html');
}

app.whenReady().then(() => {
  createWindow();
});

// IPC handlers
ipcMain.handle('get-datos', () => {
  return db.obtenerPeliculas();
});

ipcMain.handle('guardar-datos', (event, pelicula) => {
  return db.guardarPelicula(pelicula);
});

ipcMain.handle('get-detalle', (event, id) => {
  return db.obtenerPeliculaPorId(id);
});

ipcMain.handle('eliminar-pelicula', (event, id) => {
  return db.eliminarPelicula(id);
});