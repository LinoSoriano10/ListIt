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

// Seed: tags por defecto
for (const nombre of ['anime', 'serie', 'pelicula']) {
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

  const where   = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const orderBy = orden === 'alfabetico'
    ? 'c.titulo ASC'
    : 'c.updated_at DESC, c.id DESC';

  const rows = db.prepare(`
    SELECT c.*,
      COALESCE((SELECT COUNT(*) FROM entregas e WHERE e.contenido_id = c.id), 0)   AS total_entregas,
      COALESCE((SELECT SUM(e.visto) FROM entregas e WHERE e.contenido_id = c.id), 0) AS entregas_vistas,
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

function guardarContenido(item) {
  return db.prepare(`
    INSERT INTO contenido
      (titulo, tipo, estado, episodio_actual, episodios_totales, descripcion, anio, imagen, fecha_inicio, fecha_fin, updated_at)
    VALUES
      (@titulo, @tipo, @estado, @episodio_actual, @episodios_totales, @descripcion, @anio, @imagen, @fecha_inicio, @fecha_fin, datetime('now','localtime'))
  `).run({ ...item, tipo: item.tipo || 'anime' });
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
  return db.prepare('SELECT * FROM entregas WHERE contenido_id = ? ORDER BY id ASC').all(contenidoId);
}

function guardarEntrega({ contenido_id, titulo }) {
  const { next } = db.prepare('SELECT COUNT(*) + 1 AS next FROM entregas WHERE contenido_id = ?').get(contenido_id);
  return db.prepare('INSERT INTO entregas (contenido_id, numero, titulo, visto) VALUES (?, ?, ?, 0)')
    .run(contenido_id, String(next), titulo || '');
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

// Inserción completa usada por el importador XML
function guardarEntregaCompleta({ contenido_id, numero, titulo, visto, episodio_actual, episodios_totales }) {
  return db.prepare(`
    INSERT INTO entregas (contenido_id, numero, titulo, visto, episodio_actual, episodios_totales)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    contenido_id,
    numero          != null ? String(numero) : '1',
    titulo          || '',
    visto           ? 1 : 0,
    episodio_actual  || 0,
    episodios_totales || 0,
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

module.exports = {
  obtenerContenido,
  obtenerPorId,
  guardarContenido,
  actualizarContenido,
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
  obtenerNombres,
  setNombres,
};
