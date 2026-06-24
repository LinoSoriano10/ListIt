const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');
const { hacerBackupDiario, exportarBd } = require('./lib/backup');
const log  = require('./lib/logger');
const db   = require('./db');

// Backup diario antes de que la app abra la ventana
const dbPath = path.join(app.getPath('userData'), 'listit.db');
hacerBackupDiario(dbPath);

// B.5: caché local de imágenes, servido por el esquema propio imgcache://.
const imgCacheDir = path.join(app.getPath('userData'), 'img-cache');
protocol.registerSchemesAsPrivileged([
  { scheme: 'imgcache', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function rutaCacheImagen(url) {
  const m   = url.match(/\.(jpe?g|png|webp|gif)(?:[?#]|$)/i);
  const ext = m ? m[1].toLowerCase() : 'jpg';
  return path.join(imgCacheDir, crypto.createHash('sha1').update(url).digest('hex') + '.' + ext);
}

function tipoMimeImagen(file) {
  if (file.endsWith('.png'))  return 'image/png';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.gif'))  return 'image/gif';
  return 'image/jpeg';
}

// Elimina el proceso GPU de Chromium (~50-100 MB de ahorro)
app.disableHardwareAcceleration();

// Flags de V8: optimizar para tamaño de código en lugar de velocidad
app.commandLine.appendSwitch('js-flags', '--optimize-for-size');
// Desactiva features de Chrome que no se usan y consumen memoria
app.commandLine.appendSwitch('disable-features', 'TranslateUI,AutofillServerCommunication,MediaRouter');

let mainWin       = null;

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

// Endurecimiento de navegación (buenas prácticas de seguridad de Electron):
// la app no abre ventanas con window.open ni navega fuera de sus ficheros
// locales, así que bloqueamos ambas cosas por si algún contenido inesperado
// lo intentara. Se registra antes de crear ventanas para cubrirlas todas.
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
});

app.whenReady().then(() => {
  fs.mkdirSync(imgCacheDir, { recursive: true });
  // Sirve imgcache://i/<base64url-de-la-URL>: descarga al caché la 1ª vez y luego
  // lo lee de disco. Si falla la caché, cae a buscar la URL remota directamente.
  protocol.handle('imgcache', async (request) => {
    const b64 = request.url.replace(/^imgcache:\/\/i\//, '');
    let real;
    try { real = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
    catch { return new Response(null, { status: 400 }); }
    const file = rutaCacheImagen(real);
    try {
      if (!fs.existsSync(file)) {
        const resp = await net.fetch(real);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        await fs.promises.writeFile(file, Buffer.from(await resp.arrayBuffer()));
      }
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'Content-Type': tipoMimeImagen(file) } });
    } catch {
      try { return await net.fetch(real); } catch { return new Response(null, { status: 404 }); }
    }
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC handlers ---

ipcMain.handle('vaciar-cache-imagenes', () => {
  try { for (const f of fs.readdirSync(imgCacheDir)) fs.unlinkSync(path.join(imgCacheDir, f)); }
  catch { /* no hay nada que vaciar */ }
  return true;
});

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

// A.3: auto-completar una entrada cuando todas sus temporadas quedan completas.
function aplicarAutocompletado(contenidoId) {
  const auto = db.autocompletarSiProcede(contenidoId);
  if (auto) db.registrarActividad(contenidoId, 'estado_cambio', `${auto.antes} → completado`);
  return !!auto;
}

ipcMain.handle('toggle-entrega', (_, id) => {
  const result  = db.toggleEntrega(id);
  const entrega = db.obtenerEntregaPorId(id);
  if (entrega) {
    const estado = entrega.visto ? 'visto' : 'no visto';
    db.registrarActividad(entrega.contenido_id, 'entrega_marcada',
      `${entrega.titulo || entrega.numero} → ${estado}`);
  }
  const autocompletado = entrega ? aplicarAutocompletado(entrega.contenido_id) : false;
  return { ...result, autocompletado };
});

ipcMain.handle('renombrar-entrega', (_, { id, titulo }) => {
  return db.renombrarEntrega(id, titulo);
});

ipcMain.handle('renombrar-numero', (_, { id, numero }) => {
  return db.renombrarNumero(id, numero);
});

ipcMain.handle('ep-entrega-delta', (_, { id, delta }) => {
  const result = db.actualizarEpEntrega(id, delta);
  const e = db.obtenerEntregaPorId(id);
  return { ...result, autocompletado: e ? aplicarAutocompletado(e.contenido_id) : false };
});

ipcMain.handle('set-ep-total-entrega', (_, { id, total }) => {
  const result = db.setEpTotalEntrega(id, total);
  const e = db.obtenerEntregaPorId(id);
  return { ...result, autocompletado: e ? aplicarAutocompletado(e.contenido_id) : false };
});

ipcMain.handle('eliminar-entrega', (_, id) => {
  const e = db.obtenerEntregaPorId(id);
  const result = db.eliminarEntrega(id);
  return { ...result, autocompletado: e ? aplicarAutocompletado(e.contenido_id) : false };
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

// ── A.7 Actualización desde MAL ───────────────────────────────────────────────
// El renderer hace el fetch a Jikan y pasa el JSON resultante.

ipcMain.handle('actualizar-desde-mal', (event, { id, mal }) => {
  const resultado = db.actualizarCamposMAL(id, mal);
  if (resultado.cambios.length > 0) {
    db.registrarActividad(id, 'mal_sync', `Actualizado: ${resultado.cambios.join(', ')}`);
  }
  // Refrescar la ventana principal si no fue ella quien originó el cambio (la
  // sincronización masiva corre en la principal y refresca al terminar, así
  // evitamos recargarla una vez por entrada durante el bucle).
  if (mainWin && !mainWin.isDestroyed() && mainWin.webContents !== event.sender) {
    mainWin.webContents.send('detalle-refrescar', id);
  }
  return resultado;
});

ipcMain.handle('obtener-entradas-con-mal-id', () => {
  return db.obtenerEntradasConMalId();
});
