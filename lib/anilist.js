// Cliente de AniList (GraphQL) para el calendario de emisión.
//
// Por qué AniList y no MyAnimeList: la API oficial de MAL solo publica un hueco
// semanal recurrente (`broadcast: {day_of_the_week, start_time}`). Deducir de
// ahí por qué episodio va una serie falla en cuanto hay un parón o un
// recopilatorio, que es lo normal. AniList publica la fecha exacta de cada
// episodio, que es justo lo que hace falta para decir "debería salir el jueves".
//
// Todo el calendario se resuelve en dos consultas, sean 5 series o 50:
//   1. idMal → id de AniList (no coinciden: Frieren es 52991 en MAL y 154587 aquí)
//   2. los episodios de esos ids dentro de una ventana de fechas
//
// Corre en el proceso principal, como el resto de clientes de red, para que el
// renderer no tenga que hablar con dominios externos.

const { net } = require('electron');

const ENDPOINT = 'https://graphql.anilist.co';
const TIMEOUT_MS = 20000;
const POR_PAGINA = 50;
// AniList admite ~90 peticiones por minuto. Con dos consultas por refresco vamos
// sobradísimos, pero el respiro entre páginas evita rozar el límite si algún día
// la biblioteca crece mucho.
const PAUSA_MS = 700;

/**
 * Códigos: desactivada | limite | servicio-caido | red | respuesta-invalida
 */
class ErrorAniList extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorAniList';
    this.codigo = codigo;
  }
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function consultar(query, variables) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);

  let resp;
  try {
    resp = await net.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: control.signal,
    });
  } catch (err) {
    throw new ErrorAniList(
      err?.name === 'AbortError' ? 'servicio-caido' : 'red',
      err?.name === 'AbortError' ? 'AniList no respondió a tiempo' : 'Sin conexión con AniList',
    );
  } finally {
    clearTimeout(temporizador);
  }

  if (resp.status === 429) {
    const espera = Number(resp.headers.get('retry-after')) || 60;
    throw new ErrorAniList('limite', `AniList está limitando las peticiones; reinténtalo en ${espera} s`);
  }

  let json = null;
  try { json = await resp.json(); } catch { /* se trata abajo */ }

  // AniList desactiva su API a propósito cuando tiene problemas de estabilidad
  // (lo hizo en agosto de 2026). Devuelve 403 con un mensaje explícito, y merece
  // un código propio porque no es un fallo del usuario ni algo que reintentar.
  const mensajes = (json?.errors || []).map(e => e?.message || '').join(' ');
  if (resp.status === 403 || /temporarily disabled/i.test(mensajes)) {
    throw new ErrorAniList('desactivada',
      'AniList ha desactivado temporalmente su API. El calendario guardado sigue disponible.');
  }
  if (!resp.ok) {
    throw new ErrorAniList('servicio-caido', `AniList devolvió HTTP ${resp.status}`);
  }
  if (json?.errors?.length) {
    throw new ErrorAniList('respuesta-invalida', mensajes || 'AniList devolvió un error');
  }
  if (!json?.data) {
    throw new ErrorAniList('respuesta-invalida', 'Respuesta ilegible de AniList');
  }
  return json.data;
}

const Q_IDS = `
  query($ids: [Int]) {
    Page(perPage: ${POR_PAGINA}) {
      media(idMal_in: $ids, type: ANIME) {
        id
        idMal
        status
        episodes
        nextAiringEpisode { episode airingAt }
      }
    }
  }`;

const Q_CALENDARIO = `
  query($ids: [Int], $desde: Int, $hasta: Int, $pagina: Int) {
    Page(page: $pagina, perPage: ${POR_PAGINA}) {
      pageInfo { hasNextPage }
      airingSchedules(
        mediaId_in: $ids
        airingAt_greater: $desde
        airingAt_lesser: $hasta
        sort: TIME
      ) { mediaId episode airingAt }
    }
  }`;

function trozos(lista, tam) {
  const out = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}

/**
 * Resuelve los mal_id a ids de AniList. Devuelve un array de
 * `{ malId, anilistId, status, episodes, proximo }`.
 */
async function resolverIds(malIds) {
  const salida = [];
  const lotes = trozos([...new Set(malIds.filter(Number.isFinite))], POR_PAGINA);

  for (let i = 0; i < lotes.length; i++) {
    if (i > 0) await dormir(PAUSA_MS);
    const data = await consultar(Q_IDS, { ids: lotes[i] });
    for (const m of data?.Page?.media || []) {
      salida.push({
        malId:     m.idMal,
        anilistId: m.id,
        status:    m.status,
        episodes:  m.episodes,
        proximo:   m.nextAiringEpisode
          ? { episodio: m.nextAiringEpisode.episode, fecha_utc: m.nextAiringEpisode.airingAt }
          : null,
      });
    }
  }
  return salida;
}

/**
 * Episodios de esas series emitidos (o por emitir) dentro de la ventana dada.
 * `desde` y `hasta` son segundos epoch UTC.
 */
async function calendarioEnVentana(anilistIds, desde, hasta) {
  const ids = [...new Set((anilistIds || []).filter(Number.isFinite))];
  if (ids.length === 0) return [];

  const salida = [];
  for (const lote of trozos(ids, POR_PAGINA)) {
    let pagina = 1;
    for (;;) {
      if (pagina > 1 || salida.length > 0) await dormir(PAUSA_MS);
      const data = await consultar(Q_CALENDARIO, { ids: lote, desde, hasta, pagina });
      const p = data?.Page;
      for (const a of p?.airingSchedules || []) {
        salida.push({ anilistId: a.mediaId, episodio: a.episode, fecha_utc: a.airingAt });
      }
      if (!p?.pageInfo?.hasNextPage) break;
      pagina++;
      // Tope defensivo: si algo va mal en la paginación, mejor parar que
      // quedarse dando vueltas contra un servicio ajeno.
      if (pagina > 20) break;
    }
  }
  return salida;
}

module.exports = { ErrorAniList, resolverIds, calendarioEnVentana };
