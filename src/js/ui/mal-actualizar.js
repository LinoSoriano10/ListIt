// Actualizar desde MyAnimeList: una sola pasada que refresca las fichas que ya
// tienes y, de camino, encuentra las temporadas que te faltan.
//
// Antes eran dos botones. Se solapaban de verdad: la sincronizacion masiva
// detectaba secuelas y solo te lo contaba por texto, sin poder anadirlas, y como
// `relaciones()` del cliente oficial descarga la ficha entera y descarta todo
// menos las relaciones, recorrer una franquicia traia fichas que la otra pasada
// volvia a pedir. Ahora hay un unico recorrido con una cache compartida.
//
// El usuario confirma cada temporada antes de anadirla: las relaciones de MAL
// incluyen peliculas y OVAs, y no todas se quieren.
//
// Los ids del DOM conservan el prefijo `addSeason` de cuando esto era solo el
// buscador de temporadas. Renombrarlos no aportaria nada al usuario y si
// riesgo, asi que se dejan.

import { api } from '../api.js';
import { state } from '../state.js';
import { escapeHtml } from '../lib/escape.js';
import { toast } from '../lib/toast.js';
import { cargarContenido } from './content.js';
import { mostrarDetalle } from './detail.js';
import { tituloMAL, codigoEmision } from '../lib/mal-format.js';
import { mensajeErrorMal } from '../lib/mal-errores.js';
import { crearCache, dentroDeVentana } from '../lib/mal-cache.js';
import { recorrerFranquicia, RELACIONES_SEGUIDAS } from '../lib/mal-franquicia.js';

// Ritmo entre peticiones. La API oficial es más permisiva, pero la reserva de
// Jikan limita a ~3 req/s y el proveedor puede caer a ella en cualquier momento.
const MAL_DELAY_MS = 400;
const VENTANA_MS = 7 * 24 * 60 * 60 * 1000; // no recomprobar un anime más de una vez por semana
let cancelado    = false;
let scopeSerieId = null;
let ignorados    = new Map();   // mal_id -> título de las temporadas ignoradas (restaurables)

// Relaciones ya conocidas entre pasadas: mal_id -> relaciones podadas.
// Solo se guardan las de nodos que TIENEN secuela; los que no la tienen son la
// punta de la franquicia y hay que volver a preguntar por ellos cada vez, que es
// justo donde aparece una temporada nueva.
let relacionadosMap = {};

const delay = () => new Promise(r => setTimeout(r, MAL_DELAY_MS));

async function malAnime(malId) {
  const res = await api.malDetalle(malId);
  if (!res.ok) throw new Error(mensajeErrorMal(res.codigo, res.mensaje));
  return res.datos || null;
}

/**
 * Detalle de un anime pasando por la caché de la pasada. Es la ÚNICA vía de
 * descarga: quien necesite las relaciones las lee de aquí, en vez de pedirlas
 * por separado a un endpoint que acaba trayendo el mismo objeto entero.
 */
function detalleCacheado(cache, malId) {
  return cache.obtener(malId, async () => {
    const det = await malAnime(malId);
    await delay();
    return det;
  });
}

// Relaciones que interesan, podadas para que quepan holgadas en el ajuste.
function podarRelaciones(relaciones) {
  return (relaciones || []).filter(r => RELACIONES_SEGUIDAS.includes(String(r.relation).toLowerCase()));
}

/**
 * Función de relaciones que consume el recorrido de franquicia: consulta lo ya
 * guardado entre pasadas y, si no, descarga por la caché.
 */
function lectorDeRelaciones(cache) {
  return async (malId) => {
    if (relacionadosMap[malId]) return relacionadosMap[malId];

    const det  = await detalleCacheado(cache, malId);
    const rels = podarRelaciones(det?.relations);

    // Solo se persiste si tiene secuela. Un nodo sin ella es la punta de la
    // cadena y debe volver a consultarse: es donde brota lo nuevo.
    if (rels.some(r => String(r.relation).toLowerCase() === 'sequel')) {
      relacionadosMap[malId] = rels;
    }
    return rels;
  };
}

export async function abrirActualizarMal(serieIdPreseleccionada = null) {
  scopeSerieId = serieIdPreseleccionada;
  cancelado = false;
  document.getElementById('modalAddSeason').style.display = 'flex';
  // El modal se comparte con la búsqueda manual, que le cambia el título.
  document.getElementById('addSeasonTitulo').textContent = 'Actualizar desde MyAnimeList';
  await etiquetarNoEmitidasUnaVez();
  await escanear();
}

