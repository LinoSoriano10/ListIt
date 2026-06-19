const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const fs   = require('fs');
const { hacerBackupDiario, exportarBd } = require('./lib/backup');
const { generarXml, generarMarkdown }   = require('./lib/export');
const log  = require('./lib/logger');
const db   = require('./db');

// Backup diario antes de que la app abra la ventana
const dbPath = path.join(app.getPath('userData'), 'listit.db');
hacerBackupDiario(dbPath);

// Elimina el proceso GPU de Chromium (~50-100 MB de ahorro)
app.disableHardwareAcceleration();

// Flags de V8: optimizar para tamaño de código en lugar de velocidad
app.commandLine.appendSwitch('js-flags', '--optimize-for-size');
// Desactiva features de Chrome que no se usan y consumen memoria
app.commandLine.appendSwitch('disable-features', 'TranslateUI,AutofillServerCommunication,MediaRouter');

let mainWin       = null;
let detailWindow  = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  mainWin.loadFile('src/index.html');
}

/** Abre o reemplaza la ventana de detalle expandido (C.3). */
function abrirDetalleWindow(contenidoId) {
  if (detailWindow && !detailWindow.isDestroyed()) {
    detailWindow.webContents.send('detalle-cargar', contenidoId);
    detailWindow.focus();
    return;
  }
  detailWindow = new BrowserWindow({
    width: 720,
    height: 700,
    parent: mainWin,
    minWidth: 600,
    minHeight: 500,
    title: 'ListIt — Detalle',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  detailWindow.removeMenu();
  detailWindow.loadFile('src/detail-window.html');
  detailWindow.webContents.once('did-finish-load', () => {
    detailWindow.webContents.send('detalle-cargar', contenidoId);
  });
  detailWindow.on('closed', () => { detailWindow = null; });
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
  const newId = Number(r.lastInsertRowid);
  db.registrarActividad(newId, 'creado', item.titulo);
  log.info('creado:', item.titulo);
  return { lastInsertRowid: newId };
});

ipcMain.handle('actualizar-contenido', (_, item) => {
  const old = db.obtenerPorId(item.id);
  const result = db.actualizarContenido(item);
  if (old && old.estado !== item.estado) {
    db.registrarActividad(item.id, 'estado_cambio', `${old.estado} → ${item.estado}`);
    log.info(`estado: "${item.titulo}" ${old.estado} → ${item.estado}`);
  }
  return result;
});

// Vincular datos MAL a una entrada existente (campos MAL aparte del update normal).
ipcMain.handle('vincular-datos-mal', (_, { id, datos }) => {
  return db.vincularDatosMal(id, datos);
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
  const result  = db.toggleEntrega(id);
  const entrega = db.obtenerEntregaPorId(id);
  if (entrega) {
    const estado = entrega.visto ? 'visto' : 'no visto';
    db.registrarActividad(entrega.contenido_id, 'entrega_marcada',
      `${entrega.titulo || entrega.numero} → ${estado}`);
  }
  return result;
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

// ── Nombres alternativos ──────────────────────────────────────────────────────

ipcMain.handle('get-nombres', (_, contenidoId) => {
  return db.obtenerNombres(contenidoId);
});

ipcMain.handle('set-nombres', (_, { id, nombres }) => {
  return db.setNombres(id, nombres);
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

ipcMain.handle('estadisticas-generales', () => {
  return db.estadisticasGenerales();
});

ipcMain.handle('actividad-por-mes', (_, limite) => {
  return db.actividadPorMes(limite || 12);
});

ipcMain.handle('obtener-actividad', (_, limite) => {
  return db.obtenerActividad(limite || 30);
});

// ── Import atómico ────────────────────────────────────────────────────────────

ipcMain.handle('importar-entrada-completa', (_, { contenido, entregas, tipo }) => {
  return db.importarEntradaCompleta({ contenido, entregas, tipo });
});

// ── Settings ──────────────────────────────────────────────────────────────────

ipcMain.handle('get-setting', (_, key) => {
  return db.getSetting(key);
});

ipcMain.handle('set-setting', (_, { key, value }) => {
  return db.setSetting(key, value);
});

// ── Gestión de tags ───────────────────────────────────────────────────────────

ipcMain.handle('actualizar-tag', (_, { id, nombre }) => {
  return db.actualizarTag(id, nombre);
});

ipcMain.handle('contar-por-tag', () => {
  return db.contarPorTag();
});

// ── Exportación ───────────────────────────────────────────────────────────────

ipcMain.handle('exportar-xml', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar lista como XML',
    defaultPath: `listit-export-${new Date().toISOString().slice(0,10)}.xml`,
    filters: [{ name: 'Archivos XML', extensions: ['xml'] }],
  });
  if (canceled) return false;

  const items    = db.obtenerContenido({});
  const filas    = items.map(item => ({ item, entregas: db.obtenerEntregas(item.id) }));
  fs.writeFileSync(filePath, generarXml(filas), 'utf-8');
  return true;
});

ipcMain.handle('exportar-markdown', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar lista como Markdown',
    defaultPath: `listit-export-${new Date().toISOString().slice(0,10)}.md`,
    filters: [{ name: 'Archivos Markdown', extensions: ['md'] }],
  });
  if (canceled) return false;

  const items = db.obtenerContenido({});
  const filas = items.map(item => ({ item }));
  fs.writeFileSync(filePath, generarMarkdown(filas), 'utf-8');
  return true;
});

ipcMain.handle('exportar-bd', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar copia de seguridad de la BD',
    defaultPath: `listit-backup-${new Date().toISOString().slice(0,10)}.db`,
    filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }],
  });
  if (canceled) return false;
  exportarBd(dbPath, filePath);
  return true;
});

// ── A.4 Duplicados ────────────────────────────────────────────────────────────

ipcMain.handle('buscar-titulo-similar', (_, { titulo, excludeId }) => {
  return db.buscarPorTituloSimilar(titulo, excludeId);
});

// ── C.2 Reordenar entregas ────────────────────────────────────────────────────

ipcMain.handle('reordenar-entregas', (_, { contenidoId, idsOrdenados }) => {
  return db.reordenarEntregas(contenidoId, idsOrdenados);
});

// ── C.3 Ventana de detalle expandido ──────────────────────────────────────────

ipcMain.handle('abrir-detalle-expandido', (_, contenidoId) => {
  abrirDetalleWindow(contenidoId);
  return true;
});

ipcMain.handle('obtener-actividad-entrada', (_, { id, limite }) => {
  return db.obtenerActividadDeEntrada(id, limite || 20);
});

// ── C.3 / A.7 Actualización desde MAL ─────────────────────────────────────────
// El renderer hace el fetch a Jikan y pasa el JSON resultante.

ipcMain.handle('actualizar-desde-mal', (event, { id, mal }) => {
  const resultado = db.actualizarCamposMAL(id, mal);
  if (resultado.cambios.length > 0) {
    db.registrarActividad(id, 'mal_sync', `Actualizado: ${resultado.cambios.join(', ')}`);
  }
  // Refrescar las ventanas abiertas distintas de la que originó el cambio. La
  // ventana que dispara la actualización ya se recarga sola, y la sincronización
  // masiva corre en la principal y refresca al terminar, así evitamos recargar
  // la principal una vez por entrada durante el bucle.
  for (const win of [mainWin, detailWindow]) {
    if (win && !win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('detalle-refrescar', id);
    }
  }
  return resultado;
});

ipcMain.handle('obtener-entradas-con-mal-id', () => {
  return db.obtenerEntradasConMalId();
});
