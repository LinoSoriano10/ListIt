// Instantáneas de la biblioteca: construcción, validación, hash y compresión.
//
// Módulo puro — no toca SQLite ni Firebase, solo datos en memoria. El SQL vive
// en db.js (exportarSnapshot/importarSnapshot) y la red en firestore-sync.js,
// de modo que todo lo delicado de aquí (orden de tablas, forma del documento,
// detección de cambios) se puede testear sin el módulo nativo ni conexión.

const zlib   = require('zlib');
const crypto = require('crypto');

// v2 añadió tipos_contenido y contenido_generos. Las instantáneas v1 siguen
// aceptándose: si no, un ordenador ya actualizado rechazaría la copia subida
// desde otro que aún no lo esté, y la sincronización se rompería en silencio
// justo cuando más falta hace que funcione.
const VERSION = 2;
const VERSIONES_ACEPTADAS = [1, 2];

// Tablas que se sincronizan. `settings` queda FUERA a propósito: mezcla
// preferencias locales (tema, etiqueta por defecto) con marcas de migración
// (backfill_t1_titulo, cleanup_proximamente_v1) que describen el estado de
// ESTA instalación. Propagarlas daría por hecha en un ordenador una migración
// que allí no se ha ejecutado.
const TABLAS = [
  'contenido',
  'entregas',
  'tags',
  'contenido_tags',
  'contenido_nombres',
  'actividad',
  'tipos_contenido',
  'generos',
  'contenido_generos',
];

// Tablas que no existían en la v1. Si llegan ausentes se tratan como vacías en
// vez de invalidar la instantánea entera.
const TABLAS_OPCIONALES = new Set(['tipos_contenido', 'generos', 'contenido_generos']);

// `emisiones` queda deliberadamente fuera: es caché reconstruible desde AniList
// y ocuparía sitio en el documento de 1 MiB sin aportar nada que no se pueda
// volver a pedir.

// Orden de inserción: primero los padres, luego quien los referencia. El
// borrado usa el orden inverso. Respetarlo permite aplicar la instantánea con
// las claves foráneas activadas, que es la red de seguridad que queremos.
const ORDEN_INSERCION = [
  'tipos_contenido',
  'contenido',
  'tags',
  'generos',
  'entregas',
  'contenido_tags',
  'contenido_generos',
  'contenido_nombres',
  'actividad',
];

const ORDEN_BORRADO = [...ORDEN_INSERCION].reverse();

const LIMITE_FIRESTORE = 1048576; // 1 MiB por documento
// Margen para los metadatos del documento (hash, fechas, nombre del equipo).
const MARGEN_SEGURIDAD = 32 * 1024;

/**
 * Construye el documento de instantánea a partir de las filas ya leídas.
 */
function construir(tablas, extra = {}) {
  const datos = {};
  for (const t of TABLAS) datos[t] = tablas[t] || [];
  return {
    version: VERSION,
    generado_en: extra.generado_en || new Date().toISOString(),
    dispositivo: extra.dispositivo || '',
    tablas: datos,
  };
}

/**
 * Devuelve la instantánea con todas las tablas presentes. Una copia v1 no trae
 * las tablas añadidas en v2, y aplicarla debe dejarlas vacías, no fallar.
 */
function normalizar(snap) {
  const tablas = {};
  for (const t of TABLAS) tablas[t] = Array.isArray(snap?.tablas?.[t]) ? snap.tablas[t] : [];
  return { ...snap, version: VERSION, tablas };
}

/**
 * Comprueba que un documento descargado es utilizable ANTES de tocar la base de
 * datos local. Devuelve un array de problemas; vacío significa correcto.
 */
function validar(snap) {
  const fallos = [];
  if (!snap || typeof snap !== 'object') return ['La instantánea no es un objeto'];
  if (!VERSIONES_ACEPTADAS.includes(snap.version)) {
    fallos.push(`Versión de instantánea no soportada: ${snap.version} ` +
                `(aceptadas: ${VERSIONES_ACEPTADAS.join(', ')})`);
  }
  if (!snap.tablas || typeof snap.tablas !== 'object') {
    fallos.push('Falta el bloque de tablas');
    return fallos;
  }
  for (const t of TABLAS) {
    if (Array.isArray(snap.tablas[t])) continue;
    // Ausente y opcional: viene de una versión anterior, se dará por vacía.
    if (TABLAS_OPCIONALES.has(t) && snap.tablas[t] === undefined) continue;
    fallos.push(`La tabla "${t}" falta o no es una lista`);
  }
  if (fallos.length > 0) return fallos;

  // Integridad referencial mínima: aplicar una instantánea con referencias
  // rotas fallaría a mitad de transacción y sería más difícil de diagnosticar.
  const n = normalizar(snap);
  const ids    = new Set(n.tablas.contenido.map(c => c.id));
  const tagIds = new Set(n.tablas.tags.map(t => t.id));
  const genIds = new Set(n.tablas.generos.map(g => g.id));

  const huerfanas = n.tablas.entregas.filter(e => !ids.has(e.contenido_id)).length;
  if (huerfanas > 0) fallos.push(`${huerfanas} entrega(s) apuntan a series inexistentes`);

  const tagsRotos = n.tablas.contenido_tags.filter(
    r => !ids.has(r.contenido_id) || !tagIds.has(r.tag_id)
  ).length;
  if (tagsRotos > 0) fallos.push(`${tagsRotos} relación(es) de etiqueta con referencias rotas`);

  const generosRotos = n.tablas.contenido_generos.filter(
    r => !ids.has(r.contenido_id) || !genIds.has(r.genero_id)
  ).length;
  if (generosRotos > 0) fallos.push(`${generosRotos} relación(es) de género con referencias rotas`);

  return fallos;
}

/**
 * Hash del contenido, ignorando los metadatos volátiles (fecha de generación y
 * nombre del equipo). Dos instantáneas con los mismos datos dan el mismo hash,
 * que es lo que permite saber si algo cambió sin marcar cada escritura.
 */
function hash(snap) {
  const canonico = JSON.stringify({
    version: snap.version,
    tablas: Object.fromEntries(
      TABLAS.map(t => [t, (snap.tablas[t] || []).map(ordenarClaves)])
    ),
  });
  return crypto.createHash('sha256').update(canonico).digest('hex');
}

// Las claves de un objeto de SQLite llegan siempre en el mismo orden, pero no
// conviene depender de ello para algo que decide si se sobrescriben datos.
function ordenarClaves(fila) {
  const salida = {};
  for (const k of Object.keys(fila).sort()) salida[k] = fila[k];
  return salida;
}

function comprimir(snap) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(snap), 'utf8'), { level: 9 });
}

function descomprimir(buffer) {
  return JSON.parse(zlib.gunzipSync(Buffer.from(buffer)).toString('utf8'));
}

/**
 * ¿Cabe en un documento de Firestore? Se comprueba antes de subir para dar un
 * mensaje claro en lugar de un error opaco del SDK.
 */
function cabeEnFirestore(comprimido) {
  const util = LIMITE_FIRESTORE - MARGEN_SEGURIDAD;
  return {
    cabe: comprimido.length <= util,
    bytes: comprimido.length,
    limite: util,
    porcentaje: Math.round((comprimido.length / util) * 100),
  };
}

module.exports = {
  VERSION,
  TABLAS,
  ORDEN_INSERCION,
  ORDEN_BORRADO,
  LIMITE_FIRESTORE,
  VERSIONES_ACEPTADAS,
  TABLAS_OPCIONALES,
  construir,
  normalizar,
  validar,
  hash,
  comprimir,
  descomprimir,
  cabeEnFirestore,
};