// Etiquetado one-shot (Camino B). Las temporadas anunciadas que ya tenías
// añadidas como entregas vacías bloqueaban el "completado". Una sola vez, se
// confirman contra MAL y las que aún no han emitido se marcan `no_emitido` —
// NO se borra nada. Al desbloquearse, las entradas que solo esperaban esa
// temporada pasan a 'completado'. Si se cierra el modal a media revisión, no se
// marca el flag y se reintenta en la próxima apertura.
async function etiquetarNoEmitidasUnaVez() {
  if (await api.getSetting('cleanup_proximamente_v1')) return;

  let candidatas = [];
  try { candidatas = await api.getEntregasNoEmitidasCandidatas(); } catch (_) { return; }
  if (candidatas.length === 0) {
    await api.setSetting('cleanup_proximamente_v1', '1');
    return;
  }

  setProgress(0);
  const confirmadas = [];
  for (let i = 0; i < candidatas.length; i++) {
    if (cancelado) return;
    setProgress(Math.round((i / candidatas.length) * 100));
    setStatus(`Revisando temporadas anunciadas ${i + 1}/${candidatas.length}…`);
    try {
      const det = await malAnime(candidatas[i].mal_id);
      await delay();
      if (det && codigoEmision(det.status) === 'proximamente') confirmadas.push(candidatas[i].id);
    } catch (_) { /* sin red para esta: se deja como estaba */ }
  }

  if (confirmadas.length > 0) {
    const r = await api.marcarEntregasNoEmitidas(confirmadas);
    const n = r?.marcadas    || confirmadas.length;
    const m = r?.completadas || 0;
    toast.success(`${n} temporada${n !== 1 ? 's' : ''} marcada${n !== 1 ? 's' : ''} como próxima${n !== 1 ? 's' : ''}` +
      (m > 0 ? ` · ${m} entrada${m !== 1 ? 's' : ''} completada${m !== 1 ? 's' : ''}` : ''));
    if (m > 0) await cargarContenido(document.getElementById('searchBar')?.value || '');
  }
  await api.setSetting('cleanup_proximamente_v1', '1');
  setProgress(null);
}

export function cerrarActualizarMal() {
  cancelado = true;
  document.getElementById('modalAddSeason').style.display = 'none';
}

function setStatus(texto) {
  document.getElementById('addSeasonStatus').textContent = texto;
}

function setProgress(pct) {
  const wrap = document.getElementById('addSeasonProgWrap');
  wrap.style.display = pct == null ? 'none' : '';
  if (pct != null) document.getElementById('addSeasonBar').style.width = pct + '%';
}

