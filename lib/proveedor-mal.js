// Proveedor de datos de MyAnimeList con reserva.
//
// Fuente principal: la API oficial (necesita Client ID del usuario).
// Reserva:          Jikan, la API no oficial que se usaba antes.
//
// Como lib/mal-adaptador.js normaliza la respuesta oficial a la forma de Jikan,
// ambas fuentes devuelven objetos idénticos y el renderer no sabe ni le importa
// cuál se usó. La reserva sale casi gratis y mantiene la app utilizable si el
// usuario aún no ha configurado su Client ID.
//
// Aquí vive también el reintento ante 429 que antes estaba en
// src/js/lib/jikan.js, ahora que las llamadas salen del proceso principal.

const { net } = require('electron');
const oficial = require('./mal-oficial');
const { ErrorMal } = oficial;

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const JIKAN_TIMEOUT_MS = 20000;

/**
 * GET a Jikan con reintento ante 429 (su límite es ~3 req/s, 60 req/min).
 * Devuelve el campo `data` de la respuesta.
 */
async function jikanGet(ruta, intentos = 4, espera429 = 1500) {
  let ultimoEstado = 0;

  for (let i = 0; i < intentos; i++) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), JIKAN_TIMEOUT_MS);

    let resp;
    try {
      resp = await net.fetch(`${JIKAN_BASE}${ruta}`, { signal: control.signal });
    } catch (err) {
      throw new ErrorMal(
        err?.name === 'AbortError' ? 'servicio-caido' : 'red',
        'Jikan no respondió a tiempo',
      );
    } finally {
      clearTimeout(temporizador);
    }

    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, espera429));
      ultimoEstado = 429;
      continue;
    }
    if (resp.status === 404) {
      throw new ErrorMal('no-encontrado', 'No existe esa entrada en Jikan');
    }
    if (!resp.ok) {
      throw new ErrorMal('servicio-caido', `Jikan devolvió HTTP ${resp.status}`);
    }

    try {
      return (await resp.json()).data;
    } catch {
      throw new ErrorMal('servicio-caido', 'Respuesta ilegible de Jikan');
    }
  }

  throw new ErrorMal('limite', `Jikan sigue limitando las peticiones (HTTP ${ultimoEstado})`);
}

// Errores que no tiene sentido reintentar contra la reserva: el problema es la
// petición, no la fuente.
const NO_REINTENTABLES = new Set(['no-encontrado', 'consulta-corta']);

/**
 * Ejecuta la operación contra la API oficial y, si falla o no está configurada,
 * la reintenta contra Jikan. Devuelve `{ fuente, datos }`.
 */
async function conReserva(operacionOficial, operacionJikan) {
  let errorOficial = null;

  if (oficial.configurado()) {
    try {
      return { fuente: 'oficial', datos: await operacionOficial() };
    } catch (err) {
      if (NO_REINTENTABLES.has(err?.codigo)) throw err;
      errorOficial = err;
    }
  }

  try {
    return { fuente: 'jikan', datos: await operacionJikan() };
  } catch (errorJikan) {
    if (NO_REINTENTABLES.has(errorJikan?.codigo)) throw errorJikan;

    // Las dos fuentes han fallado. El mensaje distingue si el motivo de fondo es
    // que ni siquiera hay Client ID configurado, porque en ese caso la acción
    // que debe tomar el usuario es otra: configurarlo.
    if (!errorOficial) {
      throw new ErrorMal(
        'sin-credencial',
        'Jikan no responde y no hay Client ID de MyAnimeList configurado',
      );
    }
    throw new ErrorMal(
      errorOficial.codigo,
      `${errorOficial.message} (la reserva de Jikan tampoco respondió)`,
    );
  }
}

function buscar(query, limite = 8) {
  const q = String(query || '').trim();
  return conReserva(
    () => oficial.buscar(q, limite),
    () => jikanGet(`/anime?q=${encodeURIComponent(q)}&limit=${limite}`).then(d => d || []),
  );
}

function detalle(malId) {
  const id = Number(malId);
  return conReserva(
    () => oficial.detalle(id),
    () => jikanGet(`/anime/${id}`).then(d => d || null),
  );
}

function relaciones(malId) {
  const id = Number(malId);
  return conReserva(
    () => oficial.relaciones(id),
    () => jikanGet(`/anime/${id}/relations`).then(d => d || []),
  );
}

module.exports = { buscar, detalle, relaciones, jikanGet };
