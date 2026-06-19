// Menú "Añadir temporada desde MAL" (F2).
// Busca animes en Jikan y los añade como entregas (temporadas) a una serie
// existente, con su mal_id y sin duplicar las temporadas que ya tiene.

import { api } from '../api.js';
import { state } from '../state.js';
import { escapeHtml } from '../lib/escape.js';
import { toast } from '../lib/toast.js';
import { cargarContenido } from './content.js';
import { mostrarDetalle } from './detail.js';

const seleccionados = new Map(); // mal_id → anime

export async function abrirAddSeason(serieIdPreseleccionada = null) {
  seleccionados.clear();
  document.getElementById('addSeasonInput').value     = '';
  document.getElementById('addSeasonResults').innerHTML = '';
  actualizarBotonConfirmar();

  // Poblar el selector de series (se excluyen las películas: no llevan temporadas).
  const items  = await api.getContenido({});
  const series = items.filter(i => !(i.tags || []).includes('pelicula'));
  const sel    = document.getElementById('addSeasonSerie');
  sel.innerHTML = series.length
    ? series.map(s => `<option value="${s.id}">${escapeHtml(s.titulo)}</option>`).join('')
    : '<option value="">— No hay series —</option>';
  if (serieIdPreseleccionada) sel.value = String(serieIdPreseleccionada);

  document.getElementById('modalAddSeason').style.display = 'flex';
  document.getElementById('addSeasonInput').focus();
}

export function cerrarAddSeason() {
  document.getElementById('modalAddSeason').style.display = 'none';
}

function actualizarBotonConfirmar() {
  const btn = document.getElementById('btnAddSeasonConfirmar');
  const n   = seleccionados.size;
  btn.disabled    = n === 0;
  btn.textContent = n === 0 ? 'Añadir' : `Añadir (${n})`;
}

async function buscar() {
  const q    = document.getElementById('addSeasonInput').value.trim();
  const cont = document.getElementById('addSeasonResults');
  if (!q) return;

  cont.innerHTML = '<div class="mal-loading">Buscando...</div>';
  seleccionados.clear();
  actualizarBotonConfirmar();

  try {
    const resp = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=8`);
    if (!resp.ok) throw new Error();
    const json = await resp.json();
    const data = json.data || [];
    if (data.length === 0) { cont.innerHTML = '<div class="mal-empty">Sin resultados</div>'; return; }

    cont.innerHTML = '';
    data.forEach(anime => {
      const el     = document.createElement('div');
      el.className = 'mal-result-item';
      const imgSrc = anime.images?.jpg?.image_url || '';
      const meta   = [anime.type, anime.year, anime.episodes ? anime.episodes + ' ep.' : '']
        .filter(Boolean).join(' · ');
      el.innerHTML = `
        <span class="mal-checkbox-icon"></span>
        <img class="mal-result-img" src="${escapeHtml(imgSrc)}" alt="">
        <div class="mal-result-info">
          <div class="mal-result-title">${escapeHtml(anime.title || '')}</div>
          <div class="mal-result-meta">${escapeHtml(meta)}</div>
        </div>`;
      el.addEventListener('click', () => {
        if (seleccionados.has(anime.mal_id)) {
          seleccionados.delete(anime.mal_id);
          el.classList.remove('selected');
        } else {
          seleccionados.set(anime.mal_id, anime);
          el.classList.add('selected');
        }
        actualizarBotonConfirmar();
      });
      cont.appendChild(el);
    });
  } catch (_) {
    cont.innerHTML = '<div class="mal-empty">Error al conectar con MyAnimeList</div>';
  }
}

async function confirmar() {
  const serieId = parseInt(document.getElementById('addSeasonSerie').value);
  if (!serieId || seleccionados.size === 0) return;

  const existentes        = await api.getEntregas(serieId);
  const malIdsExistentes  = new Set(existentes.map(e => e.mal_id).filter(Boolean));

  // Orden cronológico (año, luego temporada del año), como en la importación MAL.
  const ordenSeason = { winter: 0, spring: 1, summer: 2, fall: 3 };
  const ordenados = [...seleccionados.values()].sort((a, b) => {
    const ya = a.year || 9999, yb = b.year || 9999;
    if (ya !== yb) return ya - yb;
    return (ordenSeason[a.season] ?? 4) - (ordenSeason[b.season] ?? 4);
  });

  let pos = existentes.length;
  let anadidas = 0, saltadas = 0;
  for (const anime of ordenados) {
    if (anime.mal_id && malIdsExistentes.has(anime.mal_id)) { saltadas++; continue; }
    pos++;
    await api.guardarEntregaCompleta({
      contenido_id:      serieId,
      numero:            `T${pos}`,
      titulo:            anime.title || '',
      episodios_totales: anime.episodes || 0,
      episodio_actual:   0,
      visto:             0,
      mal_id:            anime.mal_id || null,
    });
    anadidas++;
  }

  cerrarAddSeason();

  const partes = [];
  if (anadidas) partes.push(`${anadidas} temporada${anadidas !== 1 ? 's' : ''} añadida${anadidas !== 1 ? 's' : ''}`);
  if (saltadas) partes.push(`${saltadas} ya estaba${saltadas !== 1 ? 'n' : ''}`);
  toast.success(partes.join(' · ') || 'Sin cambios');

  await cargarContenido(document.getElementById('searchBar')?.value || '');
  if (state.idActual === serieId) mostrarDetalle(serieId);
}

export function inicializarAddSeason() {
  document.getElementById('btnAddSeasonBuscar').addEventListener('click', buscar);
  document.getElementById('addSeasonInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') buscar();
  });
  document.getElementById('btnAddSeasonConfirmar').addEventListener('click', confirmar);
}
