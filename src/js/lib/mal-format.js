// Formateo puro de campos de MyAnimeList (Jikan v4), sin dependencias de DOM/API,
// extraído de mal.js para poder testearlo (Tier 1).

export function formatearFechaMAL(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const ESTADO_EMISION = {
  'Finished Airing':  'Finalizado',
  'Currently Airing': 'En emisión',
  'Not yet aired':    'No emitido aún',
};

export function traducirEstadoEmision(status) {
  return ESTADO_EMISION[status] || status || '';
}

/**
 * Extrae los campos de C.3 desde una respuesta de la API Jikan v4.
 */
export function extraerCamposMAL(anime) {
  return {
    mal_id:            anime.mal_id || null,
    score_mal:         anime.score  ?? null,
    mal_rank:          anime.rank   ?? null,
    estudio:           anime.studios?.[0]?.name || '',
    duracion_ep:       anime.duration || '',
    fecha_estreno:     formatearFechaMAL(anime.aired?.from),
    fecha_fin_emision: formatearFechaMAL(anime.aired?.to),
    estado_emision:    traducirEstadoEmision(anime.status),
  };
}
