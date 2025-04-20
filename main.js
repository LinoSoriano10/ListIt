const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
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

// Abrir ventana detalle
ipcMain.on('abrir-detalle', (event, id) => {
  crearVentanaDetalle(id);
});

function crearVentanaDetalle(id) {
  const detalleWin = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true  // solo aquí porque usas require en el renderer
    }
  });

  detalleWin.loadFile('src/details.html');
  detalleWin.webContents.once('did-finish-load', () => {
    detalleWin.webContents.send('cargar-detalle', id);
  });
}

