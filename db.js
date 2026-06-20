const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'listit.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

db.prepare(`
  CREATE TABLE IF NOT EXISTS contenido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'anime',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    episodio_actual INTEGER DEFAULT 0,
    episodios_totales INTEGER DEFAULT 0,
    descripcion TEXT DEFAULT '',
    anio INTEGER,
    imagen TEXT DEFAULT '',
    fecha_inicio TEXT DEFAULT '',
    fecha_fin TEXT DEFAULT ''
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS entregas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contenido_id INTEGER NOT NULL,
    numero TEXT NOT NULL DEFAULT '1',
    titulo TEXT DEFAULT '',
    visto INTEGER DEFAULT 0,
    FOREIGN KEY (contenido_id) REFERENCES contenido(id) ON DELETE CASCADE
  )
`).run();

// Migración: añadir updated_at a contenido si no existe
{
  const cols = db.prepare('PRAGMA table_info(contenido)').all().map(c => c.name);
  if (!cols.includes('updated_at')) {
    db.prepare("ALTER TABLE contenido ADD COLUMN updated_at TEXT DEFAULT (datetime('now','localtime'))").run();
    db.prepare("UPDATE contenido SET updated_at = datetime('now','localtime') WHERE updated_at IS NULL").run();
  }

  // Migración v2: columnas MAL (para C.3 ventana expandida y A.7 sincronización)
  const malCols = {
    mal_id:            'INTEGER',
    score_mal:         'REAL',
    mal_rank:          'INTEGER',
    fecha_estreno:     "TEXT DEFAULT ''",
    fecha_fin_emision: "TEXT DEFAULT ''",
    estado_emision:    "TEXT DEFAULT ''",
    estudio:           "TEXT DEFAULT ''",
    duracion_ep:       "TEXT DEFAULT ''",
  };
  for (const [name, type] of Object.entries(malCols)) {
    if (!cols.includes(name)) {
      db.prepare(`ALTER TABLE contenido ADD COLUMN ${name} ${type}`).run();
    }
  }
}

// Migración: añadir columnas de episodios por entrega si no existen
{
  const cols = db.prepare('PRAGMA table_info(entregas)').all().map(c => c.name);
  if (!cols.includes('episodio_actual')) {
    db.prepare('ALTER TABLE entregas ADD COLUMN episodio_actual INTEGER DEFAULT 0').run();
  }
  if (!cols.includes('episodios_totales')) {
    db.prepare('ALTER TABLE entregas ADD COLUMN episodios_totales INTEGER DEFAULT 0').run();
  }
  if (!cols.includes('posicion')) {
    db.prepare('ALTER TABLE entregas ADD COLUMN posicion INTEGER DEFAULT 0').run();
    // Inicializar posicion = id para preservar el orden actual de las entregas existentes
    db.prepare('UPDATE entregas SET posicion = id WHERE posicion = 0 OR posicion IS NULL').run();
  }
  // F0 temporadas: identidad MAL por entrega (para extender temporadas y evitar duplicados)
  if (!cols.includes('mal_id')) {
    db.prepare('ALTER TABLE entregas ADD COLUMN mal_id INTEGER').run();
  }
}

// Migración: si numero era INTEGER en una instalación anterior, convertir a TEXT
{
  const cols = db.prepare('PRAGMA table_info(entregas)').all();
  const numCol = cols.find(c => c.name === 'numero');
  if (numCol && numCol.type.toUpperCase() === 'INTEGER') {
    db.transaction(() => {
      db.prepare('ALTER TABLE entregas RENAME TO _entregas_bak').run();
      db.prepare(`
        CREATE TABLE entregas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          contenido_id INTEGER NOT NULL,
          numero TEXT NOT NULL DEFAULT '1',
          titulo TEXT DEFAULT '',
          visto INTEGER DEFAULT 0,
          FOREIGN KEY (contenido_id) REFERENCES contenido(id) ON DELETE CASCADE
        )
      `).run();
      db.prepare('INSERT INTO entregas SELECT id, contenido_id, CAST(numero AS TEXT), titulo, visto FROM _entregas_bak').run();
      db.prepare('DROP TABLE _entregas_bak').run();
    })();
  }
}

// ── Tags ───────────────────────────────────────────────────────────────────────

