// Inserta datos de ejemplo realistas para probar la app o capturar screenshots.
// Idempotente: salta entradas cuyo título ya existe.
// Uso: npm run seed   (con la app Electron CERRADA)
// Se ejecuta bajo Electron porque better-sqlite3 está compilado contra su ABI.

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const userData = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'listit')
  : path.join(os.homedir(), '.config', 'listit');

const dbPath = path.join(userData, 'listit.db');
console.log(`📂 BD: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const datos = [
  {
    titulo: 'Attack on Titan',
    tags: ['anime'],
    nombres: ['Shingeki no Kyojin', '進撃の巨人'],
    contenido: {
      tipo: 'anime', estado: 'completado',
      episodio_actual: 0, episodios_totales: 0,
      descripcion: 'La humanidad vive encerrada tras enormes murallas que la protegen de los Titanes. Cuando un titán colosal aparece y destruye la muralla exterior, Eren Yeager jura exterminar a todos los titanes.',
      anio: 2013,
      imagen: 'https://cdn.myanimelist.net/images/anime/10/47347.jpg',    },
    entregas: [
      { numero: 'S1', titulo: 'Temporada 1', visto: 1, episodio_actual: 25, episodios_totales: 25 },
      { numero: 'S2', titulo: 'Temporada 2', visto: 1, episodio_actual: 12, episodios_totales: 12 },
      { numero: 'S3', titulo: 'Temporada 3', visto: 1, episodio_actual: 22, episodios_totales: 22 },
      { numero: 'Final', titulo: 'Temporada Final', visto: 1, episodio_actual: 28, episodios_totales: 28 },
    ],
  },
  {
    titulo: 'Frieren: Beyond Journey\'s End',
    tags: ['anime'],
    nombres: ['Sousou no Frieren', '葬送のフリーレン'],
    contenido: {
      tipo: 'anime', estado: 'viendo',
      episodio_actual: 18, episodios_totales: 28,
      descripcion: 'La maga elfa Frieren, miembro del grupo que derrotó al Rey Demonio, emprende un viaje para entender qué significa vivir entre los humanos cuyas vidas son tan breves comparadas con la suya.',
      anio: 2023,
      imagen: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',    },
    entregas: [],
  },
  {
    titulo: 'Demon Slayer',
    tags: ['anime'],
    nombres: ['Kimetsu no Yaiba', '鬼滅の刃'],
    contenido: {
      tipo: 'anime', estado: 'viendo',
      episodio_actual: 26, episodios_totales: 55,
      descripcion: 'Tanjiro Kamado descubre a su familia masacrada por un demonio. Su hermana Nezuko es la única superviviente, pero ha sido convertida en demonio. Tanjiro jura convertirse en cazador de demonios para devolverla a su forma humana.',
      anio: 2019,
      imagen: 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg',    },
    entregas: [],
  },
  {
    titulo: 'Breaking Bad',
    tags: ['serie'],
    nombres: [],
    contenido: {
      tipo: 'serie', estado: 'completado',
      episodio_actual: 0, episodios_totales: 0,
      descripcion: 'Walter White, un profesor de química al que diagnostican cáncer, decide fabricar metanfetamina junto a un ex-alumno para asegurar el futuro económico de su familia.',
      anio: 2008,
      imagen: '',    },
    entregas: [
      { numero: 'S1', titulo: 'Season 1', visto: 1, episodio_actual: 7,  episodios_totales: 7  },
      { numero: 'S2', titulo: 'Season 2', visto: 1, episodio_actual: 13, episodios_totales: 13 },
      { numero: 'S3', titulo: 'Season 3', visto: 1, episodio_actual: 13, episodios_totales: 13 },
      { numero: 'S4', titulo: 'Season 4', visto: 1, episodio_actual: 13, episodios_totales: 13 },
      { numero: 'S5', titulo: 'Season 5', visto: 1, episodio_actual: 16, episodios_totales: 16 },
    ],
  },
  {
    titulo: 'The Witcher',
    tags: ['serie'],
    nombres: [],
    contenido: {
      tipo: 'serie', estado: 'en_pausa',
      episodio_actual: 0, episodios_totales: 0,
      descripcion: 'Geralt de Rivia, un cazador de monstruos mutante, lucha por encontrar su lugar en un mundo donde a menudo las personas resultan ser más malvadas que las bestias.',
      anio: 2019,
      imagen: '',    },
    entregas: [
      { numero: 'S1', titulo: 'Temporada 1', visto: 1, episodio_actual: 8, episodios_totales: 8 },
      { numero: 'S2', titulo: 'Temporada 2', visto: 1, episodio_actual: 8, episodios_totales: 8 },
      { numero: 'S3', titulo: 'Temporada 3', visto: 0, episodio_actual: 3, episodios_totales: 8 },
    ],
  },
  {
    titulo: 'Spirited Away',
    tags: ['pelicula'],
    nombres: ['El viaje de Chihiro', '千と千尋の神隠し'],
    contenido: {
      tipo: 'pelicula', estado: 'completado',
      episodio_actual: 0, episodios_totales: 0,
      descripcion: 'Chihiro, una niña de 10 años, se ve atrapada en un mundo mágico de espíritus tras la transformación de sus padres en cerdos. Para sobrevivir y rescatarlos, debe trabajar en una casa de baños regida por la bruja Yubaba.',
      anio: 2001,
      imagen: '',    },
    entregas: [],
  },
  {
    titulo: 'Dune: Part Two',
    tags: ['pelicula'],
    nombres: [],
    contenido: {
      tipo: 'pelicula', estado: 'pendiente',
      episodio_actual: 0, episodios_totales: 0,
      descripcion: 'Paul Atreides se une a los Fremen para emprender una guerra de venganza contra los conspiradores que destruyeron a su familia. Frente a una elección entre el amor de su vida y el destino del universo conocido, debe evitar un futuro terrible que solo él puede prever.',
      anio: 2024,
      imagen: '',    },
    entregas: [],
  },
];

// ── Ejecución ─────────────────────────────────────────────────────────────────

const upsertTag = (nombre) => {
  db.prepare('INSERT OR IGNORE INTO tags (nombre) VALUES (?)').run(nombre);
  return db.prepare('SELECT id FROM tags WHERE nombre = ?').get(nombre).id;
};

// Tags que nunca queremos en la BD (subcategorías de los principales, etc.)
const TAGS_PROHIBIDOS = ['shonen'];

const tx = db.transaction((datos) => {
  // Limpieza de tags prohibidos (cascade borra contenido_tags vinculados).
  for (const nombre of TAGS_PROHIBIDOS) {
    const res = db.prepare('DELETE FROM tags WHERE nombre = ?').run(nombre);
    if (res.changes > 0) console.log(`  ✗ tag eliminado: ${nombre}`);
  }

  let creadas = 0, saltadas = 0;

  for (const { titulo, tags, nombres, contenido, entregas } of datos) {
    const existe = db.prepare('SELECT id FROM contenido WHERE titulo = ?').get(titulo);
    if (existe) { saltadas++; continue; }

    const res = db.prepare(`
      INSERT INTO contenido
        (titulo, tipo, estado, episodio_actual, episodios_totales, descripcion, anio, imagen, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      titulo, contenido.tipo, contenido.estado,
      contenido.episodio_actual, contenido.episodios_totales,
      contenido.descripcion, contenido.anio, contenido.imagen,
      ahora(),
    );
    const contenidoId = res.lastInsertRowid;

    for (const nombreTag of tags) {
      const tagId = upsertTag(nombreTag);
      db.prepare('INSERT OR IGNORE INTO contenido_tags (contenido_id, tag_id) VALUES (?, ?)').run(contenidoId, tagId);
    }

    for (const nombre of nombres) {
      db.prepare('INSERT INTO contenido_nombres (contenido_id, nombre) VALUES (?, ?)').run(contenidoId, nombre);
    }

    for (const e of entregas) {
      db.prepare(`
        INSERT INTO entregas (contenido_id, numero, titulo, visto, episodio_actual, episodios_totales)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(contenidoId, e.numero, e.titulo, e.visto, e.episodio_actual, e.episodios_totales);
    }

    creadas++;
    console.log(`  ✓ ${titulo}`);
  }

  return { creadas, saltadas };
});

let exitCode = 0;
try {
  const { creadas, saltadas } = tx(datos);
  console.log(`\n✅ ${creadas} entradas creadas, ${saltadas} saltadas (ya existían).`);
} catch (e) {
  if (e.code === 'SQLITE_BUSY') {
    console.error('\n❌ La BD está bloqueada. Cierra la app ListIt y vuelve a ejecutar.');
  } else {
    console.error('\n❌ Error:', e.message);
  }
  exitCode = 1;
} finally {
  db.close();
}

// Salir limpiamente. Si se ejecuta bajo Electron, app.quit() es necesario.
try { require('electron').app.quit(); } catch (_) {}
process.exit(exitCode);
