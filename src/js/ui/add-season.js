// Menú "Nuevas temporadas desde MAL" (F2 / detección).
// Revisa las series con mal_id y detecta secuelas (nuevas temporadas) que aún no
// están en la biblioteca, siguiendo la cadena de relaciones de Jikan desde la
// última temporada conocida. El usuario confirma cuáles añadir, porque las
// relaciones "Sequel" de MAL pueden incluir películas, OVAs o recopilatorios.

import { api } from '../api.js';
import { state } from '../state.js';
import { escapeHtml } from '../lib/escape.js';
import { toast } from '../lib/toast.js';
import { cargarContenido } from './content.js';
import { mostrarDetalle } from './detail.js';
import { tituloMAL, codigoEmision } from '../lib/mal-format.js';
import { jikanGet } from '../lib/jikan.js';

const JIKAN_DELAY_MS = 400;
const VENTANA_MS = 7 * 24 * 60 * 60 * 1000; // no recomprobar un anime más de una vez por semana
let cancelado    = false;
let scopeSerieId = null;
let ignorados    = new Map();   // mal_id -> título de las temporadas ignoradas (restaurables)
let sequelMap    = {};          // caché de la cadena: mal_id -> mal_id de su secuela

const delay = () => new Promise(r => setTimeout(r, JIKAN_DELAY_MS));

async function jikanRelations(malId) {
  return (await jikanGet(`https://api.jikan.moe/v4/anime/${malId}/relations`)) || [];
}

async function jikanAnime(malId) {
  return (await jikanGet(`https://api.jikan.moe/v4/anime/${malId}`)) || null;
}

// Devuelve el mal_id de la secuela de `malId` (o null). Cachea solo los enlaces
// positivos: un "sin secuela" no se guarda porque la punta puede recibir una nueva.
async function sequelDe(malId) {
  if (sequelMap[malId]) return sequelMap[malId];
  const rels = await jikanRelations(malId);
  await delay();
  const seq  = rels.find(r => r.relation === 'Sequel');
  const next = seq?.entry?.find(e => e.type === 'anime');
  if (next) { sequelMap[malId] = next.mal_id; return next.mal_id; }
  return null;
}