db.prepare(`
  CREATE TABLE IF NOT EXISTS tags (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS contenido_tags (
    contenido_id INTEGER NOT NULL,
    tag_id       INTEGER NOT NULL,
    PRIMARY KEY (contenido_id, tag_id),
    FOREIGN KEY (contenido_id) REFERENCES contenido(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)       REFERENCES tags(id)      ON DELETE CASCADE
  )
`).run();

// Etiquetas predefinidas: su nombre es semántico (la UI depende de 'pelicula'
// literalmente), por eso no se pueden renombrar ni eliminar.
const TAGS_BUILTIN = ['anime', 'serie', 'pelicula'];

// Seed: tags por defecto
for (const nombre of TAGS_BUILTIN) {
  db.prepare('INSERT OR IGNORE INTO tags (nombre) VALUES (?)').run(nombre);
}

// Migración one-shot: convertir columna `tipo` existente al nuevo sistema de tags
{
  const totalContenido = db.prepare('SELECT COUNT(*) as n FROM contenido').get().n;
  const totalLinks     = db.prepare('SELECT COUNT(*) as n FROM contenido_tags').get().n;

  if (totalContenido > 0 && totalLinks === 0) {
    db.transaction(() => {
      const filas = db.prepare('SELECT id, tipo FROM contenido').all();
      for (const fila of filas) {
        const tag = db.prepare('SELECT id FROM tags WHERE nombre = ?').get(fila.tipo);
        if (tag) {
          db.prepare('INSERT OR IGNORE INTO contenido_tags (contenido_id, tag_id) VALUES (?, ?)').run(fila.id, tag.id);
        }
      }
    })();
  }
}

// ── Contenido ──────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los items aplicando los filtros dados.
 * Cada item incluye: `tags` (array), `nombres` (array), `total_entregas`,
 * `entregas_vistas` y `entrega_en_curso_id`.
 * @param {{ estado?: string, tag?: string, orden?: 'reciente'|'alfabetico' }} filtros
 * @returns {object[]}
 */
