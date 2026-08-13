// Adaptador: respuesta de la API oficial de MyAnimeList v2 → forma de Jikan v4.
//
// Todo el renderer (mal.js, mal-format.js, add-season.js, mal-sync.js) está
// escrito contra la forma de Jikan. En lugar de tocar los cuatro, se traduce
// aquí: la API oficial entra por un lado y sale con forma de Jikan por el otro.
// Módulo puro (sin red ni Electron) para poder testearlo.

// La API oficial devuelve solo id/title/main_picture si no se piden campos
// explícitamente. Esta lista vive junto al mapeo para que no se desincronicen:
// si abajo se lee un campo, aquí tiene que estar pedido.
const CAMPOS_ANIME = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'media_type',
  'status',
  'num_episodes',
  'start_season',
  'average_episode_duration',
  'studios',
  'related_anime',
].join(',');

// La búsqueda no necesita relaciones ni sinopsis largas: menos campos, respuesta
// más rápida y menos riesgo de time-out en listados de 8 resultados.
const CAMPOS_BUSQUEDA = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'media_type',
  'status',
  'num_episodes',
  'start_season',
  'average_episode_duration',
  'studios',
].join(',');

// media_type oficial (minúsculas) → `type` de Jikan (capitalizado).
const TIPOS = {
  tv:         'TV',
  ova:        'OVA',
  movie:      'Movie',
  special:    'Special',
  ona:        'ONA',
  music:      'Music',
  cm:         'CM',
  pv:         'PV',
  tv_special: 'TV Special',
  unknown:    '',
};

// status oficial (snake_case) → `status` de Jikan. Estas cadenas exactas son las
// que esperan traducirEstadoEmision() y codigoEmision() en mal-format.js.
const ESTADOS = {
  finished_airing:  'Finished Airing',
  currently_airing: 'Currently Airing',
  not_yet_aired:    'Not yet aired',
};

function normalizarTipo(mediaType) {
  if (!mediaType) return '';
  return TIPOS[mediaType] ?? mediaType.toUpperCase();
}

function normalizarEstado(status) {
  if (!status) return '';
  return ESTADOS[status] ?? status;
}

// La oficial da la duración en segundos; Jikan la da ya formateada y
// mal-format.js la guarda tal cual en `duracion_ep`. Se reproduce el formato de
// Jikan ("24 min per ep", "1 hr 59 min") para que la ficha se vea igual.
function duracionDesdeSegundos(segundos, episodios) {
  const s = Number(segundos) || 0;
  if (s <= 0) return '';

  const horas   = Math.floor(s / 3600);
  const minutos = Math.round((s % 3600) / 60);

  const partes = [];
  if (horas > 0)   partes.push(`${horas} hr`);
  if (minutos > 0) partes.push(`${minutos} min`);
  if (partes.length === 0) partes.push(`${s} sec`);

  const texto = partes.join(' ');

  // "per ep" solo cuando consta más de un episodio. Verificado contra Jikan:
  // las películas (1 ep) y las series en emisión con total aún desconocido
  // (num_episodes = 0, caso de One Piece) se muestran sin sufijo en ambas
  // fuentes. La condición tiene que ser "> 1", no "distinto de 1".
  return (Number(episodios) || 0) > 1 ? `${texto} per ep` : texto;
}

// Jikan expone `year` en la raíz; la oficial lo trae en start_season, que falta
// en las entradas sin temporada asignada. Se cae a la fecha de estreno.
function anioDe(nodo) {
  const delSeason = nodo.start_season?.year;
  if (delSeason) return delSeason;
  const m = /^(\d{4})/.exec(nodo.start_date || '');
  return m ? Number(m[1]) : null;
}

// Fecha de fin de emisión, o null si no aporta nada. Una película tiene
// end_date igual a start_date en la API oficial; repetirla como "fin de
// emisión" solo añade ruido, y Jikan tampoco la da.
function finDeEmision(nodo) {
  const fin = nodo.end_date || null;
  if (!fin) return null;
  const unicoEpisodio = Number(nodo.num_episodes) === 1;
  if (unicoEpisodio && fin === nodo.start_date) return null;
  return fin;
}

