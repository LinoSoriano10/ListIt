import { state } from '../state.js';
import { api } from '../api.js';
import { STATUS_COLOR, STATUS_LABEL } from '../lib/colors.js';
import { getImageSrc } from '../lib/image.js';
import { escapeHtml } from '../lib/escape.js';
import { actualizarEntradaDesdeMal } from '../lib/mal.js';
import { toast } from '../lib/toast.js';
import { pushUndo, snapshotEntrada, restaurarEntrada } from '../lib/undo.js';
import { marcarCardSeleccionada, actualizarProgresoCard } from './grid.js';
import { actualizarContadores } from './contadores.js';
import { actualizarTagFilterBar } from './tags.js';
import { abrirModalEditar } from './modal.js';
import { cargarContenido } from './content.js';
import { abrirAddSeason } from './add-season.js';

export function cerrarDetalle() {
  state.idActual = null;
  document.getElementById('detailPanel').classList.remove('open');
  marcarCardSeleccionada(null);
}

function makeEditable(span, cssClass, onSave) {
  const oldText = span.textContent;
  const input   = document.createElement('input');
  input.value     = oldText;
  input.className = cssClass;
  span.replaceWith(input);
  input.focus();
  input.select();

  let saved = false;
  const guardar = async () => {
    if (saved) return;
    saved = true;
    const nuevo = input.value.trim() || oldText;
    await onSave(nuevo);
  };
  input.addEventListener('blur', guardar);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { saved = true; input.replaceWith(span); }
  });
}

function makeEditableNumber(span, cssClass, onSave) {
  const oldVal = span.textContent === '?' ? '' : span.textContent;
  const input  = document.createElement('input');
  input.type      = 'number';
  input.value     = oldVal;
  input.min       = '0';
  input.className = cssClass;
  span.replaceWith(input);
  input.focus();
  input.select();

  let saved = false;
  const guardar = async () => {
    if (saved) return;
    saved = true;
    await onSave(parseInt(input.value) || 0);
  };
  input.addEventListener('blur', guardar);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { saved = true; input.replaceWith(span); }
  });
}

