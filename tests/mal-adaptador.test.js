import { describe, it, expect } from 'vitest';
import {
  adaptarAnime,
  adaptarBusqueda,
  adaptarRelaciones,
  duracionDesdeSegundos,
  normalizarTipo,
  normalizarEstado,
} from '../lib/mal-adaptador.js';
import { extraerCamposMAL, tituloMAL, codigoEmision } from '../src/js/lib/mal-format.js';

// Respuesta real de la API oficial v2 para Steins;Gate (9253), recortada a los
// campos que pide el adaptador.
const OFICIAL_STEINS = {
  id: 9253,
  title: 'Steins;Gate',
  main_picture: {
    medium: 'https://cdn.myanimelist.net/images/anime/5/73199.jpg',
    large:  'https://cdn.myanimelist.net/images/anime/5/73199l.jpg',
  },
  alternative_titles: {
    synonyms: ['Steins Gate'],
    en: 'Steins;Gate',
    ja: 'STEINS;GATE',
  },
  start_date: '2011-04-06',
  end_date:   '2011-09-14',
  synopsis:   'Rintarou Okabe es un autoproclamado científico loco.',
  mean: 9.07,
  rank: 4,
  media_type: 'tv',
  status: 'finished_airing',
  num_episodes: 24,
  start_season: { year: 2011, season: 'spring' },
  average_episode_duration: 1440,
  studios: [{ id: 314, name: 'White Fox' }],
  related_anime: [
    {
      node: { id: 30484, title: 'Steins;Gate 0' },
      relation_type: 'sequel',
      relation_type_formatted: 'Sequel',
    },
    {
      node: { id: 11577, title: 'Steins;Gate: Oukoubakko no Poriomania' },
      relation_type: 'side_story',
      relation_type_formatted: 'Side story',
    },
  ],
};

// La misma entrada tal y como la devolvía Jikan v4, que es la forma contra la
// que está escrito todo el renderer.
const JIKAN_STEINS = {
  mal_id: 9253,
  title: 'Steins;Gate',
  title_english: 'Steins;Gate',
  title_japanese: 'STEINS;GATE',
  title_synonyms: ['Steins Gate'],
  type: 'TV',
  episodes: 24,
  status: 'Finished Airing',
  aired: { from: '2011-04-06T00:00:00+00:00', to: '2011-09-14T00:00:00+00:00' },
  duration: '24 min per ep',
  score: 9.07,
  rank: 4,
  year: 2011,
  season: 'spring',
  studios: [{ mal_id: 314, name: 'White Fox' }],
};

describe('normalizarTipo', () => {
  it('media_type oficial → type de Jikan', () => {
    expect(normalizarTipo('tv')).toBe('TV');
    expect(normalizarTipo('movie')).toBe('Movie');
    expect(normalizarTipo('ova')).toBe('OVA');
    expect(normalizarTipo('ona')).toBe('ONA');
    expect(normalizarTipo('special')).toBe('Special');
    expect(normalizarTipo('unknown')).toBe('');
  });
  it('sin valor → cadena vacía', () => {
    expect(normalizarTipo(null)).toBe('');
    expect(normalizarTipo(undefined)).toBe('');
  });
});

describe('normalizarEstado', () => {
  // Estas cadenas exactas son las que consumen traducirEstadoEmision() y
  // codigoEmision(); si cambian, la ficha muestra el estado en crudo.
  it('status oficial → status de Jikan', () => {
    expect(normalizarEstado('finished_airing')).toBe('Finished Airing');
    expect(normalizarEstado('currently_airing')).toBe('Currently Airing');
    expect(normalizarEstado('not_yet_aired')).toBe('Not yet aired');
  });
  it('el resultado sigue siendo válido para codigoEmision()', () => {
    expect(codigoEmision(normalizarEstado('currently_airing'))).toBe('en_emision');
    expect(codigoEmision(normalizarEstado('not_yet_aired'))).toBe('proximamente');
    expect(codigoEmision(normalizarEstado('finished_airing'))).toBe('finalizado');
  });
});