async function escanear(forzar = false) {
  cancelado = false;
  let huboCambioEstado = false;   // (Camino B) alguna temporada pasó de anunciada a emitida
  document.getElementById('addSeasonResults').innerHTML = '';
  document.getElementById('btnAddSeasonRescan').style.display = 'none';

  try {
    const raw = JSON.parse((await api.getSetting('mal_ignorados')) || '[]');
    ignorados = new Map(raw.map(x => Array.isArray(x) ? x : [x, '']));  // compat formato antiguo (solo ids)
  } catch (_) { ignorados = new Map(); }
  actualizarBotonIgnoradas();

  // TODAS las entradas con mal_id, películas incluidas: su ficha también se
  // refresca aunque no tengan temporadas que buscar.
  let items = (await api.getContenido({})).filter(i => i.mal_id);
  if (scopeSerieId) items = items.filter(i => i.id === scopeSerieId);

  if (items.length === 0) {
    setProgress(null);
    setStatus('No hay entradas con MyAnimeList para revisar.');
    return;
  }

  // La ventana de 7 días solo gobierna la BÚSQUEDA DE TEMPORADAS: una temporada
  // nueva tarda meses. Las fichas se refrescan siempre, porque puntuación y
  // estado de emisión cambian de semana en semana.
  let mapa = {};
  try { mapa = JSON.parse((await api.getSetting('mal_check_map')) || '{}'); } catch (_) { mapa = {}; }
  try { relacionadosMap = JSON.parse((await api.getSetting('mal_relacionados_map')) || '{}'); }
  catch (_) { relacionadosMap = {}; }

  const ahora       = Date.now();
  const sinThrottle = forzar || scopeSerieId;
  // Las películas no tienen temporadas que recorrer, pero sí ficha que actualizar.
  const escaneables = items.filter(i => i.tipo !== 'pelicula');
  const aEscanear   = new Set(
    (sinThrottle ? escaneables : escaneables.filter(s => !dentroDeVentana(mapa[s.id], ahora, VENTANA_MS)))
      .map(s => s.id)
  );
  const omitidas = escaneables.length - aEscanear.size;

  setProgress(0);
  const candidatos = [];
  const cache      = crearCache();
  const relaciones = lectorDeRelaciones(cache);
  const resumen    = { actualizadas: 0, sinCambios: 0, errores: [] };

  for (let i = 0; i < items.length; i++) {
    if (cancelado) return;
    const s = items[i];
    const escanea = aEscanear.has(s.id);
    setProgress(Math.round((i / items.length) * 100));
    setStatus(`${escanea ? 'Revisando' : 'Actualizando'} ${i + 1}/${items.length}: ${s.titulo}`);

    let accionable = false;   // (Camino B) candidato que YA emite (no solo anunciado)
    let error      = false;
    try {
      // ── Paso 1: refrescar la ficha. Siempre, para todas ──────────────────
      // El detalle queda en la caché, así que el recorrido de abajo lo reutiliza
      // en vez de volver a pedirlo.
      const propio = await detalleCacheado(cache, s.mal_id);
      if (!propio) throw new Error('Sin datos');
      const act = await api.actualizarDesdeMal(s.id, propio);
      if (act.cambios.length > 0) resumen.actualizadas++;
      else resumen.sinCambios++;

      // ── Paso 2: buscar temporadas. Solo si toca y no es película ─────────
      if (escanea) {
        const entregas = await api.getEntregas(s.id);
        // El propio contenido es su 1ª temporada → siempre cuenta como poseído (si
        // no, una entrada de 1 temporada con MAL se ofrecería a sí misma como T2).
        const owned = new Set([s.mal_id, ...entregas.map(e => e.mal_id).filter(Boolean)]);

        // (Camino B) Transición: ¿alguna temporada marcada "no emitida" ya empezó
        // a emitir? Se le quita la marca, pasa a contar y la entrada vuelve de
        // 'completado' a 'pendiente' (ahora sí hay algo nuevo que ver).
        for (const e of entregas) {
          if (cancelado) return;
          if (e.no_emitido && e.mal_id) {
            const det = await detalleCacheado(cache, e.mal_id);
            if (det && codigoEmision(det.status) !== 'proximamente') {
              await api.marcarEntregaEmitida(e.id, det.episodes || 0);
              huboCambioEstado = true;
            }
          }
        }

        // Recorre la franquicia entera desde su raíz siguiendo secuelas E
        // historias paralelas: las películas y las OVAs cuelgan de lado, no
        // encadenadas, y con la cadena lineal de antes eran inalcanzables.
        // Ofrece lo que no tengas y no hayas ignorado, así que reaparece
        // también lo borrado, no solo lo nuevo.
        const { nodos, espina } = await recorrerFranquicia(s.mal_id, relaciones, {
          abortado: () => cancelado,
        });
        if (cancelado) return;

        for (const id of nodos) {
          if (owned.has(id) || ignorados.has(id)) continue;
          const det = await detalleCacheado(cache, id);
          if (!det) continue;
          candidatos.push({ serie: s, anime: det });
          if (codigoEmision(det.status) !== 'proximamente') accionable = true;
        }

        // (B) Marca de emisión de la franquicia = estado de su última TEMPORADA.
        // Sale de la espina de secuelas a propósito: tomarlo de una película
        // paralela daría un estado equivocado.
        try {
          const ultima = espina[espina.length - 1];
          const ult = await detalleCacheado(cache, ultima);
          if (ult) await api.setEmisionFranquicia(s.id, codigoEmision(ult.status));
        } catch (_) { /* la marca de emisión es best-effort */ }
      }
    } catch (err) {
      error = true;
      resumen.errores.push(`${s.titulo}: ${err.message || err}`);
    }

    // Tras revisar sin error: si hay una temporada que YA emite se quita la marca
    // para re-revisar siempre (hasta añadirla/ignorarla); si solo hay anunciadas
    // (próximamente) o está limpia, se marca comprobada y se re-consulta dentro de
    // una semana (suficiente para detectar que una anunciada empiece a emitir).
    // La marca de "comprobado" solo tiene sentido para lo que se escaneo: las
    // fichas se refrescan siempre y no participan en la ventana.
    if (!error && escanea) {
      if (accionable) delete mapa[s.id];
      else mapa[s.id] = new Date(ahora).toISOString();
    }
  }

  if (cancelado) return;
  await api.setSetting('mal_check_map', JSON.stringify(mapa));
  await api.setSetting('mal_relacionados_map', JSON.stringify(relacionadosMap));

  setProgress(null);
  document.getElementById('btnAddSeasonRescan').style.display = '';
  // (Camino B) Si alguna temporada empezó a emitir, refrescar el grid/ficha para
  // reflejar el cambio de 'completado' → 'pendiente'.
  if (huboCambioEstado) {
    await cargarContenido(document.getElementById('searchBar')?.value || '');
    if (state.idActual) mostrarDetalle(state.idActual);
  }
  renderCandidatos(candidatos, omitidas, resumen, cache.estadisticas());
}

