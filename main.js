const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');
const { hacerBackupDiario, exportarBd } = require('./lib/backup');
const log  = require('./lib/logger');
const db   = require('./db');
const proveedorMal = require('./lib/proveedor-mal');
const malOficial   = require('./lib/mal-oficial');
const sync         = require('./lib/firestore-sync');
const snapshot     = require('./lib/snapshot');
const anilist      = require('./lib/anilist');

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

// Borra del caché las imágenes que ya no usa ninguna entrada (entradas borradas o
// portadas cambiadas). Se ejecuta al arrancar; lo borrado se re-descarga al verse.
function limpiarHuerfanosCache() {
  try {
    const validos = new Set(
      db.obtenerImagenesUsadas()
        .filter(u => u && u.startsWith('http'))
        .map(u => path.basename(rutaCacheImagen(u)))
    );
    for (const f of fs.readdirSync(imgCacheDir)) {
      if (!validos.has(f)) fs.unlinkSync(path.join(imgCacheDir, f));
    }
  } catch { /* sin caché o BD aún */ }
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
  limpiarHuerfanosCache();
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

ipcMain.handle('set-emision-franquicia', (_, { id, estado }) => {
  return db.setEmisionFranquicia(id, estado);
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
  const result = db.guardarEntregaCompleta(entrega);
  return { ...result, reanudado: aplicarReanudacion(entrega.contenido_id) };
});

// ── Entregas ──────────────────────────────────────────────────────────────────

ipcMain.handle('get-entregas', (_, contenidoId) => {
  return db.obtenerEntregas(contenidoId);
});

ipcMain.handle('guardar-entrega', (_, entrega) => {
  const result = db.guardarEntrega(entrega);
  return { ...result, reanudado: aplicarReanudacion(entrega.contenido_id) };
});

// A.3: auto-completar una entrada cuando todas sus temporadas quedan completas.
function aplicarAutocompletado(contenidoId) {
  const auto = db.autocompletarSiProcede(contenidoId);
  if (auto) db.registrarActividad(contenidoId, 'estado_cambio', `${auto.antes} → completado`);
  return !!auto;
}

// B: transición automática de estado al tocar progreso directo (tick de
// temporada o +/- episodios): pendiente/en_pausa → viendo si no se completa,
// completado → viendo si deja de estarlo, o → completado si se completa.
function aplicarTransicionProgreso(contenidoId) {
  const t = db.actualizarEstadoPorProgreso(contenidoId);
  if (t) db.registrarActividad(contenidoId, 'estado_cambio', `${t.antes} → ${t.ahora}`);
  return !!t;
}

// Al añadir una temporada nueva, si la entrada estaba completada, reanudarla.
function aplicarReanudacion(contenidoId) {
  const r = db.revisarCompletadoTrasAnadir(contenidoId);
  if (r) db.registrarActividad(contenidoId, 'estado_cambio', `${r.antes} → pendiente`);
  return !!r;
}

ipcMain.handle('toggle-entrega', (_, id) => {
  const result  = db.toggleEntrega(id);
  const entrega = db.obtenerEntregaPorId(id);
  if (entrega) {
    const estado = entrega.visto ? 'visto' : 'no visto';
    db.registrarActividad(entrega.contenido_id, 'entrega_marcada',
      `${entrega.titulo || entrega.numero} → ${estado}`);
  }
  const cambioEstado = entrega ? aplicarTransicionProgreso(entrega.contenido_id) : false;
  return { ...result, cambioEstado };
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
  return { ...result, cambioEstado: e ? aplicarTransicionProgreso(e.contenido_id) : false };
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

// ── Camino B: temporadas anunciadas pero no emitidas ─────────────────────────────

ipcMain.handle('get-entregas-no-emitidas-candidatas', () => {
  return db.obtenerEntregasNoEmitidasCandidatas();
});

// Etiquetado one-shot: marca como no emitidas las entregas que el renderer ya
// confirmó contra MAL (estado "Not yet aired") y, como ahora dejan de bloquear,
// recomputa el completado de cada serie afectada. Devuelve cuántas se marcaron y
// cuántas entradas pasaron a 'completado' al desbloquearse.
ipcMain.handle('marcar-entregas-no-emitidas', (_, ids = []) => {
  const series = new Set();
  for (const id of ids) {
    const contenidoId = db.setNoEmitidoEntrega(id, 1);
    if (contenidoId) series.add(contenidoId);
  }
  let completadas = 0;
  for (const contenidoId of series) {
    if (aplicarAutocompletado(contenidoId)) completadas++;
  }
  return { marcadas: ids.length, completadas };
});

// Transición: una temporada no emitida empezó a emitir. Quita la marca, fija el
// total de episodios si MAL ya lo da, y si la entrada estaba 'completado' la baja
// a 'pendiente' (ahora sí hay contenido nuevo que ver).
ipcMain.handle('marcar-entrega-emitida', (_, { id, episodios_totales }) => {
  const contenidoId = db.marcarEntregaEmitida(id, episodios_totales || 0);
  const reanudado = contenidoId ? aplicarReanudacion(contenidoId) : false;
  return { contenidoId, reanudado };
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

ipcMain.handle('grafo-generos', () => {
  return db.grafoGeneros();
});

ipcMain.handle('estadisticas-ampliadas', () => {
  return db.estadisticasAmpliadas();
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

// ── Calendario de emisión ─────────────────────────────────────────────────────
// Los datos vienen de AniList, que publica la fecha exacta de cada episodio. La
// API oficial de MAL solo da un hueco semanal recurrente, y eso falla en cuanto
// una serie tiene un parón.
//
// Todo el refresco son dos consultas, sean 5 series o 50: una para traducir los
// mal_id a ids de AniList y otra para pedir los episodios de la ventana.
//
// El resultado se guarda en local a propósito: si AniList vuelve a desactivar su
// API, el calendario se queda viejo pero sigue sirviendo. Es la diferencia entre
// esto y depender de raspar webs.

const DIAS_ATRAS    = 30;
const DIAS_ADELANTE = 60;

ipcMain.handle('calendario-obtener', (_, { desde, hasta }) => {
  return db.obtenerCalendario(desde, hasta);
});

ipcMain.handle('calendario-refrescar', async () => {
  try {
    const entradas = db.entradasParaCalendario();
    if (entradas.length === 0) {
      return { ok: true, series: 0, episodios: 0 };
    }

    const ahora  = Math.floor(Date.now() / 1000);
    const ventana = {
      desde: ahora - DIAS_ATRAS * 86400,
      hasta: ahora + DIAS_ADELANTE * 86400,
    };

    const resueltos = await anilist.resolverIds(entradas.map(e => e.mal_id));
    const porMal    = new Map(resueltos.map(r => [r.malId, r]));

    // De id de AniList a entrada local, para repartir los episodios luego.
    const porAnilist = new Map();
    for (const e of entradas) {
      const r = porMal.get(e.mal_id);
      if (r) porAnilist.set(r.anilistId, e);
    }
    if (porAnilist.size === 0) {
      return { ok: true, series: 0, episodios: 0, sinCorrespondencia: entradas.length };
    }

    const episodios = await anilist.calendarioEnVentana(
      [...porAnilist.keys()], ventana.desde, ventana.hasta);

    const agrupados = new Map();
    for (const ep of episodios) {
      if (!agrupados.has(ep.anilistId)) agrupados.set(ep.anilistId, []);
      agrupados.get(ep.anilistId).push({ episodio: ep.episodio, fecha_utc: ep.fecha_utc });
    }

    // Se guardan también las series sin episodios en la ventana: así queda
    // registrado su anilist_id y la marca de refresco.
    let total = 0;
    for (const [anilistId, entrada] of porAnilist) {
      const lista = agrupados.get(anilistId) || [];
      db.guardarEmisiones(entrada.id, lista, anilistId, ventana);
      total += lista.length;
    }

    log.info(`calendario: ${total} episodios de ${porAnilist.size} series`);
    return { ok: true, series: porAnilist.size, episodios: total,
             sinCorrespondencia: entradas.length - porAnilist.size };
  } catch (err) {
    return {
      ok: false,
      codigo:  err?.codigo  || 'desconocido',
      mensaje: err?.message || String(err),
    };
  }
});

// ── Tipos de contenido ────────────────────────────────────────────────────────
// `obtener` incluye el recuento de uso: la interfaz decide con él qué tipos
// enseñar, sin que el usuario tenga que configurar nada.

ipcMain.handle('tipos-obtener', () => db.obtenerTiposConUso());

ipcMain.handle('tipos-actualizar', (_, { clave, campos }) => {
  db.actualizarTipo(clave, campos);
  return db.obtenerTiposConUso();
});

// ── Consultas a MyAnimeList ───────────────────────────────────────────────────
// Las llamadas de red salen del proceso principal, no del renderer: así el
// Client ID nunca llega a la ventana y la CSP no necesita abrirse a dominios
// externos. La fuente principal es la API oficial y Jikan queda de reserva.
//
// Los errores NO se lanzan: al cruzar el puente IPC, Electron aplasta el objeto
// Error y se pierde el `codigo` que la UI necesita para dar un mensaje útil. Se
// devuelve un resultado explícito { ok, ... } en su lugar.

async function resultadoMal(operacion) {
  try {
    return { ok: true, ...(await operacion()) };
  } catch (err) {
    return {
      ok: false,
      codigo:  err?.codigo  || 'desconocido',
      mensaje: err?.message || String(err),
    };
  }
}

ipcMain.handle('mal-buscar', (_, { query, limite }) =>
  resultadoMal(() => proveedorMal.buscar(query, limite || 8)));

ipcMain.handle('mal-detalle', (_, malId) =>
  resultadoMal(() => proveedorMal.detalle(malId)));

ipcMain.handle('mal-relaciones', (_, malId) =>
  resultadoMal(() => proveedorMal.relaciones(malId)));

// ── Credencial de MyAnimeList ─────────────────────────────────────────────────
// El Client ID solo entra; nunca sale hacia el renderer. La UI solo recibe si
// está configurado o no.

ipcMain.handle('mal-credencial-estado', () => ({
  configurado: malOficial.configurado(),
  cifrado:     require('./lib/credenciales').cifradoDisponible(),
}));

ipcMain.handle('mal-credencial-guardar', async (_, clientId) => {
  try {
    await malOficial.probarClientId(clientId);
    malOficial.guardarClientId(clientId);
    log.info('Client ID de MyAnimeList guardado');
    return { ok: true };
  } catch (err) {
    return { ok: false, codigo: err?.codigo || 'desconocido', mensaje: err?.message || String(err) };
  }
});

ipcMain.handle('mal-credencial-borrar', () => {
  malOficial.borrarClientId();
  log.info('Client ID de MyAnimeList borrado');
  return { ok: true };
});

// ── A.7 Actualización desde MAL ───────────────────────────────────────────────
// El renderer pide los datos por IPC (arriba) y pasa el JSON resultante.

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

// ── Sincronización con Firestore (opcional) ───────────────────────────────────
// Modelo de instantánea completa: la biblioteca entera viaja como un único
// documento comprimido. El último en escribir gana sobre el conjunto, así que
// todo el cuidado está en detectar cuándo eso destruiría algo.
//
// Marcas de agua locales, en la tabla `settings` (que NO se sincroniza):
//   sync_hash  → hash del contenido en la última sincronización correcta
//   sync_fecha → cuándo fue
// Si el hash local difiere de sync_hash, hay cambios locales sin subir. Si el
// remoto difiere de sync_hash, alguien subió desde otro equipo. Ambos a la vez
// es un conflicto y se pregunta antes de pisar nada.

const os = require('os');

function instantaneaLocal() {
  const snap = db.exportarSnapshot(os.hostname());
  return { snap, hash: snapshot.hash(snap) };
}

function marcaAgua() {
  return {
    hash:  db.getSetting('sync_hash')  || null,
    fecha: db.getSetting('sync_fecha') || null,
  };
}

function anotarSync(hash) {
  db.setSetting('sync_hash', hash);
  db.setSetting('sync_fecha', new Date().toISOString());
}

// Copia de seguridad antes de sustituir la biblioteca. Reutiliza exportarBd,
// el mismo mecanismo del backup diario.
function copiaAntesDeImportar() {
  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(dir, `listit-pre-sync-${sello}.db`);
  exportarBd(dbPath, destino);
  log.info('backup previo a importar:', destino);
  return destino;
}

async function resultadoSync(operacion) {
  try {
    return { ok: true, ...(await operacion()) };
  } catch (err) {
    return {
      ok: false,
      codigo:  err?.codigo  || 'desconocido',
      mensaje: err?.message || String(err),
    };
  }
}

ipcMain.handle('sync-estado', () => {
  const base = sync.estado();
  if (!base.configurado) return { ...base, hayCambiosLocales: false };

  const { hash } = instantaneaLocal();
  const marca = marcaAgua();
  return {
    ...base,
    ultimaFecha:       marca.fecha,
    hayCambiosLocales: marca.hash !== hash,
    nuncaSincronizado: marca.hash === null,
    resumen:           db.resumenBiblioteca(),
  };
});

ipcMain.handle('sync-configurar', (_, { config, email, password }) =>
  resultadoSync(() => sync.configurar({ config, email, password })));

ipcMain.handle('sync-desactivar', () => {
  sync.desactivar();
  // Las marcas de agua dejan de tener sentido sin destino con el que compararlas.
  db.setSetting('sync_hash', '');
  db.setSetting('sync_fecha', '');
  log.info('sincronización desactivada');
  return { ok: true };
});

ipcMain.handle('sync-subir', (_, { forzar } = {}) => resultadoSync(async () => {
  const { snap, hash } = instantaneaLocal();
  const marca = marcaAgua();

  // ¿Ha subido alguien más desde la última vez que sincronizamos?
  const remoto = await sync.bajar();
  if (remoto && !forzar && remoto.hash !== hash && remoto.hash !== marca.hash) {
    return {
      conflicto: true,
      motivo: 'remoto-mas-nuevo',
      remoto: {
        dispositivo: remoto.dispositivo,
        generado_en: remoto.generado_en,
      },
    };
  }

  if (remoto && remoto.hash === hash) {
    anotarSync(hash);
    return { sinCambios: true, hash };
  }

  const comprimido = snapshot.comprimir(snap);
  const medida = snapshot.cabeEnFirestore(comprimido);
  if (!medida.cabe) {
    throw Object.assign(
      new Error(
        `La biblioteca comprimida ocupa ${(medida.bytes / 1024).toFixed(0)} KB y ` +
        `Firestore admite como mucho ${(medida.limite / 1024).toFixed(0)} KB por documento`),
      { codigo: 'demasiado-grande' },
    );
  }

  const r = await sync.subir(comprimido, {
    version: snap.version,
    hash,
    generado_en: snap.generado_en,
    dispositivo: snap.dispositivo,
  });
  anotarSync(hash);
  log.info(`sincronización: subidos ${medida.bytes} bytes (${medida.porcentaje}% del límite)`);
  return { subido: true, bytes: r.bytes, porcentaje: medida.porcentaje, hash };
}));

ipcMain.handle('sync-bajar', (_, { forzar } = {}) => resultadoSync(async () => {
  const remoto = await sync.bajar();
  if (!remoto) {
    throw Object.assign(new Error('Todavía no hay ninguna copia en la nube'),
      { codigo: 'no-existe' });
  }

  const { hash } = instantaneaLocal();
  if (remoto.hash === hash) {
    anotarSync(hash);
    return { sinCambios: true };
  }

  // ¿Hay cambios locales que aún no se han subido? Bajar los destruiría.
  const marca = marcaAgua();
  if (!forzar && marca.hash !== hash) {
    return {
      conflicto: true,
      motivo: 'cambios-locales',
      remoto: { dispositivo: remoto.dispositivo, generado_en: remoto.generado_en },
    };
  }

  const copia = copiaAntesDeImportar();
  const snap = snapshot.descomprimir(remoto.datos);
  const resumen = db.importarSnapshot(snap);
  anotarSync(remoto.hash);

  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('biblioteca-recargada');
  log.info('sincronización: biblioteca sustituida desde la nube');
  return { importado: true, resumen, copia, remoto: {
    dispositivo: remoto.dispositivo, generado_en: remoto.generado_en } };
}));