export async function abrirAddSeason(serieIdPreseleccionada = null) {
  scopeSerieId = serieIdPreseleccionada;
  cancelado = false;
  document.getElementById('modalAddSeason').style.display = 'flex';
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
      const det = await jikanAnime(candidatas[i].mal_id);
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

export function cerrarAddSeason() {
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

  // Series candidatas: con mal_id y que no sean películas. Todas, o solo una.
  let items = (await api.getContenido({})).filter(i => i.mal_id && i.tipo !== 'pelicula');
  if (scopeSerieId) items = items.filter(i => i.id === scopeSerieId);

  if (items.length === 0) {
    setProgress(null);
    setStatus('No hay series con MyAnimeList para revisar.');
    return;
  }

  // No re-consultamos un anime más de una vez por semana (una temporada nueva
  // tarda meses o años). La última comprobación por serie vive en settings.
  let mapa = {};
  try { mapa = JSON.parse((await api.getSetting('mal_check_map')) || '{}'); } catch (_) { mapa = {}; }
  try { sequelMap = JSON.parse((await api.getSetting('mal_sequel_map')) || '{}'); } catch (_) { sequelMap = {}; }
  const ahora       = Date.now();
  const sinThrottle = forzar || scopeSerieId;
  const aRevisar    = sinThrottle
    ? items
    : items.filter(s => ahora - (Date.parse(mapa[s.id]) || 0) > VENTANA_MS);
  const omitidas    = items.length - aRevisar.length;

  if (aRevisar.length === 0) {
    setProgress(null);
    document.getElementById('btnAddSeasonRescan').style.display = '';
    setStatus('Todo comprobado recientemente. Pulsa «Re-escanear todo» para forzar.');
    return;
  }

  setProgress(0);
  const candidatos = [];

  for (let i = 0; i < aRevisar.length; i++) {
    if (cancelado) return;
    const s = aRevisar[i];
    setProgress(Math.round((i / aRevisar.length) * 100));
    setStatus(`Revisando ${i + 1}/${aRevisar.length}: ${s.titulo}`);

    let accionable = false;   // (Camino B) candidato que YA emite (no solo anunciado)
    let error      = false;
    try {
      const entregas = await api.getEntregas(s.id);
      // El propio contenido es su 1ª temporada → siempre cuenta como poseído (si
      // no, una entrada de 1 temporada con MAL se ofrecería a sí misma como T2).
      const owned    = new Set([s.mal_id, ...entregas.map(e => e.mal_id).filter(Boolean)]);

      // (Camino B) Transición: ¿alguna temporada marcada "no emitida" ya empezó a
      // emitir? Se le quita la marca, pasa a contar y la entrada vuelve de
      // 'completado' a 'pendiente' (ahora sí hay algo nuevo que ver).
      for (const e of entregas) {
        if (cancelado) return;
        if (e.no_emitido && e.mal_id) {
          const det = await jikanAnime(e.mal_id);
          await delay();
          if (det && codigoEmision(det.status) !== 'proximamente') {
            await api.marcarEntregaEmitida(e.id, det.episodes || 0);
            huboCambioEstado = true;
          }
        }
      }

      // Recorre TODA la cadena de la franquicia desde su raíz (mal_id del
      // contenido = 1ª temporada) y ofrece cualquier temporada que no tengas y no
      // hayas ignorado: así reaparecen las borradas, no solo las nuevas. Las que
      // ya tienes se saltan pero se sigue la cadena (split-cours, huecos, etc.).
      let cur     = s.mal_id;
      let depth   = 0;
      let tail    = s.mal_id;   // (B) última temporada de la cadena
      let tailDet = null;       // su detalle MAL, si se llegó a consultar
      const visto = new Set();
      while (cur && depth < 20 && !visto.has(cur)) {
        visto.add(cur);
        tail = cur; tailDet = null;
        if (cancelado) return;
        if (!owned.has(cur) && !ignorados.has(cur)) {
          const det = await jikanAnime(cur);
          await delay();
          if (det) {
            candidatos.push({ serie: s, anime: det });
            tailDet = det;
            if (codigoEmision(det.status) !== 'proximamente') accionable = true;
          }
        }
        cur = await sequelDe(cur);
        depth++;
      }

      // (B) Marca de emisión de la franquicia = estado de su última temporada.
      try {
        const ult = tailDet || await jikanAnime(tail);
        if (!tailDet) await delay();
        if (ult) await api.setEmisionFranquicia(s.id, codigoEmision(ult.status));
      } catch (_) { /* la marca de emisión es best-effort */ }
    } catch (_) { error = true; }

    // Tras revisar sin error: si hay una temporada que YA emite se quita la marca
    // para re-revisar siempre (hasta añadirla/ignorarla); si solo hay anunciadas
    // (próximamente) o está limpia, se marca comprobada y se re-consulta dentro de
    // una semana (suficiente para detectar que una anunciada empiece a emitir).
    if (!error) {
      if (accionable) delete mapa[s.id];
      else mapa[s.id] = new Date(ahora).toISOString();
    }
  }

  if (cancelado) return;
  await api.setSetting('mal_check_map', JSON.stringify(mapa));
  await api.setSetting('mal_sequel_map', JSON.stringify(sequelMap));

  setProgress(null);
  document.getElementById('btnAddSeasonRescan').style.display = '';
  // (Camino B) Si alguna temporada empezó a emitir, refrescar el grid/ficha para
  // reflejar el cambio de 'completado' → 'pendiente'.
  if (huboCambioEstado) {
    await cargarContenido(document.getElementById('searchBar')?.value || '');
    if (state.idActual) mostrarDetalle(state.idActual);
  }
  renderCandidatos(candidatos, omitidas);
}

function renderCandidatos(candidatos, omitidas = 0) {
  const results = document.getElementById('addSeasonResults');
  const extra = omitidas > 0 ? ` · ${omitidas} ya comprobada${omitidas !== 1 ? 's' : ''} esta semana` : '';
  if (candidatos.length === 0) {
    setStatus(`No se han detectado nuevas temporadas${extra}.`);
    results.innerHTML = '';
    return;
  }
  const n = candidatos.length;
  setStatus(`${n} nueva${n !== 1 ? 's' : ''} temporada${n !== 1 ? 's' : ''} detectada${n !== 1 ? 's' : ''}${extra}:`);

  results.innerHTML = candidatos.map((c, idx) => {
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
        const det = await jikanAnime(mid);
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

export function inicializarAddSeason() {
  document.getElementById('btnAddSeasonRescan').addEventListener('click', () => escanear(true));
  document.getElementById('btnVerIgnoradas').addEventListener('click', mostrarIgnoradas);
}