/**
 * Resumen de la parte de fichas, que antes vivía en su propio modal.
 */
function resumenFichas(r, stats) {
  if (!r) return '';
  const ahorro = stats?.aciertos
    ? `<div class="malsync-ahorro">${stats.aciertos} petición${stats.aciertos !== 1 ? 'es' : ''} ahorrada${stats.aciertos !== 1 ? 's' : ''} reutilizando lo ya descargado</div>`
    : '';
  return `
    <div class="malsync-result-summary">
      <div class="malsync-result-card">
        <div class="malsync-result-num" style="color:var(--viendo)">${r.actualizadas}</div>
        <div class="malsync-result-label">Fichas actualizadas</div>
      </div>
      <div class="malsync-result-card">
        <div class="malsync-result-num" style="color:var(--muted)">${r.sinCambios}</div>
        <div class="malsync-result-label">Sin cambios</div>
      </div>
      <div class="malsync-result-card">
        <div class="malsync-result-num" style="color:var(--abandonado)">${r.errores.length}</div>
        <div class="malsync-result-label">Errores</div>
      </div>
    </div>
    ${ahorro}
    ${r.errores.length > 0 ? `
      <div class="malsync-novedades" style="background:rgba(244,63,94,0.08);border-color:rgba(244,63,94,0.3)">
        <h4 style="color:var(--abandonado)">Errores</h4>
        <ul>${r.errores.slice(0, 12).map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
      </div>` : ''}
  `;
}

function renderCandidatos(candidatos, omitidas = 0, resumen = null, stats = null) {
  const results = document.getElementById('addSeasonResults');
  const cabecera = resumenFichas(resumen, stats);
  const extra = omitidas > 0 ? ` · ${omitidas} ya comprobada${omitidas !== 1 ? 's' : ''} esta semana` : '';

  if (candidatos.length === 0) {
    setStatus(`No se han detectado nuevas temporadas${extra}.`);
    results.innerHTML = cabecera;
    return;
  }
  const n = candidatos.length;
  setStatus(`${n} nueva${n !== 1 ? 's' : ''} temporada${n !== 1 ? 's' : ''} detectada${n !== 1 ? 's' : ''}${extra}:`);

  results.innerHTML = cabecera + candidatos.map((c, idx) => {
    const a       = c.anime;
    const img     = a.images?.jpg?.image_url || '';
    const meta    = [a.type, a.year, a.episodes ? a.episodes + ' ep.' : ''].filter(Boolean).join(' · ');
    // Camino B: avisar de que esta temporada aún no ha emitido. Al añadirla entra
    // como "Próximamente" y no bloquea el "completado".
    const proxima = codigoEmision(a.status) === 'proximamente';
    const badge   = proxima ? ' <span class="mal-result-badge">Próximamente</span>' : '';
    return `
      <div class="mal-result-item" data-idx="${idx}">
        <img class="mal-result-img" src="${escapeHtml(img)}" alt="">
        <div class="mal-result-info">
          <div class="mal-result-title mq"><span class="mq__i">${escapeHtml(tituloMAL(a))}</span></div>
          <div class="mal-result-meta">${escapeHtml(c.serie.titulo)} · ${escapeHtml(meta)}${badge}</div>
        </div>
        <button class="btn-secondary" data-act="ignorar" data-idx="${idx}" style="margin-left:auto" title="Ya lo viste o es un trozo de otra temporada">Ignorar</button>
        <button class="btn-primary"   data-act="add"     data-idx="${idx}">Añadir</button>
      </div>`;
  }).join('');

  results.querySelectorAll('button[data-act="add"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await anadirTemporada(candidatos[parseInt(btn.dataset.idx)]);
      btn.closest('.mal-result-item').remove();
    });
  });
  results.querySelectorAll('button[data-act="ignorar"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const c = candidatos[parseInt(btn.dataset.idx)];
      // Acción consciente: confirmar para que un clic accidental no la condene.
      if (!confirm(`¿Ignorar «${tituloMAL(c.anime)}»?\nDejará de recomendarse; puedes deshacerlo en «Ignoradas».`)) return;
      ignorados.set(c.anime.mal_id, tituloMAL(c.anime));
      await api.setSetting('mal_ignorados', JSON.stringify([...ignorados]));
      actualizarBotonIgnoradas();
      btn.closest('.mal-result-item').remove();
    });
  });
}

