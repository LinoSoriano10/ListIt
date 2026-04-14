const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const fs   = require('fs');
const db   = require('./db');

// Elimina el proceso GPU de Chromium (~50-100 MB de ahorro)
app.disableHardwareAcceleration();

// Flags de V8: optimizar para tamaño de código en lugar de velocidad
app.commandLine.appendSwitch('js-flags', '--optimize-for-size');
// Desactiva features de Chrome que no se usan y consumen memoria
app.commandLine.appendSwitch('disable-features', 'TranslateUI,AutofillServerCommunication,MediaRouter');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,         // sin corrector ortográfico
      backgroundThrottling: true, // reduce CPU/mem cuando la ventana no está enfocada
    },
  });
  win.loadFile('src/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC handlers ---

ipcMain.handle('get-contenido', (_, filtros) => {
  return db.obtenerContenido(filtros);
});

// ── Tags ──────────────────────────────────────────────────────────────────────

ipcMain.handle('get-tags', () => {
  return db.obtenerTags();
});

ipcMain.handle('crear-tag', (_, nombre) => {
  return db.crearTag(nombre);
});

ipcMain.handle('eliminar-tag', (_, id) => {
  return db.eliminarTag(id);
});

ipcMain.handle('get-tags-contenido', (_, id) => {
  return db.getTagsContenido(id);
});

ipcMain.handle('set-tags-contenido', (_, { id, tagIds }) => {
  return db.setTagsContenido(id, tagIds);
});

ipcMain.handle('get-detalle', (_, id) => {
  return db.obtenerPorId(id);
});

ipcMain.handle('guardar-contenido', (_, item) => {
  const r = db.guardarContenido(item);
  return { lastInsertRowid: Number(r.lastInsertRowid) };
});

ipcMain.handle('actualizar-contenido', (_, item) => {
  return db.actualizarContenido(item);
});

ipcMain.handle('eliminar-contenido', (_, id) => {
  return db.eliminarContenido(id);
});

ipcMain.handle('contar-estados', () => {
  return db.contarPorEstado();
});

ipcMain.handle('seleccionar-imagen', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Selecciona una imagen',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  });
  return canceled ? null : filePaths[0];
});

// ── Importación XML ───────────────────────────────────────────────────────────

ipcMain.handle('seleccionar-xml', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Seleccionar archivo XML de ListIt',
    properties: ['openFile'],
    filters: [{ name: 'Archivos XML', extensions: ['xml'] }],
  });
  if (canceled) return null;
  return fs.readFileSync(filePaths[0], 'utf-8');
});

ipcMain.handle('guardar-plantilla-xml', async (_, contenido) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Guardar plantilla XML',
    defaultPath: 'listit_plantilla.xml',
    filters: [{ name: 'Archivos XML', extensions: ['xml'] }],
  });
  if (canceled) return false;
  fs.writeFileSync(filePath, contenido, 'utf-8');
  return true;
});

ipcMain.handle('guardar-entrega-completa', (_, entrega) => {
  return db.guardarEntregaCompleta(entrega);
});

// ── Entregas ──────────────────────────────────────────────────────────────────

ipcMain.handle('get-entregas', (_, contenidoId) => {
  return db.obtenerEntregas(contenidoId);
});

ipcMain.handle('guardar-entrega', (_, entrega) => {
  return db.guardarEntrega(entrega);
});

ipcMain.handle('toggle-entrega', (_, id) => {
  return db.toggleEntrega(id);
});

ipcMain.handle('renombrar-entrega', (_, { id, titulo }) => {
  return db.renombrarEntrega(id, titulo);
});

ipcMain.handle('renombrar-numero', (_, { id, numero }) => {
  return db.renombrarNumero(id, numero);
});

ipcMain.handle('ep-entrega-delta', (_, { id, delta }) => {
  return db.actualizarEpEntrega(id, delta);
});

ipcMain.handle('set-ep-total-entrega', (_, { id, total }) => {
  return db.setEpTotalEntrega(id, total);
});

ipcMain.handle('eliminar-entrega', (_, id) => {
  return db.eliminarEntrega(id);
});

// Búsqueda de anime via Jikan (MAL unofficial API) — sin clave necesaria
ipcMain.handle('buscar-anime', (_, query) => {
  return new Promise((resolve, reject) => {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true`;

    https.get(url, { headers: { 'User-Agent': 'ListIt/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = (json.data || []).map((a) => ({
            titulo: a.title,
            imagen: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
            anio: a.year || (a.aired?.from ? new Date(a.aired.from).getFullYear() : null),
            descripcion: a.synopsis || '',
            episodios_totales: a.episodes || 0,
            tipo: 'anime',
          }));
          resolve(results);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
});