describe('duracionDesdeSegundos', () => {
  it('serie → "N min per ep"', () => {
    expect(duracionDesdeSegundos(1440, 24)).toBe('24 min per ep');
    expect(duracionDesdeSegundos(1380, 12)).toBe('23 min per ep');
  });
  it('episodio único → sin "per ep"', () => {
    expect(duracionDesdeSegundos(7140, 1)).toBe('1 hr 59 min');
    expect(duracionDesdeSegundos(6420, 1)).toBe('1 hr 47 min'); // Kimi no Na wa.
  });
  it('serie en emisión (num_episodes = 0) → sin "per ep", igual que Jikan', () => {
    // One Piece: el total de episodios aún se desconoce. Contrastado contra la
    // respuesta real de Jikan, que también devuelve "24 min" a secas.
    expect(duracionDesdeSegundos(1440, 0)).toBe('24 min');
    expect(duracionDesdeSegundos(1440, null)).toBe('24 min');
  });
  it('sin duración → cadena vacía', () => {
    expect(duracionDesdeSegundos(0, 12)).toBe('');
    expect(duracionDesdeSegundos(null, 12)).toBe('');
    expect(duracionDesdeSegundos(undefined, undefined)).toBe('');
  });
});

describe('adaptarRelaciones', () => {
  const rels = adaptarRelaciones(OFICIAL_STEINS.related_anime);

  it('produce la forma que consume add-season.js', () => {
    // add-season.js hace: rels.find(r => r.relation === 'Sequel')
    //                     .entry.find(e => e.type === 'anime').mal_id
    const seq = rels.find(r => r.relation === 'Sequel');
    expect(seq).toBeTruthy();
    const next = seq.entry.find(e => e.type === 'anime');
    expect(next.mal_id).toBe(30484);
    expect(next.name).toBe('Steins;Gate 0');
  });

  it('agrupa por tipo de relación', () => {
    expect(rels.map(r => r.relation).sort()).toEqual(['Sequel', 'Side story']);
  });

  it('capitaliza el snake_case si falta relation_type_formatted', () => {
    const r = adaptarRelaciones([
      { node: { id: 1, title: 'X' }, relation_type: 'alternative_version' },
    ]);
    expect(r[0].relation).toBe('Alternative Version');
  });

  it('descarta entradas sin nodo válido y tolera lista vacía', () => {
    expect(adaptarRelaciones([{ relation_type: 'sequel' }])).toEqual([]);
    expect(adaptarRelaciones(null)).toEqual([]);
    expect(adaptarRelaciones([])).toEqual([]);
  });
});

