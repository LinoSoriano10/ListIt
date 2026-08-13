// Cliente de la API oficial de MyAnimeList v2 (api.myanimelist.net/v2).
//
// Corre en el proceso principal a propósito: así el Client ID nunca entra al
// renderer (ni al DOM, ni al devtools de la ventana) y no hace falta abrir la
// CSP de src/index.html a un dominio nuevo.
//
// Solo se usa el Client ID (cabecera X-MAL-CLIENT-ID), que basta para leer el
// catálogo público. El Client Secret es para OAuth de usuario y esta app no lo
// necesita, así que ni se pide ni se guarda.

const { net } = require('electron');
const credenciales = require('./credenciales');
const {
  CAMPOS_ANIME,
  CAMPOS_BUSQUEDA,
  adaptarAnime,
  adaptarBusqueda,
} = require('./mal-adaptador');

const BASE = 'https://api.myanimelist.net/v2';
const CLAVE_CLIENT_ID = 'mal_client_id';
const TIMEOUT_MS = 15000;

// La API oficial rechaza búsquedas de menos de 3 caracteres con un 400.
const MIN_BUSQUEDA = 3;

/**
 * Error con `codigo` estable para que la UI pueda dar un mensaje distinto según
 * el caso, en lugar del "Error al conectar con MyAnimeList" indiferenciado.
 * Códigos: sin-credencial | credencial-invalida | consulta-corta |
 *          no-encontrado | limite | servicio-caido | red
 */
class ErrorMal extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorMal';
    this.codigo = codigo;
  }
}

function obtenerClientId() {
  return credenciales.leer(CLAVE_CLIENT_ID);
}

function configurado() {
  return !!obtenerClientId();
}

function guardarClientId(valor) {
  return credenciales.guardar(CLAVE_CLIENT_ID, valor);
}

function borrarClientId() {
  return credenciales.borrar(CLAVE_CLIENT_ID);
}

async function pedir(ruta) {
  const clientId = obtenerClientId();
  if (!clientId) {
    throw new ErrorMal('sin-credencial', 'No hay Client ID de MyAnimeList configurado');
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);

  let resp;
  try {
    resp = await net.fetch(`${BASE}${ruta}`, {
      headers: { 'X-MAL-CLIENT-ID': clientId },
      signal: control.signal,
    });
  } catch (err) {
    throw new ErrorMal(
      err?.name === 'AbortError' ? 'servicio-caido' : 'red',
      err?.name === 'AbortError'
        ? 'MyAnimeList no respondió a tiempo'
        : `Sin conexión con MyAnimeList: ${err?.message || err}`,
    );
  } finally {
    clearTimeout(temporizador);
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new ErrorMal('credencial-invalida', 'El Client ID no es válido o fue revocado');
  }
  if (resp.status === 404) {
    throw new ErrorMal('no-encontrado', 'No existe esa entrada en MyAnimeList');
  }
  if (resp.status === 429) {
    throw new ErrorMal('limite', 'Demasiadas peticiones a MyAnimeList');
  }
  if (!resp.ok) {
    throw new ErrorMal('servicio-caido', `MyAnimeList devolvió HTTP ${resp.status}`);
  }

  try {
    return await resp.json();
  } catch {
    throw new ErrorMal('servicio-caido', 'Respuesta ilegible de MyAnimeList');
  }
}

/**
 * Búsqueda por texto. Devuelve un array con forma de Jikan v4.
 */
async function buscar(query, limite = 8) {
  const q = String(query || '').trim();
  if (q.length < MIN_BUSQUEDA) {
    throw new ErrorMal('consulta-corta', 'La búsqueda necesita al menos 3 caracteres');
  }
  const ruta = `/anime?q=${encodeURIComponent(q)}&limit=${limite}&fields=${CAMPOS_BUSQUEDA}`;
  return adaptarBusqueda(await pedir(ruta));
}

/**
 * Ficha completa de un anime por su mal_id, con forma de Jikan v4.
 */
async function detalle(malId) {
  const json = await pedir(`/anime/${Number(malId)}?fields=${CAMPOS_ANIME}`);
  return adaptarAnime(json);
}

/**
 * Relaciones (secuelas, precuelas…) con la forma de /anime/{id}/relations de
 * Jikan. En la API oficial son un campo del detalle, no un endpoint aparte.
 */
async function relaciones(malId) {
  const anime = await detalle(malId);
  return anime?.relations || [];
}

/**
 * Valida un Client ID contra la API sin guardarlo todavía. Lo usa el botón
 * "Probar conexión" de ajustes para dar respuesta inmediata.
 */
async function probarClientId(clientId) {
  const id = String(clientId || '').trim();
  if (!id) throw new ErrorMal('sin-credencial', 'Introduce un Client ID');

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);

  let resp;
  try {
    resp = await net.fetch(`${BASE}/anime?q=one&limit=1&fields=id`, {
      headers: { 'X-MAL-CLIENT-ID': id },
      signal: control.signal,
    });
  } catch (err) {
    throw new ErrorMal(
      err?.name === 'AbortError' ? 'servicio-caido' : 'red',
      'No se pudo contactar con MyAnimeList',
    );
  } finally {
    clearTimeout(temporizador);
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new ErrorMal('credencial-invalida', 'El Client ID no es válido');
  }
  if (!resp.ok) {
    throw new ErrorMal('servicio-caido', `MyAnimeList devolvió HTTP ${resp.status}`);
  }
  return true;
}

module.exports = {
  ErrorMal,
  configurado,
  guardarClientId,
  borrarClientId,
  buscar,
  detalle,
  relaciones,
  probarClientId,
};
