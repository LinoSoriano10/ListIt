const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'peliculas.db');
const db = new Database(dbPath);

// Crear tabla si no existe
db.prepare(`
  CREATE TABLE IF NOT EXISTS peliculas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT,
    descripcion TEXT,
    anio INTEGER
  )
`).run();

// Consultas
function obtenerPeliculas() {
  return db.prepare('SELECT * FROM peliculas').all();
}

function obtenerPeliculaPorId(id) {
  return db.prepare('SELECT * FROM peliculas WHERE id = ?').get(id);
}

function guardarPelicula(pelicula) {
  return db.prepare(`
    INSERT INTO peliculas (titulo, descripcion, anio)
    VALUES (@titulo, @descripcion, @anio)
  `).run(pelicula);
}

module.exports = { obtenerPeliculas, obtenerPeliculaPorId, guardarPelicula };