describe('adaptarAnime', () => {
  const a = adaptarAnime(OFICIAL_STEINS);

  it('mapea identidad y títulos', () => {
    expect(a.mal_id).toBe(9253);
    expect(a.title).toBe('Steins;Gate');
    expect(a.title_english).toBe('Steins;Gate');
    expect(a.title_japanese).toBe('STEINS;GATE');
    expect(a.title_synonyms).toEqual(['Steins Gate']);
  });

  it('mapea imágenes a la ruta images.jpg que usa mal.js', () => {
    expect(a.images.jpg.image_url).toBe('https://cdn.myanimelist.net/images/anime/5/73199.jpg');
    expect(a.images.jpg.large_image_url).toBe('https://cdn.myanimelist.net/images/anime/5/73199l.jpg');
  });

  it('mapea episodios, año y temporada', () => {
    expect(a.episodes).toBe(24);
    expect(a.year).toBe(2011);
    expect(a.season).toBe('spring');
  });

  it('mapea estudios con la forma studios[0].name', () => {
    expect(a.studios[0].name).toBe('White Fox');
  });

  it('tituloMAL() sigue devolviendo el título en inglés', () => {
    expect(tituloMAL(a)).toBe('Steins;Gate');
  });

  it('en obras de un episodio no repite el estreno como fin de emisión', () => {
    // La oficial pone end_date = start_date en las películas; Jikan lo deja
    // vacío. Se omite para no pintar dos veces la misma fecha en la ficha.
    const peli = adaptarAnime({
      id: 32281, title: 'Kimi no Na wa.', media_type: 'movie',
      num_episodes: 1, start_date: '2016-08-26', end_date: '2016-08-26',
    });
    expect(peli.aired.from).toBe('2016-08-26');
    expect(peli.aired.to).toBeNull();
    expect(extraerCamposMAL(peli).fecha_fin_emision).toBe('');
  });

  it('conserva el fin de emisión cuando sí aporta información', () => {
    const serie = adaptarAnime({
      id: 1, title: 'Serie', media_type: 'tv',
      num_episodes: 24, start_date: '2011-04-06', end_date: '2011-09-14',
    });
    expect(serie.aired.to).toBe('2011-09-14');

    // Un especial de un episodio cuyo fin difiere del estreno sí lo conserva.
    const especial = adaptarAnime({
      id: 2, title: 'Especial', media_type: 'special',
      num_episodes: 1, start_date: '2011-04-06', end_date: '2011-04-20',
    });
    expect(especial.aired.to).toBe('2011-04-20');
  });

  it('deduce el año desde start_date si no hay start_season', () => {
    const sinSeason = adaptarAnime({ ...OFICIAL_STEINS, start_season: undefined });
    expect(sinSeason.year).toBe(2011);
    expect(sinSeason.season).toBeNull();
  });

  it('no revienta con campos ausentes', () => {
    const minimo = adaptarAnime({ id: 1, title: 'Solo título' });
    expect(minimo.mal_id).toBe(1);
    expect(minimo.title_synonyms).toEqual([]);
    expect(minimo.studios).toEqual([]);
    expect(minimo.duration).toBe('');
    expect(minimo.relations).toEqual([]);
    expect(minimo.images.jpg.image_url).toBe('');
  });

  it('devuelve null si no hay nodo o no hay id', () => {
    expect(adaptarAnime(null)).toBeNull();
    expect(adaptarAnime({ title: 'sin id' })).toBeNull();
  });
});

describe('fidelidad frente a Jikan', () => {
  // La prueba que importa: lo que la app extrae y guarda en la BD debe ser
  // idéntico viniendo de una fuente o de la otra. Si esto pasa, no hace falta
  // tocar mal-format.js ni el resto del renderer.
  it('extraerCamposMAL() da el mismo resultado desde ambas fuentes', () => {
    const desdeOficial = extraerCamposMAL(adaptarAnime(OFICIAL_STEINS));
    const desdeJikan   = extraerCamposMAL(JIKAN_STEINS);
    expect(desdeOficial).toEqual(desdeJikan);
  });

  it('los campos concretos son los esperados', () => {
    expect(extraerCamposMAL(adaptarAnime(OFICIAL_STEINS))).toEqual({
      mal_id: 9253,
      score_mal: 9.07,
      mal_rank: 4,
      estudio: 'White Fox',
      duracion_ep: '24 min per ep',
      fecha_estreno: 'Abr 2011',
      fecha_fin_emision: 'Sep 2011',
      estado_emision: 'Finalizado',
    });
  });
});

describe('adaptarBusqueda', () => {
  const respuesta = {
    data: [
      { node: OFICIAL_STEINS },
      { node: { id: 30484, title: 'Steins;Gate 0', media_type: 'tv', status: 'finished_airing' } },
    ],
    paging: {},
  };

  it('desenvuelve { data: [{ node }] } a un array plano', () => {
    const r = adaptarBusqueda(respuesta);
    expect(r).toHaveLength(2);
    expect(r[0].mal_id).toBe(9253);
    expect(r[1].mal_id).toBe(30484);
  });

  it('descarta filas sin nodo válido', () => {
    expect(adaptarBusqueda({ data: [{ node: null }, {}] })).toEqual([]);
  });

  it('tolera respuesta vacía o ausente', () => {
    expect(adaptarBusqueda({ data: [] })).toEqual([]);
    expect(adaptarBusqueda(null)).toEqual([]);
  });
});