async function cargarEntregas(contenidoId, container, tipo = 'anime', tituloContenido = '') {
  const entregas = await api.getEntregas(contenidoId);
  const total    = entregas.length;
  const vistas   = entregas.filter(e => e.visto).length;
  const pct      = total > 0 ? Math.round(vistas / total * 100) : 0;
  const conEp    = tipo !== 'pelicula';

  const globalEl = document.getElementById('dhEpGlobal');
  if (globalEl) globalEl.style.display = total > 0 ? 'none' : '';

  const refresh = async (recargar = false) => {
    // A.3: si la entrada se auto-completó, recargar todo para reflejar el cambio
    // de estado (sale del filtro "Viendo", cambia el color, etc.).
    if (recargar) {
      await cargarContenido(document.getElementById('searchBar')?.value || '');
      if (state.idActual === contenidoId) mostrarDetalle(contenidoId);
      return;
    }
    await cargarEntregas(contenidoId, container, tipo, tituloContenido);
    const fresh = await api.getEntregas(contenidoId);
    const idx = state.todosLosItems.findIndex(i => i.id === contenidoId);
    if (idx !== -1) {
      state.todosLosItems[idx].total_entregas  = fresh.length;
      state.todosLosItems[idx].entregas_vistas = fresh.filter(e => e.visto).length;
      if (fresh.length === 1) {
        state.todosLosItems[idx].primera_ep_actual = fresh[0].episodio_actual  || 0;
        state.todosLosItems[idx].primera_ep_total  = fresh[0].episodios_totales || 0;
      }
      actualizarProgresoCard(contenidoId);
    }
    await actualizarContadores();
  };

  // ── Temporada única → contador simple, sin envoltorio de temporada (decisión 2) ──
  if (total === 1 && conEp) {
    const ent  = entregas[0];
    const epA  = ent.episodio_actual  || 0;
    const epT  = ent.episodios_totales || 0;
    const pctU = epT > 0 ? Math.min(100, Math.round((epA / epT) * 100)) : 0;
    container.innerHTML = `
      <div class="dh-ep">
        <div class="dh-ep-header">
          <span>Episodio actual</span>
          <span class="dh-ep-frac entrega-ep-total" id="dhUnicaTotal" title="Clic para editar el total">${epA} / ${epT || '?'}</span>
        </div>
        <div class="dh-ep-bar"><div class="dh-ep-fill" style="width:${pctU}%"></div></div>
        <div class="dh-ep-controls">
          <button class="dh-ep-btn" id="dhUnicaMenos" ${epA <= 0 ? 'disabled' : ''}>−</button>
          <span class="dh-ep-num">Ep. ${epA}${pctU > 0 ? ` · ${pctU}%` : ''}</span>
          <button class="dh-ep-btn" id="dhUnicaMas" ${epT > 0 && epA >= epT ? 'disabled' : ''}>+</button>
        </div>
        <div class="entrega-add" style="margin-top:10px">
          <input class="entrega-add-input" type="text" id="dhAddSeasonInput" placeholder="Nombre de la nueva temporada...">
          <button class="entrega-add-btn" id="dhAddSeason" title="Añadir temporada">+</button>
        </div>
      </div>
    `;
    document.getElementById('dhUnicaMas').addEventListener('click', async () => {
      const r = await api.epEntregaDelta(ent.id, 1);
      refresh(r?.autocompletado);
    });
    document.getElementById('dhUnicaMenos').addEventListener('click', async () => {
      const r = await api.epEntregaDelta(ent.id, -1);
      refresh(r?.autocompletado);
    });
    document.getElementById('dhUnicaTotal').addEventListener('click', () => {
      makeEditableNumber(document.getElementById('dhUnicaTotal'), 'entrega-ep-total-edit', async (totalNuevo) => {
        const r = await api.setEpTotalEntrega(ent.id, totalNuevo);
        refresh(r?.autocompletado);
      });
    });
    const dhAddSeasonUnica = async () => {
      const nombre = document.getElementById('dhAddSeasonInput').value.trim();
      // Al pasar a multi-temporada, evita que la 1ª temporada quede sin título.
      if (!ent.titulo && tituloContenido) await api.renombrarEntrega(ent.id, tituloContenido);
      const r = await api.guardarEntrega({ contenido_id: contenidoId, titulo: nombre });
      refresh(r?.reanudado);
    };
    document.getElementById('dhAddSeason').addEventListener('click', dhAddSeasonUnica);
    document.getElementById('dhAddSeasonInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dhAddSeasonUnica();
    });
    return;
  }

  const filaEntrega = (e) => {
    const epA = e.episodio_actual  || 0;
    const epT = e.episodios_totales || 0;
    const epDisabledMas   = epT > 0 && epA >= epT ? 'disabled' : '';
    const epDisabledMenos = epA <= 0 ? 'disabled' : '';
    return `
      <div class="entrega-item" draggable="true" data-id="${e.id}">
        <span class="entrega-drag-handle" title="Arrastrar para reordenar">⠿</span>
        <button class="entrega-check${e.visto ? ' checked' : ''}" data-id="${e.id}">✓</button>
        <span class="entrega-num"   data-id="${e.id}" title="Doble clic para editar">${escapeHtml(e.numero)}</span>
        <span class="entrega-titulo mq" data-id="${e.id}" title="Doble clic para renombrar">${escapeHtml(e.titulo || '')}</span>
        ${conEp ? `
          <div class="entrega-ep">
            <button class="entrega-ep-btn" data-id="${e.id}" data-delta="-1" ${epDisabledMenos}>−</button>
            <span class="entrega-ep-actual">${epA}</span>
            <span class="entrega-ep-sep">/</span>
            <span class="entrega-ep-total" data-id="${e.id}" title="Clic para editar total">${epT || '?'}</span>
            <button class="entrega-ep-btn" data-id="${e.id}" data-delta="1"  ${epDisabledMas}>+</button>
          </div>` : ''}
        <button class="entrega-del" data-id="${e.id}" title="Eliminar">×</button>
      </div>`;
  };

  container.innerHTML = `
    <div class="dh-entregas">
      <div class="dh-entregas-header">
        <span class="dh-entregas-label">Entregas / Temporadas</span>
        ${total > 0 ? `<span class="dh-ep-frac">${vistas} / ${total}</span>` : ''}
      </div>
      ${total > 0 ? `
        <div class="dh-ep-bar" style="margin-bottom:10px">
          <div class="dh-ep-fill" style="width:${pct}%"></div>
        </div>` : ''}
      <div class="entrega-list">
        ${total === 0
          ? '<div class="entrega-empty">Sin entregas. Añade la primera abajo.</div>'
          : entregas.map(filaEntrega).join('')}
      </div>
      <div class="entrega-add">
        <input class="entrega-add-input" type="text" id="newEntregaInput" placeholder="Nombre de la entrega...">
        <button class="entrega-add-btn" id="btnAddEntrega">+</button>
      </div>
    </div>
  `;

  container.querySelectorAll('.entrega-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = await api.toggleEntrega(parseInt(btn.dataset.id));
      refresh(r?.autocompletado);
    });
  });

  container.querySelectorAll('.entrega-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = await api.eliminarEntrega(parseInt(btn.dataset.id));
      refresh(r?.autocompletado);
    });
  });

  container.querySelectorAll('.entrega-ep-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = await api.epEntregaDelta(parseInt(btn.dataset.id), parseInt(btn.dataset.delta));
      refresh(r?.autocompletado);
    });
  });

  container.querySelectorAll('.entrega-ep-total').forEach(span => {
    span.addEventListener('click', () => makeEditableNumber(span, 'entrega-ep-total-edit', async (total) => {
      const r = await api.setEpTotalEntrega(parseInt(span.dataset.id), total);
      refresh(r?.autocompletado);
    }));
  });

  container.querySelectorAll('.entrega-num').forEach(span => {
    span.addEventListener('dblclick', () => makeEditable(span, 'entrega-num-edit', async (nuevo) => {
      await api.renombrarNumero(parseInt(span.dataset.id), nuevo);
      refresh();
    }));
  });

  container.querySelectorAll('.entrega-titulo').forEach(span => {
    span.addEventListener('dblclick', () => makeEditable(span, 'entrega-titulo-edit', async (nuevo) => {
      await api.renombrarEntrega(parseInt(span.dataset.id), nuevo);
      refresh();
    }));
  });

  const addEntrega = async () => {
    const inputEl = document.getElementById('newEntregaInput');
    const titulo  = inputEl.value.trim();
    const r = await api.guardarEntrega({ contenido_id: contenidoId, titulo });
    inputEl.value = '';
    refresh(r?.reanudado);
  };
  document.getElementById('btnAddEntrega').addEventListener('click', addEntrega);
  document.getElementById('newEntregaInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addEntrega();
  });

  // ── C.2 Drag & drop para reordenar ──
  let dragId = null;
  container.querySelectorAll('.entrega-item').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      dragId = parseInt(row.dataset.id);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      dragId = null;
      container.querySelectorAll('.entrega-item').forEach(r => {
        r.classList.remove('dragging');
        r.classList.remove('drop-target');
      });
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.entrega-item.drop-target').forEach(r => r.classList.remove('drop-target'));
      if (parseInt(row.dataset.id) !== dragId) row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drop-target');
      const targetId = parseInt(row.dataset.id);
      if (dragId == null || targetId === dragId) return;
      // Recalcular el orden: mover dragId justo antes de targetId
      const ids = Array.from(container.querySelectorAll('.entrega-item'))
        .map(r => parseInt(r.dataset.id))
        .filter(id => id !== dragId);
      const targetIdx = ids.indexOf(targetId);
      ids.splice(targetIdx, 0, dragId);
      await api.reordenarEntregas(contenidoId, ids);
      refresh();
    });
  });
}

