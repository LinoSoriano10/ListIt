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
let cancelado    = false;
let scopeSerieId = null;

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

async function escanear() {
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

  setProgress(0);
  const candidatos = [];

  for (let i = 0; i < items.length; i++) {
    if (cancelado) return;
    const s = items[i];
    setProgress(Math.round((i / items.length) * 100));
    setStatus(`Revisando ${i + 1}/${items.length}: ${s.titulo}`);

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
        if (!next || malIds.has(next.mal_id)) break;

        const det = await jikanAnime(next.mal_id);
        await delay();
        if (!det) break;

        candidatos.push({ serie: s, anime: det });
        malIds.add(next.mal_id);
        head = next.mal_id;     // seguir la cadena por si faltan varias
        depth++;
      }
    } catch (_) { /* serie con error de red: se omite */ }
  }

  if (cancelado) return;
  setProgress(null);
  document.getElementById('btnAddSeasonRescan').style.display = '';
  renderCandidatos(candidatos);
}

function renderCandidatos(candidatos) {
  const results = document.getElementById('addSeasonResults');
  if (candidatos.length === 0) {
    setStatus('No se han detectado nuevas temporadas.');
    results.innerHTML = '';
    return;
  }
  const n = candidatos.length;
  setStatus(`${n} nueva${n !== 1 ? 's' : ''} temporada${n !== 1 ? 's' : ''} detectada${n !== 1 ? 's' : ''}:`);

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
        <button class="btn-primary" data-idx="${idx}" style="margin-left:auto">Añadir</button>
      </div>`;
  }).join('');

  results.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await anadirTemporada(candidatos[parseInt(btn.dataset.idx)]);
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
  document.getElementById('btnAddSeasonRescan').addEventListener('click', escanear);
}
