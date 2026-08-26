// Recorrido de una franquicia de MyAnimeList.
//
// Antes se seguía una cadena en línea recta de relaciones `Sequel`, y por eso
// las películas y las OVAs no aparecían nunca: MAL no las encadena, las cuelga
// de lado. Caso real de *That Time I Got Reincarnated as a Slime*:
//
//   53580 (Temporada 3)
//     ├─ Sequel      → 59970  (Temporada 4)   ← la cadena iba por aquí
//     └─ Side story  → 59971  (Movie 2)       ← inalcanzable
//
// Ahora es un recorrido en anchura sobre una lista blanca de relaciones. La
// lista es corta a propósito: MAL mete en `related_anime` recopilatorios
// (`Summary`), vídeos de personaje (`Character`), promocionales (`Other`) y
// series derivadas con hilo propio (`Spin-off`). Todo eso es ruido en una lista
// de "temporadas que te faltan".
//
// Módulo puro: recibe la función que trae las relaciones, así que se testea con
// un grafo de mentira y sin red.

export const RELACIONES_SEGUIDAS = ['sequel', 'side story'];

// Tope de seguridad. Una franquicia larga ronda las 10-15 entradas; si algo se
// desmadra es que el grafo tiene un puente inesperado, y más vale cortar que
// recorrer medio MyAnimeList.
const MAX_NODOS = 40;

function normalizar(relacion) {
  return String(relacion || '').trim().toLowerCase();
}

/**
 * Ids de una relación concreta, en el orden en que los da MAL.
 * `relaciones` viene con forma de Jikan: [{ relation, entry: [{ mal_id, type }] }]
 */
function idsDe(relaciones, tipo) {
  const objetivo = normalizar(tipo);
  const salida = [];
  for (const r of relaciones || []) {
    if (normalizar(r?.relation) !== objetivo) continue;
    for (const e of r.entry || []) {
      if (e?.type && normalizar(e.type) !== 'anime') continue;   // el manga va aparte
      if (Number.isFinite(e?.mal_id)) salida.push(e.mal_id);
    }
  }
  return salida;
}

/**
 * Recorre la franquicia desde `raiz`.
 *
 * @param raiz               mal_id de partida
 * @param obtenerRelaciones  async (malId) => relaciones con forma de Jikan
 * @param opciones.abortado  () => boolean, para poder cancelar a media pasada
 *
 * Devuelve:
 *   nodos    ids alcanzados, en orden de descubrimiento, incluida la raíz
 *   espina   cadena de secuelas desde la raíz — la marca de emisión de la
 *            franquicia sale de aquí, no de una historia paralela
 *   relacion Map id → relación que lo descubrió ('Sequel', 'Side story')
 */
export async function recorrerFranquicia(raiz, obtenerRelaciones, opciones = {}) {
  const { abortado = () => false, maxNodos = MAX_NODOS } = opciones;

  const nodos    = [];
  const relacion = new Map();
  const visto    = new Set();
  const cola     = [raiz];

  // Relaciones ya pedidas en este recorrido, para no preguntar dos veces por el
  // mismo id aunque se llegue a él por dos caminos.
  const relacionesDe = new Map();
  const traer = async (id) => {
    if (!relacionesDe.has(id)) relacionesDe.set(id, (await obtenerRelaciones(id)) || []);
    return relacionesDe.get(id);
  };

  while (cola.length > 0 && nodos.length < maxNodos) {
    if (abortado()) break;

    const actual = cola.shift();
    if (visto.has(actual)) continue;
    visto.add(actual);
    nodos.push(actual);

    let rels;
    try {
      rels = await traer(actual);
    } catch {
      // Una entrada que falle no debe tumbar el recorrido entero: se queda como
      // hoja y se sigue por los demás caminos.
      continue;
    }

    for (const tipo of RELACIONES_SEGUIDAS) {
      for (const id of idsDe(rels, tipo)) {
        if (visto.has(id) || cola.includes(id)) continue;
        if (!relacion.has(id)) relacion.set(id, tipo === 'sequel' ? 'Sequel' : 'Side story');
        cola.push(id);
      }
    }
  }

  // La espina: solo secuelas, en línea, desde la raíz. Reutiliza lo ya pedido,
  // así que no cuesta ninguna petición extra.
  const espina = [];
  const vistoEspina = new Set();
  let cur = raiz;
  while (cur != null && !vistoEspina.has(cur) && espina.length < maxNodos) {
    vistoEspina.add(cur);
    espina.push(cur);
    const rels = relacionesDe.get(cur);
    if (!rels) break;
    cur = idsDe(rels, 'sequel')[0] ?? null;
  }

  return { nodos, espina, relacion };
}
