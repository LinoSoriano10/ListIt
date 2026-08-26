// Tipos de contenido en el renderer.
//
// Antes las tres listas de tipos estaban escritas a mano en modal.js, tags.js y
// tagsManager.js, así que añadir un tipo obligaba a tocar tres ficheros y a
// acordarse de los tres. Ahora salen del proceso principal, que además dice
// cuántas entradas usa cada uno.
//
// La caché evita ir por IPC en cada repintado del modal; `refrescarTipos()` la
// invalida cuando algo puede haber cambiado (crear contenido, cambiar ajustes).

import { api } from '../api.js';

let cache = null;

// Los tres tipos que existían antes de que esto fuera una tabla. Solo se usan
// como red de seguridad si alguien consulta en modo síncrono antes de que la
// caché esté lista; en la práctica cebarTipos() corre al arrancar la app.
const CLAVES_RESPALDO = ['anime', 'serie', 'pelicula'];

async function cargar() {
  if (!cache) cache = await api.tiposObtener();
  return cache;
}

/**
 * Carga los tipos al arrancar, para que las funciones síncronas del renderer
 * (renderTagsModal y el gestor de etiquetas) puedan consultarlos sin ser async.
 */
export async function cebarTipos() {
  return cargar();
}

export function invalidarTipos() {
  cache = null;
}

export async function refrescarTipos() {
  cache = null;
  return cargar();
}

/**
 * Todos los tipos, usados o no. Sirve para distinguir las etiquetas que
 * representan un tipo de las etiquetas libres del usuario.
 */
export async function clavesTipo() {
  return (await cargar()).map(t => t.clave);
}

/**
 * Versión síncrona, para los renderizadores que no pueden ser asíncronos.
 */
export function clavesTipoSync() {
  return cache ? cache.map(t => t.clave) : CLAVES_RESPALDO;
}

/**
 * Tipos que deben ofrecerse en la interfaz: los que tienen entradas, más los
 * que el usuario haya forzado a visibles desde Ajustes.
 *
 * Un tipo sin usar desaparece solo y reaparece al crear la primera entrada, de
 * modo que la app no se cierra al anime pero tampoco enseña lo que no se usa.
 */
export async function tiposVisibles() {
  const todos = await cargar();
  return todos
    .filter(t => (t.visible === 1) || (t.visible !== 0 && t.entradas > 0))
    .sort((a, b) => (a.posicion || 0) - (b.posicion || 0));
}

/**
 * Rellena un `<select>` con los tipos visibles, conservando el valor actual
 * aunque su tipo esté oculto — al editar una entrada de un tipo oculto no se
 * puede cambiar en silencio lo que ya tenía.
 */
export async function poblarSelectorTipos(select, valorActual) {
  const visibles = await tiposVisibles();
  const todos    = await cargar();

  const lista = [...visibles];
  if (valorActual && !lista.some(t => t.clave === valorActual)) {
    const suyo = todos.find(t => t.clave === valorActual);
    if (suyo) lista.push(suyo);
  }

  select.innerHTML = lista
    .map(t => `<option value="${t.clave}">${t.nombre}</option>`)
    .join('');

  if (valorActual) select.value = valorActual;
  return lista;
}

/**
 * Tipo por defecto al crear: el primero visible, o anime si aún no hay nada.
 */
export async function tipoPorDefecto() {
  const visibles = await tiposVisibles();
  return visibles[0]?.clave || 'anime';
}

/**
 * "episodios" o "capítulos" según el tipo, para no hablar de episodios en un manwa.
 */
export async function unidadDe(clave, plural = true) {
  const t = (await cargar()).find(x => x.clave === clave);
  const u = t?.unidad === 'capitulo' ? 'capítulo' : 'episodio';
  return plural ? `${u}s` : u;
}