function actualizarBotonIgnoradas() {
  const btn = document.getElementById('btnVerIgnoradas');
  if (!btn) return;
  btn.textContent = `Ignoradas (${ignorados.size})`;
  btn.style.display = ignorados.size > 0 ? '' : 'none';
}

// Lista de temporadas ignoradas con opción de restaurarlas (deshacer el ignorar).
async function mostrarIgnoradas() {
  setProgress(null);
  const results = document.getElementById('addSeasonResults');
  document.getElementById('btnAddSeasonRescan').style.display = '';
  if (ignorados.size === 0) {
    setStatus('No tienes temporadas ignoradas.');
    results.innerHTML = '';
    return;
  }

  // Rellena los títulos que falten (ignorados guardados sin título, formato antiguo).
  const faltan = [...ignorados.entries()].filter(([, t]) => !t).map(([mid]) => mid);
  if (faltan.length) {
    setStatus('Cargando temporadas ignoradas…');
    results.innerHTML = '';
    let cambiado = false;
    for (const mid of faltan) {
      try {
        const det = await malAnime(mid);
        await delay();
        const t = det ? tituloMAL(det) : '';
        if (t) { ignorados.set(mid, t); cambiado = true; }
      } catch (_) { /* sin red: se deja el id como respaldo */ }
    }
    if (cambiado) await api.setSetting('mal_ignorados', JSON.stringify([...ignorados]));
  }

  setStatus(`Temporadas ignoradas (${ignorados.size}) — restaura las que quieras:`);
  results.innerHTML = [...ignorados.entries()].map(([mid, titulo]) => `
    <div class="mal-result-item">
      <div class="mal-result-info">
        <div class="mal-result-title mq"><span class="mq__i">${escapeHtml(titulo || `MyAnimeList #${mid}`)}</span></div>
      </div>
      <button class="btn-secondary" data-restaurar="${mid}" style="margin-left:auto">Restaurar</button>
    </div>`).join('');
  results.querySelectorAll('button[data-restaurar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      ignorados.delete(parseInt(btn.dataset.restaurar));
      await api.setSetting('mal_ignorados', JSON.stringify([...ignorados]));
      actualizarBotonIgnoradas();
      mostrarIgnoradas();
    });
  });
}

async function anadirTemporada({ serie, anime }) {
  const entregas = await api.getEntregas(serie.id);
  // Si la serie tenía una sola temporada autocreada sin título, dale el de la
  // serie para que no quede en blanco al pasar a multi-temporada.
  if (entregas.length === 1 && !entregas[0].titulo) {
    await api.renombrarEntrega(entregas[0].id, serie.titulo);
  }
  // Camino B: una temporada anunciada pero aún no emitida entra marcada como
  // `no_emitido`: visible en la ficha pero sin contar para el "completado".
  const noEmitido = codigoEmision(anime.status) === 'proximamente';
  await api.guardarEntregaCompleta({
    contenido_id:      serie.id,
    numero:            `T${entregas.length + 1}`,
    titulo:            tituloMAL(anime),
    episodios_totales: anime.episodes || 0,
    episodio_actual:   0,
    visto:             0,
    mal_id:            anime.mal_id || null,
    no_emitido:        noEmitido ? 1 : 0,
  });
  toast.success(`Añadida a «${serie.titulo}»: ${tituloMAL(anime)}${noEmitido ? ' (próximamente)' : ''}`);
  await cargarContenido(document.getElementById('searchBar')?.value || '');
  if (state.idActual === serie.id) mostrarDetalle(serie.id);
}

// ─── Añadir una temporada concreta buscándola a mano ─────────────────────────
//
// El escaneo automático solo encuentra lo que MyAnimeList relaciona, y no
// siempre relaciona todo. Esto permite buscar cualquier entrada y engancharla
// como temporada de una serie.
//
// La otra vía —el buscador de MAL dentro de la edición— no sirve para esto: está
// pensada para CREAR una entrada, así que sobrescribe título, imagen y campos de
// la que estés editando. Aquí solo se añade una entrega y la entrada padre no se
// toca.

export async function abrirBuscarTemporada(serieId) {
  const serie = await api.getDetalle(serieId);
  if (!serie) return;

  // Lo que ya tiene esta serie, para no ofrecer duplicados.
  const entregas = await api.getEntregas(serieId);
  const owned = new Set([serie.mal_id, ...entregas.map(e => e.mal_id).filter(Boolean)]);

  cancelado = false;
  document.getElementById('modalAddSeason').style.display = 'flex';
  document.getElementById('addSeasonTitulo').textContent = 'Añadir temporada desde MAL';
  document.getElementById('btnAddSeasonRescan').style.display = 'none';
  document.getElementById('btnVerIgnoradas').style.display = 'none';
  setProgress(null);
  setStatus(`Busca la temporada o película que quieras añadir a «${serie.titulo}».`);

  const results = document.getElementById('addSeasonResults');
  results.innerHTML = `
    <div class="entrega-add" style="margin-bottom:10px">
      <input class="entrega-add-input" type="text" id="buscarTempInput"
             placeholder="Título, o pega una URL de MyAnimeList…" autocomplete="off">
      <button class="entrega-add-btn entrega-add-btn--texto" id="buscarTempBtn">Buscar</button>
    </div>
    <div id="buscarTempResultados"></div>`;

  const input = document.getElementById('buscarTempInput');
  const zona  = document.getElementById('buscarTempResultados');

  const buscar = async () => {
    const q = input.value.trim();
    if (!q) return;
    zona.innerHTML = '<div class="mal-loading">Buscando…</div>';

    // Se admite pegar la URL de MAL: es la vía fiable cuando el título es
    // ambiguo o la búsqueda no lo saca.
    const url = q.match(/myanimelist\.net\/anime\/(\d+)/);
    const res = url ? await api.malDetalle(url[1]) : await api.malBuscar(q, 10);

    if (!res.ok) {
      zona.innerHTML = `<div class="mal-empty">${escapeHtml(mensajeErrorMal(res.codigo, res.mensaje))}</div>`;
      return;
    }
    const lista = url ? (res.datos ? [res.datos] : []) : (res.datos || []);
    if (lista.length === 0) {
      zona.innerHTML = '<div class="mal-empty">Sin resultados</div>';
      return;
    }
    renderBusqueda(zona, lista, serie, owned);
  };

  document.getElementById('buscarTempBtn').addEventListener('click', buscar);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
  input.focus();
}

function renderBusqueda(zona, lista, serie, owned) {
  zona.innerHTML = lista.map((a, idx) => {
    const img  = a.images?.jpg?.image_url || '';
    const meta = [a.type, a.year, a.episodes ? a.episodes + ' ep.' : ''].filter(Boolean).join(' · ');
    const yaEsta = owned.has(a.mal_id);
    const proxima = codigoEmision(a.status) === 'proximamente';
    const badge = proxima ? ' <span class="mal-result-badge">Próximamente</span>' : '';
    return `
      <div class="mal-result-item">
        <img class="mal-result-img" src="${escapeHtml(img)}" alt="">
        <div class="mal-result-info">
          <div class="mal-result-title mq"><span class="mq__i">${escapeHtml(tituloMAL(a))}</span></div>
          <div class="mal-result-meta">${escapeHtml(meta)}${badge}</div>
        </div>
        ${yaEsta
          ? '<span class="mal-ya-esta" style="margin-left:auto">Ya la tienes</span>'
          : `<button class="btn-primary" data-idx="${idx}" style="margin-left:auto">Añadir</button>`}
      </div>`;
  }).join('');

  zona.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const anime = lista[parseInt(btn.dataset.idx)];
      await anadirTemporada({ serie, anime });
      owned.add(anime.mal_id);
      // Se re-pinta para que la que acaba de entrar figure como ya añadida y no
      // se pueda duplicar de un doble clic.
      renderBusqueda(zona, lista, serie, owned);
    });
  });
}

export function inicializarActualizarMal() {
  document.getElementById('btnAddSeasonRescan').addEventListener('click', () => escanear(true));
  document.getElementById('btnVerIgnoradas').addEventListener('click', mostrarIgnoradas);
}