function obtenerContenido({ estado, tag, orden } = {}) {
  const conditions = [];
  const params = [];

  if (estado && estado !== 'todos') {
    conditions.push('c.estado = ?');
    params.push(estado);
  }
  if (tag) {
    conditions.push(`c.id IN (
      SELECT ct.contenido_id FROM contenido_tags ct
      JOIN tags t ON t.id = ct.tag_id
      WHERE t.nombre = ?
    )`);
    params.push(tag);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Mapa de órdenes. SQLite no soporta `NULLS LAST` directamente,
  // se simula con `(col IS NULL)` que ordena los NULL al final.
  const ORDER_MAP = {
    reciente:   'c.updated_at DESC, c.id DESC',
    alfabetico: 'c.titulo ASC',
    anio:       '(c.anio IS NULL) ASC, c.anio DESC, c.titulo ASC',
    // Cálculo de % completado como expresión en el ORDER BY:
    completado: `(
      CASE
        WHEN (SELECT COUNT(*) FROM entregas e WHERE e.contenido_id = c.id) > 0
          THEN CAST((SELECT SUM(e.visto) FROM entregas e WHERE e.contenido_id = c.id) AS REAL)
               / (SELECT COUNT(*) FROM entregas e WHERE e.contenido_id = c.id)
        WHEN c.episodios_totales > 0
          THEN CAST(c.episodio_actual AS REAL) / c.episodios_totales
        ELSE 0
      END
    ) DESC, c.titulo ASC`,
  };
  const orderBy = ORDER_MAP[orden] || ORDER_MAP.reciente;

  const rows = db.prepare(`
    SELECT c.*,
      COALESCE((SELECT COUNT(*) FROM entregas e WHERE e.contenido_id = c.id), 0)   AS total_entregas,
      COALESCE((SELECT SUM(e.visto) FROM entregas e WHERE e.contenido_id = c.id), 0) AS entregas_vistas,
      COALESCE((
        SELECT e.id FROM entregas e
        WHERE e.contenido_id = c.id
          AND (e.episodios_totales = 0 OR e.episodio_actual < e.episodios_totales)
        ORDER BY e.posicion ASC, e.id ASC LIMIT 1
      ), 0) AS entrega_en_curso_id,
      (SELECT e.numero FROM entregas e
        WHERE e.contenido_id = c.id
          AND (e.episodios_totales = 0 OR e.episodio_actual < e.episodios_totales)
        ORDER BY e.posicion ASC, e.id ASC LIMIT 1) AS entrega_en_curso_numero,
      COALESCE((SELECT e.episodio_actual FROM entregas e
        WHERE e.contenido_id = c.id
          AND (e.episodios_totales = 0 OR e.episodio_actual < e.episodios_totales)
        ORDER BY e.posicion ASC, e.id ASC LIMIT 1), 0) AS entrega_en_curso_ep_actual,
      COALESCE((SELECT e.episodios_totales FROM entregas e
        WHERE e.contenido_id = c.id
          AND (e.episodios_totales = 0 OR e.episodio_actual < e.episodios_totales)
        ORDER BY e.posicion ASC, e.id ASC LIMIT 1), 0) AS entrega_en_curso_ep_total,
      COALESCE((SELECT e.episodio_actual FROM entregas e
        WHERE e.contenido_id = c.id
        ORDER BY e.posicion ASC, e.id ASC LIMIT 1), 0) AS primera_ep_actual,
      COALESCE((SELECT e.episodios_totales FROM entregas e
        WHERE e.contenido_id = c.id
        ORDER BY e.posicion ASC, e.id ASC LIMIT 1), 0) AS primera_ep_total,
      (SELECT GROUP_CONCAT(t.nombre, ',')
         FROM tags t JOIN contenido_tags ct ON ct.tag_id = t.id
         WHERE ct.contenido_id = c.id ORDER BY t.nombre)  AS tags_csv,
      (SELECT GROUP_CONCAT(n.nombre, ',')
         FROM contenido_nombres n
         WHERE n.contenido_id = c.id ORDER BY n.id)       AS nombres_csv
    FROM contenido c
    ${where}
    ORDER BY ${orderBy}
  `).all(...params);

  return rows.map(r => ({
    ...r,
    tags:    r.tags_csv    ? r.tags_csv.split(',')    : [],
    nombres: r.nombres_csv ? r.nombres_csv.split(',') : [],
  }));
}

/** @param {number} id @returns {object|null} Item con campo `tags` (array) o null si no existe. */
function obtenerPorId(id) {
  const row = db.prepare(`
    SELECT c.*, GROUP_CONCAT(DISTINCT t.nombre) AS tags_csv
    FROM contenido c
    LEFT JOIN contenido_tags ct ON ct.contenido_id = c.id
    LEFT JOIN tags t            ON t.id = ct.tag_id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(id);
  if (!row) return null;
  return { ...row, tags: row.tags_csv ? row.tags_csv.split(',') : [] };
}

/**
 * Inserta un nuevo item. Devuelve el resultado de `run()` con `lastInsertRowid`.
 * @param {object} item
 * @returns {import('better-sqlite3').RunResult}
 */
function guardarContenido(item) {
  return db.prepare(`
    INSERT INTO contenido
      (titulo, tipo, estado, episodio_actual, episodios_totales, descripcion, anio, imagen, fecha_inicio, fecha_fin, updated_at,
       mal_id, score_mal, mal_rank, fecha_estreno, fecha_fin_emision, estado_emision, estudio, duracion_ep)
    VALUES
      (@titulo, @tipo, @estado, @episodio_actual, @episodios_totales, @descripcion, @anio, @imagen, @fecha_inicio, @fecha_fin, datetime('now','localtime'),
       @mal_id, @score_mal, @mal_rank, @fecha_estreno, @fecha_fin_emision, @estado_emision, @estudio, @duracion_ep)
  `).run({
    mal_id: null, score_mal: null, mal_rank: null,
    fecha_estreno: '', fecha_fin_emision: '', estado_emision: '',
    estudio: '', duracion_ep: '',
    ...item,
    tipo: item.tipo || 'anime',
  });
}

function actualizarContenido(item) {
  return db.prepare(`
    UPDATE contenido SET
      titulo            = @titulo,
      tipo              = @tipo,
      estado            = @estado,
      episodio_actual   = @episodio_actual,
      episodios_totales = @episodios_totales,
      descripcion       = @descripcion,
      anio              = @anio,
      imagen            = @imagen,
      fecha_inicio      = @fecha_inicio,
      fecha_fin         = @fecha_fin,
      updated_at        = datetime('now','localtime')
    WHERE id = @id
  `).run({ ...item, tipo: item.tipo || 'anime' });
}

/**
 * Persiste SOLO los campos MAL de una entrada existente.
 * Lo usa el modal de edición cuando se vincula MyAnimeList a una entrada ya
 * creada (el alta los guarda en `guardarContenido`). A propósito está separado de
 * `actualizarContenido`: así las operaciones de progreso/estado, que llaman a
 * `actualizarContenido` con datos potencialmente cacheados, nunca pisan estos campos.
 * @param {number} id
 * @param {object} datos objeto con los campos MAL (p. ej. el item del modal)
 */
function vincularDatosMal(id, datos = {}) {
  return db.prepare(`
    UPDATE contenido SET
      mal_id            = @mal_id,
      score_mal         = @score_mal,
      mal_rank          = @mal_rank,
      fecha_estreno     = @fecha_estreno,
      fecha_fin_emision = @fecha_fin_emision,
      estado_emision    = @estado_emision,
      estudio           = @estudio,
      duracion_ep       = @duracion_ep,
      updated_at        = datetime('now','localtime')
    WHERE id = @id
  `).run({
    id,
    mal_id:            datos.mal_id            ?? null,
    score_mal:         datos.score_mal         ?? null,
    mal_rank:          datos.mal_rank          ?? null,
    fecha_estreno:     datos.fecha_estreno     ?? '',
    fecha_fin_emision: datos.fecha_fin_emision ?? '',
    estado_emision:    datos.estado_emision    ?? '',
    estudio:           datos.estudio           ?? '',
    duracion_ep:       datos.duracion_ep       ?? '',
  });
}

function eliminarContenido(id) {
  return db.prepare('DELETE FROM contenido WHERE id = ?').run(id);
}

function contarPorEstado() {
  return db.prepare('SELECT estado, COUNT(*) as total FROM contenido GROUP BY estado').all();
}

// ── Tags ───────────────────────────────────────────────────────────────────────

function obtenerTags() {
  return db.prepare('SELECT * FROM tags ORDER BY nombre ASC').all();
}

function crearTag(nombre) {
  const n = nombre.trim().toLowerCase();
  db.prepare('INSERT OR IGNORE INTO tags (nombre) VALUES (?)').run(n);
  return db.prepare('SELECT * FROM tags WHERE nombre = ?').get(n);
}

function eliminarTag(id) {
  // No permitir eliminar etiquetas predefinidas (defensa a nivel de datos).
  const actual = db.prepare('SELECT nombre FROM tags WHERE id = ?').get(id);
  if (actual && TAGS_BUILTIN.includes(actual.nombre)) return { changes: 0 };
  return db.prepare('DELETE FROM tags WHERE id = ?').run(id);
}

function getTagsContenido(contenidoId) {
  return db.prepare(`
    SELECT t.id, t.nombre FROM tags t
    JOIN contenido_tags ct ON ct.tag_id = t.id
    WHERE ct.contenido_id = ?
    ORDER BY t.nombre ASC
  `).all(contenidoId);
}

function setTagsContenido(contenidoId, tagIds) {
  db.transaction(() => {
    db.prepare('DELETE FROM contenido_tags WHERE contenido_id = ?').run(contenidoId);
    for (const tagId of tagIds) {
      db.prepare('INSERT OR IGNORE INTO contenido_tags (contenido_id, tag_id) VALUES (?, ?)').run(contenidoId, tagId);
    }
  })();
}

// ── Entregas ───────────────────────────────────────────────────────────────────

function obtenerEntregas(contenidoId) {
  return db.prepare(`
    SELECT * FROM entregas
    WHERE contenido_id = ?
    ORDER BY posicion ASC, id ASC
  `).all(contenidoId);
}

/**
 * Reordena las entregas de un contenido según el array `idsOrdenados`.
 * El primer id del array recibe posicion=1, el segundo 2, etc.
 * Transaccional.
 * @param {number} contenidoId
 * @param {number[]} idsOrdenados
 */
function reordenarEntregas(contenidoId, idsOrdenados) {
  const stmt = db.prepare('UPDATE entregas SET posicion = ? WHERE id = ? AND contenido_id = ?');
  db.transaction(() => {
    idsOrdenados.forEach((id, i) => stmt.run(i + 1, id, contenidoId));
  })();
}

function guardarEntrega({ contenido_id, titulo }) {
  const { next } = db.prepare('SELECT COUNT(*) + 1 AS next FROM entregas WHERE contenido_id = ?').get(contenido_id);
  const { maxPos } = db.prepare('SELECT COALESCE(MAX(posicion), 0) AS maxPos FROM entregas WHERE contenido_id = ?').get(contenido_id);
  return db.prepare('INSERT INTO entregas (contenido_id, numero, titulo, visto, posicion) VALUES (?, ?, ?, 0, ?)')
    .run(contenido_id, String(next), titulo || '', maxPos + 1);
}

function toggleEntrega(id) {
  return db.prepare('UPDATE entregas SET visto = 1 - visto WHERE id = ?').run(id);
}

function renombrarEntrega(id, titulo) {
  return db.prepare('UPDATE entregas SET titulo = ? WHERE id = ?').run(titulo, id);
}

function renombrarNumero(id, numero) {
  return db.prepare('UPDATE entregas SET numero = ? WHERE id = ?').run(numero, id);
}

function obtenerEntregaPorId(id) {
  return db.prepare('SELECT * FROM entregas WHERE id = ?').get(id);
}

function actualizarEpEntrega(id, delta) {
  const row = db.prepare('SELECT episodio_actual, episodios_totales FROM entregas WHERE id = ?').get(id);
  if (!row) return;
  const max    = row.episodios_totales > 0 ? row.episodios_totales : Infinity;
  const newVal = Math.min(max, Math.max(0, (row.episodio_actual || 0) + delta));
  return db.prepare('UPDATE entregas SET episodio_actual = ? WHERE id = ?').run(newVal, id);
}

function setEpTotalEntrega(id, total) {
  return db.prepare('UPDATE entregas SET episodios_totales = ? WHERE id = ?').run(Math.max(0, total), id);
}

// Inserción completa usada por el importador XML y por MAL
function guardarEntregaCompleta({ contenido_id, numero, titulo, visto, episodio_actual, episodios_totales, mal_id }) {
  const { maxPos } = db.prepare('SELECT COALESCE(MAX(posicion), 0) AS maxPos FROM entregas WHERE contenido_id = ?').get(contenido_id);
  return db.prepare(`
    INSERT INTO entregas (contenido_id, numero, titulo, visto, episodio_actual, episodios_totales, posicion, mal_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contenido_id,
    numero            != null ? String(numero) : '1',
    titulo            || '',
    visto             ? 1 : 0,
    episodio_actual   || 0,
    episodios_totales || 0,
    maxPos + 1,
    mal_id            != null ? mal_id : null,
  );
}

function eliminarEntrega(id) {
  return db.prepare('DELETE FROM entregas WHERE id = ?').run(id);
}

// ── Nombres alternativos ───────────────────────────────────────────────────────

db.prepare(`
  CREATE TABLE IF NOT EXISTS contenido_nombres (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contenido_id INTEGER NOT NULL,
    nombre       TEXT    NOT NULL,
    FOREIGN KEY (contenido_id) REFERENCES contenido(id) ON DELETE CASCADE
  )
`).run();

function obtenerNombres(contenidoId) {
  return db.prepare('SELECT nombre FROM contenido_nombres WHERE contenido_id = ? ORDER BY id ASC')
    .all(contenidoId)
    .map(r => r.nombre);
}

function setNombres(contenidoId, nombres) {
  db.transaction(() => {
    db.prepare('DELETE FROM contenido_nombres WHERE contenido_id = ?').run(contenidoId);
    for (const nombre of nombres) {
      const n = nombre.trim();
      if (n) db.prepare('INSERT INTO contenido_nombres (contenido_id, nombre) VALUES (?, ?)').run(contenidoId, n);
    }
  })();
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function estadisticasGenerales() {
  const porEstado = db.prepare('SELECT estado, COUNT(*) as n FROM contenido GROUP BY estado').all();

  const tagStats = db.prepare(`
    SELECT t.nombre, COUNT(ct.contenido_id) as n
    FROM tags t
    LEFT JOIN contenido_tags ct ON ct.tag_id = t.id
    GROUP BY t.nombre ORDER BY n DESC
  `).all();

  const items = db.prepare(`
    SELECT c.episodios_totales, c.estado, c.id, c.titulo, c.imagen,
      c.episodio_actual,
      COALESCE((SELECT SUM(e.episodios_totales) FROM entregas e WHERE e.contenido_id = c.id), 0) AS ep_entregas,
      COALESCE((SELECT COUNT(*) FROM entregas e WHERE e.contenido_id = c.id), 0) AS total_entregas,
      COALESCE((SELECT SUM(e.visto) FROM entregas e WHERE e.contenido_id = c.id), 0) AS entregas_vistas,
      (SELECT t.nombre FROM tags t JOIN contenido_tags ct ON ct.tag_id = t.id
       WHERE ct.contenido_id = c.id ORDER BY t.nombre LIMIT 1) AS tag_principal
    FROM contenido c
  `).all();

  let minutos = 0;
  for (const c of items) {
    const eps = c.ep_entregas > 0 ? c.ep_entregas : (c.episodios_totales || 0);
    if (c.tag_principal === 'pelicula') minutos += (eps > 0 ? eps : 1) * 110;
    else if (c.tag_principal === 'serie') minutos += eps * 45;
    else minutos += eps * 24;
  }

  const viendo = items.filter(c => c.estado === 'viendo');

  // A.8: cobertura de servicios externos (MAL por ahora).
  const cobertura = db.prepare(`
    SELECT
      SUM(CASE WHEN mal_id IS NOT NULL THEN 1 ELSE 0 END) AS con_mal,
      SUM(CASE WHEN mal_id IS NULL     THEN 1 ELSE 0 END) AS sin_servicio
    FROM contenido
  `).get();

  return {
    porEstado, tagStats, minutos, viendo, total: items.length,
    cobertura: {
      con_mal:      cobertura.con_mal      || 0,
      sin_servicio: cobertura.sin_servicio || 0,
    },
  };
}

function actividadPorMes(limite = 12) {
  return db.prepare(`
    SELECT strftime('%Y-%m', updated_at) AS mes, COUNT(*) AS n
    FROM contenido WHERE updated_at IS NOT NULL
    GROUP BY mes ORDER BY mes DESC LIMIT ?
  `).all(limite).reverse();
}

// ── Gestión de tags ────────────────────────────────────────────────────────────

function actualizarTag(id, nombre) {
  const n = (nombre || '').trim().toLowerCase();
  if (!n) return null;
  // No permitir renombrar etiquetas predefinidas (defensa a nivel de datos).
  const actual = db.prepare('SELECT nombre FROM tags WHERE id = ?').get(id);
  if (actual && TAGS_BUILTIN.includes(actual.nombre)) return null;
  try {
    db.prepare('UPDATE tags SET nombre = ? WHERE id = ?').run(n, id);
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  } catch (_) { return null; } // UNIQUE conflict
}

/**
 * Busca entradas con título o nombre alternativo similar al dado.
 * Coincidencia case-insensitive con LIKE. Útil para detectar duplicados.
 * @param {string} titulo Título a buscar
 * @param {number|null} excludeId Id a excluir (al editar, no autocomparar)
 * @returns {{id:number,titulo:string,estado:string}[]} máx 5 resultados
 */
function buscarPorTituloSimilar(titulo, excludeId = null) {
  const q = (titulo || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  if (excludeId) {
    return db.prepare(`
      SELECT DISTINCT c.id, c.titulo, c.estado
      FROM contenido c
      LEFT JOIN contenido_nombres n ON n.contenido_id = c.id
      WHERE (LOWER(c.titulo) LIKE ? OR LOWER(n.nombre) LIKE ?) AND c.id != ?
      ORDER BY c.titulo ASC LIMIT 5
    `).all(like, like, excludeId);
  }
  return db.prepare(`
    SELECT DISTINCT c.id, c.titulo, c.estado
    FROM contenido c
    LEFT JOIN contenido_nombres n ON n.contenido_id = c.id
    WHERE LOWER(c.titulo) LIKE ? OR LOWER(n.nombre) LIKE ?
    ORDER BY c.titulo ASC LIMIT 5
  `).all(like, like);
}

function contarPorTag() {
  return db.prepare(`
    SELECT t.id, t.nombre, COUNT(ct.contenido_id) AS n
    FROM tags t
    LEFT JOIN contenido_tags ct ON ct.tag_id = t.id
    GROUP BY t.id, t.nombre ORDER BY t.nombre ASC
  `).all();
}

// ── Actualización de campos MAL (C.3 / A.7) ───────────────────────────────────
//
// REGLAS ESTRICTAS DE PROTECCIÓN DEL PROGRESO DEL USUARIO:
// - score_mal, mal_rank, estado_emision, estudio, duracion_ep,
//   fecha_estreno, fecha_fin_emision        → siempre se sobrescriben
// - episodios_totales (contenido)           → solo si MAL > actual (nunca reduce)
// - imagen (contenido)                      → solo si no había imagen previa
// - episodios_totales (entrega)             → solo si MAL > actual
// - visto, episodio_actual, numero, titulo  → NUNCA se tocan
// - estado, fecha_inicio, fecha_fin, tags   → NUNCA se tocan
// - contenido.titulo, descripcion           → NUNCA se tocan (el usuario pudo editarlos)

/**
 * Actualiza los campos MAL de una entrada con datos frescos de la API Jikan.
 * @param {number} contenidoId
 * @param {object} mal datos crudos de Jikan v4
 * @returns {{ cambios: string[], episodios_actualizados: boolean }} resumen del cambio
 */
function actualizarCamposMAL(contenidoId, mal) {
  const actual = obtenerPorId(contenidoId);
  if (!actual) return { cambios: [], episodios_actualizados: false };

  const cambios = [];
  const sets = [];
  const params = {};

  const set = (campo, nuevo, etiqueta) => {
    if (nuevo == null || nuevo === '') return;
    if (actual[campo] !== nuevo) {
      sets.push(`${campo} = @${campo}`);
      params[campo] = nuevo;
      cambios.push(etiqueta || campo);
    }
  };

  // Campos siempre sobrescritos
  set('score_mal',         mal.score      ?? null, 'puntuación');
  set('mal_rank',          mal.rank       ?? null, 'ranking');
  set('estudio',           mal.studios?.[0]?.name || '', 'estudio');
  set('duracion_ep',       mal.duration   || '', 'duración');
  set('fecha_estreno',     formatearFechaMAL(mal.aired?.from), 'fecha estreno');
  set('fecha_fin_emision', formatearFechaMAL(mal.aired?.to),   'fecha fin');
  set('estado_emision',    traducirEstadoEmision(mal.status),   'estado emisión');

  // Campos con regla "solo si MAL > actual"
  let episodios_actualizados = false;
  const malEps = mal.episodes || 0;
  if (malEps > 0 && malEps > (actual.episodios_totales || 0)) {
    sets.push('episodios_totales = @episodios_totales');
    params.episodios_totales = malEps;
    cambios.push('episodios totales');
    episodios_actualizados = true;
  }

  // Imagen: solo si no había antes
  if (!actual.imagen) {
    const nuevaImg = mal.images?.jpg?.large_image_url || mal.images?.jpg?.image_url || '';
    if (nuevaImg) {
      sets.push('imagen = @imagen');
      params.imagen = nuevaImg;
      cambios.push('imagen');
    }
  }

  if (sets.length > 0) {
    params.id = contenidoId;
    db.prepare(`UPDATE contenido SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE id = @id`).run(params);
  }

  return { cambios, episodios_actualizados };
}

function formatearFechaMAL(fechaISO) {
  if (!fechaISO) return '';
  const d = new Date(fechaISO);
  if (isNaN(d.getTime())) return '';
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${meses[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function traducirEstadoEmision(status) {
  const map = {
    'Finished Airing': 'Finalizado',
    'Currently Airing': 'En emisión',
    'Not yet aired': 'No emitido aún',
  };
  return map[status] || status || '';
}

/**
 * Devuelve las entradas que tienen mal_id (importadas desde MAL).
 * Útil para sincronización masiva.
 */
function obtenerEntradasConMalId() {
  return db.prepare(`
    SELECT id, titulo, mal_id, score_mal, estado_emision
    FROM contenido
    WHERE mal_id IS NOT NULL
    ORDER BY titulo ASC
  `).all();
}

// ── Actividad ─────────────────────────────────────────────────────────────────

db.prepare(`
  CREATE TABLE IF NOT EXISTS actividad (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contenido_id INTEGER,
    tipo         TEXT NOT NULL,
    detalle      TEXT DEFAULT '',
    fecha        TEXT DEFAULT (datetime('now','localtime'))
  )
`).run();

// ── Índices ─────────────────────────────────────────────────────────────────────
// Aceleran las consultas por clave foránea. La consulta del grid hace varias
// subconsultas correlacionadas por fila sobre `entregas`; sin estos índices cada
// una es un full scan. Idempotentes: se crean también en BDs ya existentes.
// La dirección `contenido_tags(contenido_id)` ya la cubre la PK compuesta.
db.prepare('CREATE INDEX IF NOT EXISTS idx_entregas_contenido         ON entregas(contenido_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_contenido_tags_tag         ON contenido_tags(tag_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_contenido_nombres_contenido ON contenido_nombres(contenido_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_actividad_contenido         ON actividad(contenido_id)').run();

function registrarActividad(contenidoId, tipo, detalle = '') {
  db.prepare('INSERT INTO actividad (contenido_id, tipo, detalle) VALUES (?, ?, ?)').run(contenidoId || null, tipo, detalle);
}

function obtenerActividad(limite = 30) {
  return db.prepare(`
    SELECT a.*, c.titulo
    FROM actividad a
    LEFT JOIN contenido c ON c.id = a.contenido_id
    ORDER BY a.fecha DESC, a.id DESC LIMIT ?
  `).all(limite);
}

// ── Settings ──────────────────────────────────────────────────────────────────

db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)').run();

for (const [k, v] of [['tag_defecto', ''], ['orden_defecto', 'reciente'], ['theme', 'dark']]) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
}

// F1: modelo uniforme de temporadas — toda serie debe tener al menos una entrega.
// Por cada contenido (que no sea película) sin entregas, crea una "temporada 1"
// heredando su progreso plano (episodios y mal_id). Se ejecuta aquí, tras crear
// todas las tablas. Idempotente: solo afecta a los que no tienen ninguna entrega,
// así que es seguro en cada arranque.
{
  const sinEntregas = db.prepare(`
    SELECT c.id, c.episodio_actual, c.episodios_totales, c.mal_id, c.estado
    FROM contenido c
    WHERE NOT EXISTS (SELECT 1 FROM entregas e WHERE e.contenido_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM contenido_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.contenido_id = c.id AND t.nombre = 'pelicula'
      )
  `).all();
  if (sinEntregas.length > 0) {
    const insert = db.prepare(`
      INSERT INTO entregas (contenido_id, numero, titulo, visto, episodio_actual, episodios_totales, posicion, mal_id)
      VALUES (?, '1', '', ?, ?, ?, 1, ?)
    `);
    db.transaction(() => {
      for (const c of sinEntregas) {
        const epA   = c.episodio_actual  || 0;
        const epT   = c.episodios_totales || 0;
        const visto = (c.estado === 'completado' || (epT > 0 && epA >= epT)) ? 1 : 0;
        insert.run(c.id, visto, epA, epT, c.mal_id || null);
      }
    })();
  }
}

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value ?? ''));
}

module.exports = {
  obtenerContenido,
  obtenerPorId,
  guardarContenido,
  actualizarContenido,
  vincularDatosMal,
  eliminarContenido,
  contarPorEstado,
  obtenerTags,
  crearTag,
  eliminarTag,
  getTagsContenido,
  setTagsContenido,
  obtenerEntregas,
  guardarEntrega,
  toggleEntrega,
  renombrarEntrega,
  renombrarNumero,
  guardarEntregaCompleta,
  obtenerEntregaPorId,
  actualizarEpEntrega,
  setEpTotalEntrega,
  eliminarEntrega,
  estadisticasGenerales,
  actividadPorMes,
  actualizarTag,
  contarPorTag,
  registrarActividad,
  obtenerActividad,  getSetting,
  setSetting,
  obtenerNombres,
  setNombres,
  buscarPorTituloSimilar,
  reordenarEntregas,
  actualizarCamposMAL,
  obtenerEntradasConMalId,
};
