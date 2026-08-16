// Instantáneas de la biblioteca: construcción, validación, hash y compresión.
//
// Módulo puro — no toca SQLite ni Firebase, solo datos en memoria. El SQL vive
// en db.js (exportarSnapshot/importarSnapshot) y la red en firestore-sync.js,
// de modo que todo lo delicado de aquí (orden de tablas, forma del documento,
// detección de cambios) se puede testear sin el módulo nativo ni conexión.

const zlib   = require('zlib');
const crypto = require('crypto');

const VERSION = 1;

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
];

// Orden de inserción: primero los padres, luego quien los referencia. El
// borrado usa el orden inverso. Respetarlo permite aplicar la instantánea con
// las claves foráneas activadas, que es la red de seguridad que queremos.
const ORDEN_INSERCION = [
  'contenido',
  'tags',
  'entregas',
  'contenido_tags',
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
 * Comprueba que un documento descargado es utilizable ANTES de tocar la base de
 * datos local. Devuelve un array de problemas; vacío significa correcto.
 */
function validar(snap) {
  const fallos = [];
  if (!snap || typeof snap !== 'object') return ['La instantánea no es un objeto'];
  if (snap.version !== VERSION) {
    fallos.push(`Versión de instantánea no soportada: ${snap.version} (esperada ${VERSION})`);
  }
  if (!snap.tablas || typeof snap.tablas !== 'object') {
    fallos.push('Falta el bloque de tablas');
    return fallos;
  }
  for (const t of TABLAS) {
    if (!Array.isArray(snap.tablas[t])) fallos.push(`La tabla "${t}" falta o no es una lista`);
  }
  if (fallos.length > 0) return fallos;

  // Integridad referencial mínima: aplicar una instantánea con referencias
  // rotas fallaría a mitad de transacción y sería más difícil de diagnosticar.
  const ids = new Set(snap.tablas.contenido.map(c => c.id));
  const tagIds = new Set(snap.tablas.tags.map(t => t.id));
  const huerfanas = snap.tablas.entregas.filter(e => !ids.has(e.contenido_id)).length;
  if (huerfanas > 0) fallos.push(`${huerfanas} entrega(s) apuntan a series inexistentes`);
  const tagsRotos = snap.tablas.contenido_tags.filter(
    r => !ids.has(r.contenido_id) || !tagIds.has(r.tag_id)
  ).length;
  if (tagsRotos > 0) fallos.push(`${tagsRotos} relación(es) de etiqueta con referencias rotas`);

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
  construir,
  validar,
  hash,
  comprimir,
  descomprimir,
  cabeEnFirestore,
};
