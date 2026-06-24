import { state } from '../state.js';
import { api } from '../api.js';
import { STATUS_COLOR } from '../lib/colors.js';
import { getImageSrc } from '../lib/image.js';
import { escapeHtml } from '../lib/escape.js';
import { mostrarDetalle } from './detail.js';
import { cargarContenido } from './content.js';

// ── Helper de subtítulo ──────────────────────────────────────────────────────
// Fuente única de verdad para el texto que aparece bajo el título en la card.
function calcularProgreso(item) {
  const tieneEntregas = (item.total_entregas || 0) > 0;

  if (tieneEntregas) {
    // Temporada única → contador simple, sin prefijo de temporada (decisión 2).
    if ((item.total_entregas || 0) === 1) {
      const epA = item.primera_ep_actual || 0;
      const epT = item.primera_ep_total  || 0;
      if (epT > 0) return `ep. ${epA}/${epT}`;
      if (epA > 0) return `ep. ${epA}`;
      return '';
    }
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
    const p        = empty.querySelector('p');
    const small    = empty.querySelector('small');
    const buscando = (document.getElementById('searchBar')?.value || '').trim();
    if (state.filtroEstado === 'viendo' && !state.filtroTag && !buscando) {
      p.textContent     = 'No estás viendo nada ahora mismo';
      small.textContent = 'Marca una serie como «Viendo», o pulsa «Todos» para ver tu lista';
    } else if (state.filtroEstado !== 'todos' || state.filtroTag || buscando) {
      p.textContent     = 'Sin resultados';
      small.textContent = 'Prueba a cambiar el filtro o la búsqueda';
    } else {
      p.textContent     = 'Tu lista está vacía';
      small.textContent = 'Pulsa "Añadir" para empezar';
    }
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

    const mostrarBotonEp = tieneEntregaEnCurso;

    if (mostrarBotonEp) {
      const footer = document.createElement('div');
      footer.className = 'card-footer';
      const epBtn = document.createElement('button');
      epBtn.className = 'card-ep-add';
      epBtn.title = 'Añadir episodio visto a la temporada en curso';
      epBtn.textContent = '+1 ep';

      epBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (tieneEntregaEnCurso) {
          const r = await api.epEntregaDelta(item.entrega_en_curso_id, 1);
          if (r?.autocompletado) {
            await cargarContenido(document.getElementById('searchBar')?.value || '');
            return;
          }

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
          // Temporada única: mantener fresco el contador simple de la card (decisión 2).
          if (entregas.length === 1) {
            updates.primera_ep_actual = entregas[0].episodio_actual  || 0;
            updates.primera_ep_total  = entregas[0].episodios_totales || 0;
          }
          Object.assign(item, updates);
          const idx = state.todosLosItems.findIndex(i => i.id === item.id);
          if (idx !== -1) Object.assign(state.todosLosItems[idx], updates);

          // Actualizar subtítulo de la card
          const sub = card.querySelector('.card-sub span:last-child');
          if (sub) sub.textContent = calcularProgreso(item);

          // Ocultar botón si ya no hay temporada en curso
          if (!siguiente) footer.remove();

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

export function actualizarProgresoCard(id) {
  const card = document.querySelector(`#grid .card[data-id="${id}"]`);
  if (!card) return;
  const item = state.todosLosItems.find(i => i.id === id);
  if (!item) return;
  const sub = card.querySelector('.card-sub span:last-child');
  if (sub) sub.textContent = calcularProgreso(item);
}
