const { app, BrowserWindow, ipcMain } = require('electron');

const path = require('path');
const fs = require('fs');

const dataPath = path.join(app.getPath('userData'), 'data.json');


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

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({ peliculas: [] }, null, 2));
  }
});


ipcMain.handle('get-datos', async () => {
  const datos = fs.readFileSync(dataPath);
  return JSON.parse(datos);
});

ipcMain.handle('guardar-datos', async (event, nuevosDatos) => {
  fs.writeFileSync(dataPath, JSON.stringify(nuevosDatos, null, 2));
});