/**
 * related_anime (oficial) → forma de `/anime/{id}/relations` de Jikan:
 *   [{ relation: 'Sequel', entry: [{ mal_id, type, name, url }] }]
 * Es la forma exacta que consumen add-season.js (`r.relation === 'Sequel'`,
 * `e.type === 'anime'`) y mal-sync.js (`sec.entry[0].name`).
 */
function adaptarRelaciones(relatedAnime) {
  const porRelacion = new Map();

  for (const rel of relatedAnime || []) {
    if (!rel?.node?.id) continue;
    // relation_type_formatted ya viene como "Sequel"/"Prequel"; si faltara, se
    // capitaliza el snake_case ("side_story" → "Side Story").
    const nombre = rel.relation_type_formatted
      || String(rel.relation_type || '')
        .split('_')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    if (!nombre) continue;

    if (!porRelacion.has(nombre)) porRelacion.set(nombre, []);
    porRelacion.get(nombre).push({
      mal_id: rel.node.id,
      type:   'anime',            // related_anime solo trae anime (el manga va aparte)
      name:   rel.node.title || '',
      url:    `https://myanimelist.net/anime/${rel.node.id}`,
    });
  }

  return [...porRelacion].map(([relation, entry]) => ({ relation, entry }));
}

/**
 * Un anime de la API oficial → objeto con forma de Jikan v4.
 */
function adaptarAnime(nodo) {
  if (!nodo || nodo.id == null) return null;

  const alt = nodo.alternative_titles || {};

  return {
    mal_id: nodo.id,

    title:          nodo.title || '',
    title_english:  alt.en || '',
    title_japanese: alt.ja || '',
    title_synonyms: Array.isArray(alt.synonyms) ? alt.synonyms : [],

    synopsis: nodo.synopsis || '',

    images: {
      jpg: {
        image_url:       nodo.main_picture?.medium || nodo.main_picture?.large || '',
        large_image_url: nodo.main_picture?.large  || nodo.main_picture?.medium || '',
      },
    },

    type:     normalizarTipo(nodo.media_type),
    status:   normalizarEstado(nodo.status),
    episodes: nodo.num_episodes || 0,

    year:   anioDe(nodo),
    season: nodo.start_season?.season || null,

    score: nodo.mean ?? null,
    rank:  nodo.rank ?? null,

    // formatearFechaMAL() acepta tanto "1999-10-20" como ISO completa.
    //
    // En obras de un solo episodio la oficial repite la fecha de estreno como
    // end_date, mientras que Jikan la deja vacía. Se omite para no pintar
    // "Fin de emisión" con el mismo valor que el estreno en cada película.
    aired: {
      from: nodo.start_date || null,
      to:   finDeEmision(nodo),
    },

    studios: (nodo.studios || []).map(e => ({ mal_id: e.id, name: e.name || '' })),

    duration: duracionDesdeSegundos(nodo.average_episode_duration, nodo.num_episodes),

    // Jikan solo trae relaciones en /full; la oficial las da en el propio
    // detalle, así que `relations` queda poblado y el aviso de secuela de
    // mal-sync.js (que hoy nunca salta) empieza a funcionar.
    relations: adaptarRelaciones(nodo.related_anime),
  };
}

/**
 * Respuesta de búsqueda oficial (`{ data: [{ node }] }`) → array con forma Jikan.
 */
function adaptarBusqueda(respuesta) {
  return (respuesta?.data || [])
    .map(fila => adaptarAnime(fila?.node))
    .filter(Boolean);
}

module.exports = {
  CAMPOS_ANIME,
  CAMPOS_BUSQUEDA,
  adaptarAnime,
  adaptarBusqueda,
  adaptarRelaciones,
  duracionDesdeSegundos,
  normalizarTipo,
  normalizarEstado,
};
