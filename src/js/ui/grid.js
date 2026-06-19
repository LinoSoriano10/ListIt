import { state } from '../state.js';
import { api } from '../api.js';
import { STATUS_COLOR } from '../lib/colors.js';
import { getImageSrc } from '../lib/image.js';
import { escapeHtml } from '../lib/escape.js';
import { mostrarDetalle } from './detail.js';

// ── Helper de subtítulo ──────────────────────────────────────────────────────
// Fuente única de verdad para el texto que aparece bajo el título en la card.
function calcularProgreso(item) {
  const tieneEntregas  = (item.total_entregas || 0) > 0;
  const tags           = item.tags || [];
  const soloEsPelicula = tags.length === 1 && tags[0] === 'pelicula';
  const tieneEpisodios = !soloEsPelicula && !tieneEntregas;

  if (tieneEntregas) {
    const enCurso = (item.entrega_en_curso_id || 0) > 0;
    if (enCurso && item.entrega_en_curso_numero) {
      const num = item.entrega_en_curso_numero;
      const epA = item.entrega_en_curso_ep_actual || 0;
      const epT = item.entrega_en_curso_ep_total  || 0;
      if (epT > 0) return `${num} · ep. ${epA}/${epT}`;
      if (epA > 0) return `${num} · ep. ${epA}`;
      return num;
    }
    // Todas las temporadas completadas (o sin progreso registrado)
    return `${item.entregas_vistas}/${item.total_entregas} temporadas`;
  }

  if (tieneEpisodios && (item.episodios_totales || 0) > 0) {
    return `${item.episodio_actual}/${item.episodios_totales} ep.`;
  }
  return '';
}

// ── Render grid ──────────────────────────────────────────────────────────────
export function renderGrid(items) {
  const grid  = document.getElementById('grid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  // B.2: aplicar clase de tamaño al grid
  grid.classList.remove('grid--compact', 'grid--large');
  if (state.cardSize === 'compact') grid.classList.add('grid--compact');
  if (state.cardSize === 'large')   grid.classList.add('grid--large');

  if (items.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  items.forEach((item, index) => {
    const card = document.createElement('div');
    const seleccionada = state.seleccionMultiple.has(item.id);
    card.className = 'card' + (item.id === state.idActual ? ' selected' : '') + (seleccionada ? ' bulk-selected' : '');
    card.dataset.id = String(item.id);
    card.style.setProperty('--sc', STATUS_COLOR[item.estado]);
    card.style.animationDelay = `${index * 28}ms`;

    const tieneEntregas       = (item.total_entregas || 0) > 0;
    const tags                = item.tags || [];
    const soloEsPelicula      = tags.length === 1 && tags[0] === 'pelicula';
    const tieneEpisodios      = !soloEsPelicula && !tieneEntregas;
    const tieneEntregaEnCurso = tieneEntregas && (item.entrega_en_curso_id || 0) > 0;

    card.innerHTML = `
      <span class="card-checkbox" title="Seleccionar">✓</span>
      <div class="card-img-wrap">
        <img class="card-img" src="${escapeHtml(getImageSrc(item.imagen))}" alt="${escapeHtml(item.titulo)}"
             loading="lazy">
        <div class="card-grad">
          <div class="card-title">${escapeHtml(item.titulo)}</div>
          <div class="card-sub">
            <span class="card-dot"></span>
            <span>${escapeHtml(calcularProgreso(item))}</span>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      // A.6: Ctrl+click → entrar/toggle en modo selección.
      // Si ya estamos en modo selección, click normal también toggle.
      if (e.ctrlKey || e.metaKey) {
        if (state.onCardCtrlClick) state.onCardCtrlClick(item.id, card);
        return;
      }
      if (state.modoSeleccion) {
        if (state.onCardSelectClick) state.onCardSelectClick(item.id, card);
        return;
      }
      mostrarDetalle(item.id);
    });

    const mostrarBotonEp = tieneEpisodios || tieneEntregaEnCurso;

    if (mostrarBotonEp) {
      const footer = document.createElement('div');
      footer.className = 'card-footer';
      const epBtn = document.createElement('button');
      epBtn.className = 'card-ep-add';
      epBtn.title = tieneEntregaEnCurso
        ? 'Añadir episodio visto a la temporada en curso'
        : 'Añadir episodio visto';
      epBtn.textContent = '+1 ep';

      epBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (tieneEntregaEnCurso) {
          await api.epEntregaDelta(item.entrega_en_curso_id, 1);

          // Re-leer entregas para actualizar cache con datos frescos
          const entregas  = await api.getEntregas(item.id);
          const siguiente = entregas.find(en =>
            en.episodios_totales === 0 || en.episodio_actual < en.episodios_totales
          );

          // Actualizar item local y cache
          const updates = {
            entrega_en_curso_id:       siguiente ? siguiente.id              : 0,
            entrega_en_curso_numero:   siguiente ? siguiente.numero           : null,
            entrega_en_curso_ep_actual: siguiente ? siguiente.episodio_actual  : 0,
            entrega_en_curso_ep_total:  siguiente ? siguiente.episodios_totales : 0,
          };
          Object.assign(item, updates);
          const idx = state.todosLosItems.findIndex(i => i.id === item.id);
          if (idx !== -1) Object.assign(state.todosLosItems[idx], updates);

          // Actualizar subtítulo de la card
          const sub = card.querySelector('.card-sub span:last-child');
          if (sub) sub.textContent = calcularProgreso(item);

          // Ocultar botón si ya no hay temporada en curso
          if (!siguiente) footer.remove();

          if (state.idActual === item.id) mostrarDetalle(item.id);
        } else {
          // Episodio global (sin entregas)
          const newEp = (item.episodio_actual || 0) + 1;
          item.episodio_actual = newEp;
          await api.actualizarContenido({ ...item });
          const idx = state.todosLosItems.findIndex(i => i.id === item.id);
          if (idx !== -1) state.todosLosItems[idx].episodio_actual = newEp;
          const sub = card.querySelector('.card-sub span:last-child');
          if (sub) sub.textContent = calcularProgreso(item);
          if (state.idActual === item.id) mostrarDetalle(item.id);
        }
      });

      footer.appendChild(epBtn);
      card.appendChild(footer);
    }

    grid.appendChild(card);
  });
}

export function marcarCardSeleccionada(id) {
  document.querySelectorAll('#grid .card').forEach(card => {
    card.classList.toggle('selected', parseInt(card.dataset.id) === id);
  });
}

export function refreshItemCache(id, updates) {
  const idx = state.todosLosItems.findIndex(i => i.id === id);
  if (idx !== -1) Object.assign(state.todosLosItems[idx], updates);
  actualizarProgresoCard(id);
}

export function actualizarProgresoCard(id) {
  const card = document.querySelector(`#grid .card[data-id="${id}"]`);
  if (!card) return;
  const item = state.todosLosItems.find(i => i.id === id);
  if (!item) return;
  const sub = card.querySelector('.card-sub span:last-child');
  if (sub) sub.textContent = calcularProgreso(item);
}
