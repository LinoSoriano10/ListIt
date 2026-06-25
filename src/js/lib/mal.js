import { state } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from './escape.js';
import { extraerCamposMAL, tituloMAL } from './mal-format.js';

/**
 * Refresca una entrada concreta desde la API de Jikan.
 * Devuelve `{ cambios: string[], episodios_actualizados }` o lanza error.
 */
export async function actualizarEntradaDesdeMal(contenidoId, malId) {
  const resp = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.data) throw new Error('Sin datos en la respuesta');
  return api.actualizarDesdeMal(contenidoId, json.data);
}

export async function buscarEnMAL(query, onSelect) {
  const results = document.getElementById('malResults');
  results.innerHTML = '<div class="mal-loading">Buscando...</div>';

  try {
    const malUrlMatch = query.match(/myanimelist\.net\/anime\/(\d+)/);
    let data;

    if (malUrlMatch) {
      const resp = await fetch(`https://api.jikan.moe/v4/anime/${malUrlMatch[1]}`);
      if (!resp.ok) throw new Error();
      const json = await resp.json();
      data = json.data ? [json.data] : [];
    } else {
      const resp = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8`);
      if (!resp.ok) throw new Error();
      const json = await resp.json();
      data = json.data || [];
    }

    if (data.length === 0) {
      results.innerHTML = '<div class="mal-empty">Sin resultados</div>';
      return;
    }

    results.innerHTML = '';
    // Map: mal_id → anime (preserva orden de selección)
    const seleccionados = new Map();

    const btnAplicar = document.createElement('button');
    btnAplicar.className = 'btn-primary mal-btn-apply';
    btnAplicar.disabled = true;

    const actualizarBoton = () => {
      const n = seleccionados.size;
      btnAplicar.disabled = n === 0;
      btnAplicar.textContent = n === 0
        ? 'Selecciona una o varias temporadas'
        : n === 1
          ? 'Aplicar (1 temporada)'
          : `Aplicar como ${n} temporadas`;
    };

    data.forEach(anime => {
      const el  = document.createElement('div');
      el.className = 'mal-result-item';
      const imgSrc = anime.images?.jpg?.image_url || '';
      const meta   = [anime.type, anime.year, anime.episodes ? anime.episodes + ' ep.' : '']
        .filter(Boolean).join(' · ');
      el.innerHTML = `
        <span class="mal-checkbox-icon"></span>
        <img class="mal-result-img" src="${escapeHtml(imgSrc)}" alt="">
        <div class="mal-result-info">
          <div class="mal-result-title mq">${escapeHtml(tituloMAL(anime))}</div>
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
        actualizarBoton();
      });

      results.appendChild(el);
    });

    // Fila del botón Aplicar
    const row = document.createElement('div');
    row.className = 'mal-apply-row';
    actualizarBoton();
    btnAplicar.addEventListener('click', () => {
      if (seleccionados.size === 0) return;
      // Ordenar por año, luego por temporada del año (winter→spring→summer→fall)
      const ordenSeason = { winter: 0, spring: 1, summer: 2, fall: 3 };
      const ordenados = [...seleccionados.values()].sort((a, b) => {
        const ya = a.year || 9999, yb = b.year || 9999;
        if (ya !== yb) return ya - yb;
        return (ordenSeason[a.season] ?? 4) - (ordenSeason[b.season] ?? 4);
      });
      onSelect(ordenados);
      results.innerHTML = '';
    });
    row.appendChild(btnAplicar);
    results.appendChild(row);

  } catch (_) {
    results.innerHTML = '<div class="mal-empty">Error al conectar con MyAnimeList</div>';
  }
}

export function aplicarDatosMAL(animes, renderNombresModal) {
  const lista     = Array.isArray(animes) ? animes : [animes];
  const principal = lista[0];

  // Título, descripción e imagen del principal (primera temporada cronológica)
  // Título principal: inglés si existe (más reconocible), si no romaji.
  const tituloPrincipal = tituloMAL(principal);
  document.getElementById('modalTitulo').value = tituloPrincipal;
  const synopsis = (principal.synopsis || '').replace(/\[Written by MAL Rewrite\]/g, '').trim();
  document.getElementById('modalDescripcion').value = synopsis;
  const imgUrl = principal.images?.jpg?.large_image_url || principal.images?.jpg?.image_url || '';
  document.getElementById('modalImagen').value = imgUrl;
  document.getElementById('modalPreview').src  = imgUrl || 'img/no-image.png';

  // Nombres alternativos de todas las temporadas: romaji, inglés, japonés y
  // sinónimos (así el título que no quedó como principal sigue siendo buscable).
  const nombresSet = new Set(state.nombresModal);
  lista.forEach((anime) => {
    if (anime.title)          nombresSet.add(anime.title);
    if (anime.title_english)  nombresSet.add(anime.title_english);
    if (anime.title_japanese) nombresSet.add(anime.title_japanese);
    (anime.title_synonyms || []).forEach(s => { if (s) nombresSet.add(s); });
  });
  state.nombresModal = [...nombresSet].filter(n => n && n !== tituloPrincipal);
  renderNombresModal();

  // Campos MAL — siempre del primero (es la entrada "principal" / temporada 1).
  const camposMAL = extraerCamposMAL(principal);

  if (lista.length === 1) {
    // Una sola temporada → comportamiento original
    state.malDataImportado = {
      episodios_totales: principal.episodes || 0,
      anio:              principal.year     || null,
      ...camposMAL,
    };
    state.malEntregasPendientes = [];
  } else {
    // Varias temporadas → se crearán como entregas al guardar
    state.malDataImportado = {
      episodios_totales: 0,
      anio:              principal.year || null,
      ...camposMAL,
    };
    state.malEntregasPendientes = lista.map((anime, i) => ({
      numero:            `T${i + 1}`,
      titulo:            tituloMAL(anime),
      episodios_totales: anime.episodes || 0,
      episodio_actual:   0,
      visto:             0,
      mal_id:            anime.mal_id || null,
    }));
  }
}

// extraerCamposMAL vive ahora en mal-format.js (puro/testeable); se re-exporta
// aquí para no romper los imports existentes.
export { extraerCamposMAL };
