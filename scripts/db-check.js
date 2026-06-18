// Verificación rápida del estado de la BD. Uso: npx electron scripts/db-check.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'listit', 'listit.db');
const db = new Database(dbPath);

console.log(`📂 ${dbPath}\n`);

const contenido = db.prepare('SELECT id, titulo, estado FROM contenido ORDER BY id').all();
console.log('Contenido:');
for (const c of contenido) console.log(`  ${c.id}  [${c.estado}]  ${JSON.stringify(c.titulo)}`);

const tags = db.prepare('SELECT id, nombre FROM tags ORDER BY id').all();
console.log('\nTags:');
for (const t of tags) console.log(`  ${t.id}  ${t.nombre}`);

const links = db.prepare(`
  SELECT c.titulo, t.nombre
  FROM contenido_tags ct
  JOIN contenido c ON c.id = ct.contenido_id
  JOIN tags t ON t.id = ct.tag_id
  ORDER BY c.id, t.nombre
`).all();
console.log('\nLinks contenido↔tags:');
for (const l of links) console.log(`  ${l.titulo}  →  ${l.nombre}`);

db.close();
try { require('electron').app.quit(); } catch (_) {}
process.exit(0);