export async function mostrarDetalle(id) {
  state.idActual = id;
  const item = await api.getDetalle(id);
  if (!item) return;

  const panel = document.getElementById('detailPanel');
  const inner = document.getElementById('detailInner');
  panel.classList.add('open');

  const esPelicula     = item.tipo === 'pelicula';
  const tieneEpisodios = !esPelicula;
  const color   = STATUS_COLOR[item.estado];
  const epTotal  = item.episodios_totales || 0;
  const metaParts = [];
  if (tieneEpisodios && epTotal > 0) metaParts.push(`${epTotal} ep.`);
  if (item.fecha_estreno) {
    metaParts.push(item.fecha_fin_emision && item.fecha_fin_emision !== item.fecha_estreno
      ? `${escapeHtml(item.fecha_estreno)} → ${escapeHtml(item.fecha_fin_emision)}`
      : escapeHtml(item.fecha_estreno));
  }
  if (item.estado_emision) metaParts.push(escapeHtml(item.estado_emision));

  inner.innerHTML = `
    <div class="dh-hero">
      <img class="dh-img" src="${escapeHtml(getImageSrc(item.imagen))}" alt="${escapeHtml(item.titulo)}">
      <div class="dh-grad"></div>
      <div class="dh-overlay">
        <div class="dh-chips">${(item.tags || []).map(t =>
          `<span class="tag-chip${t === state.filtroTag ? ' active-filter' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`
        ).join('')}</div>
        <div class="dh-title">${escapeHtml(item.titulo)}</div>
        <span class="dh-status">
          <span class="dh-status-dot" style="background:${color}"></span>
          <span style="color:${color}">${STATUS_LABEL[item.estado]}</span>
        </span>
      </div>
      <button class="dh-close" id="btnCerrarDetalle">×</button>
    </div>

    <div class="dh-body">
      <div class="dh-meta">${metaParts.join(' · ') || '&nbsp;'}</div>

      <div id="dhEntregas"></div>

      <div class="dh-desc">${item.descripcion ? escapeHtml(item.descripcion) : '<em style="opacity:.4">Sin descripción</em>'}</div>
    </div>

    <div class="dh-foot">
      <button class="dh-btn-edit" id="btnEditarDetalle">✏ Editar</button>
      ${!esPelicula ? `<button class="dh-btn-expand" id="btnAddTempDetalle" title="Buscar nuevas temporadas (MAL)">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
        </svg>
      </button>` : ''}
      ${item.mal_id ? '<button class="dh-btn-mal" id="btnActualizarMAL" title="Refrescar desde MyAnimeList">↻ MAL</button>' : ''}
      <button class="dh-btn-del" id="btnEliminarDetalle">Eliminar</button>
    </div>
  `;

  await cargarEntregas(id, document.getElementById('dhEntregas'), item.tipo === 'pelicula' ? 'pelicula' : 'serie', item.titulo);

  inner.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      state.filtroTag = state.filtroTag === tag ? null : tag;
      actualizarTagFilterBar();
      cargarContenido(document.getElementById('searchBar').value);
    });
  });

  document.getElementById('btnCerrarDetalle').onclick = cerrarDetalle;

  document.getElementById('btnEditarDetalle').onclick = () => abrirModalEditar(item);

  document.getElementById('btnEliminarDetalle').onclick = async () => {
    if (!confirm(`¿Eliminar "${item.titulo}"?\nPodrás recuperarlo con Ctrl+Z o el botón Deshacer del toast.`)) return;
    const snap = await snapshotEntrada(id);
    await api.eliminarContenido(id);
    state.idActual = null;
    panel.classList.remove('open');
    // Undo
    pushUndo({
      tipo: 'eliminar',
      descripcion: item.titulo,
      handler: async () => {
        await restaurarEntrada(snap);
        await cargarContenido();
      },
    });
    toast.success(`Eliminado: "${item.titulo}"`, {
      accion: { label: 'Deshacer', handler: async () => {
        await restaurarEntrada(snap);
        // Quitamos de undoStack porque ya consumimos el undo
        const idx = state.undoStack.findIndex(u => u.tipo === 'eliminar' && u.descripcion === item.titulo);
        if (idx !== -1) state.undoStack.splice(idx, 1);
        await cargarContenido();
      } },
    });
    await cargarContenido();
  };

  const btnAddTemp = document.getElementById('btnAddTempDetalle');
  if (btnAddTemp) btnAddTemp.onclick = () => abrirAddSeason(id);

  // ── C.3 Actualizar desde MAL ──
  const btnMal = document.getElementById('btnActualizarMAL');
  if (btnMal && item.mal_id) {
    btnMal.onclick = async () => {
      btnMal.disabled = true;
      btnMal.textContent = '⟳ Actualizando…';
      try {
        const res = await actualizarEntradaDesdeMal(id, item.mal_id);
        if (res.cambios.length > 0) {
          toast.success(`Actualizado: ${res.cambios.join(', ')}`);
        } else {
          toast.info('Sin cambios — datos al día');
        }
        // Refrescar panel y grid
        await cargarContenido();
        mostrarDetalle(id);
      } catch (e) {
        toast.error(`Error MAL: ${e.message || e}`);
        btnMal.disabled = false;
        btnMal.textContent = '↻ MAL';
      }
    };
  }

  marcarCardSeleccionada(id);
}
