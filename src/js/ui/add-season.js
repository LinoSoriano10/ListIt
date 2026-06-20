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

const JIKAN_DELAY_MS = 400;
const VENTANA_MS = 7 * 24 * 60 * 60 * 1000; // no recomprobar un anime más de una vez por semana
let cancelado    = false;
let scopeSerieId = null;
let ignorados    = new Set();   // mal_id de temporadas que el usuario no quiere que se recomienden

const delay = () => new Promise(r => setTimeout(r, JIKAN_DELAY_MS));

// Jikan limita ~60 req/min; ante un 429 esperamos y reintentamos para que la
// cadena de secuelas no se corte tras la primera temporada.
async function jikanGet(url, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    const resp = await fetch(url);
    if (resp.status === 429) { await new Promise(r => setTimeout(r, 1500)); continue; }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.json()).data;
  }
  throw new Error('Jikan rate limit');
}

async function jikanRelations(malId) {
  return (await jikanGet(`https://api.jikan.moe/v4/anime/${malId}/relations`)) || [];
}

async function jikanAnime(malId) {
  return (await jikanGet(`https://api.jikan.moe/v4/anime/${malId}`)) || null;
}

export async function abrirAddSeason(serieIdPreseleccionada = null) {
  scopeSerieId = serieIdPreseleccionada;
  document.getElementById('modalAddSeason').style.display = 'flex';
  await escanear();
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
  document.getElementById('addSeasonResults').innerHTML = '';
  document.getElementById('btnAddSeasonRescan').style.display = 'none';

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
  try { ignorados = new Set(JSON.parse((await api.getSetting('mal_ignorados')) || '[]')); } catch (_) { ignorados = new Set(); }
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

    let encontrado = false;
    let error      = false;
    try {
      const entregas = await api.getEntregas(s.id);
      const malIds   = new Set(entregas.map(e => e.mal_id).filter(Boolean));
      if (s.mal_id) malIds.add(s.mal_id);

      // Punto de partida: la última temporada con mal_id (o el mal_id del contenido).
      let head  = [...entregas].reverse().find(e => e.mal_id)?.mal_id || s.mal_id;
      let depth = 0;
      while (head && depth < 6) {
        if (cancelado) return;
        const rels = await jikanRelations(head);
        await delay();
        const seq  = rels.find(r => r.relation === 'Sequel');
        const next = seq?.entry?.find(e => e.type === 'anime');
        if (!next) break;

        // Salta (pero sigue la cadena) las que ya tienes o has ignorado: p. ej.
        // los trozos/split-cours de una temporada larga que ya viste.
        if (!malIds.has(next.mal_id) && !ignorados.has(next.mal_id)) {
          const det = await jikanAnime(next.mal_id);
          await delay();
          if (det) { candidatos.push({ serie: s, anime: det }); encontrado = true; }
        }
        malIds.add(next.mal_id);
        head = next.mal_id;
        depth++;
      }
    } catch (_) { error = true; }

    // Solo se marca "comprobada" si terminó sin error y sin novedades: las series
    // con una temporada pendiente se siguen revisando hasta que se añada.
    if (!error && !encontrado) mapa[s.id] = new Date(ahora).toISOString();
  }

  if (cancelado) return;
  await api.setSetting('mal_check_map', JSON.stringify(mapa));

  setProgress(null);
  document.getElementById('btnAddSeasonRescan').style.display = '';
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
    const a    = c.anime;
    const img  = a.images?.jpg?.image_url || '';
    const meta = [a.type, a.year, a.episodes ? a.episodes + ' ep.' : ''].filter(Boolean).join(' · ');
    return `
      <div class="mal-result-item" data-idx="${idx}">
        <img class="mal-result-img" src="${escapeHtml(img)}" alt="">
        <div class="mal-result-info">
          <div class="mal-result-title">${escapeHtml(a.title || '')}</div>
          <div class="mal-result-meta">${escapeHtml(c.serie.titulo)} · ${escapeHtml(meta)}</div>
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
      ignorados.add(candidatos[parseInt(btn.dataset.idx)].anime.mal_id);
      await api.setSetting('mal_ignorados', JSON.stringify([...ignorados]));
      btn.closest('.mal-result-item').remove();
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
  await api.guardarEntregaCompleta({
    contenido_id:      serie.id,
    numero:            `T${entregas.length + 1}`,
    titulo:            anime.title || '',
    episodios_totales: anime.episodes || 0,
    episodio_actual:   0,
    visto:             0,
    mal_id:            anime.mal_id || null,
  });
  toast.success(`Añadida a «${serie.titulo}»: ${anime.title}`);
  await cargarContenido(document.getElementById('searchBar')?.value || '');
  if (state.idActual === serie.id) mostrarDetalle(serie.id);
}

export function inicializarAddSeason() {
  document.getElementById('btnAddSeasonRescan').addEventListener('click', () => escanear(true));
}
