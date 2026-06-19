import { state } from '../state.js';
import { api } from '../api.js';
import { getImageSrc } from '../lib/image.js';
import { escapeHtml } from '../lib/escape.js';
import { renderTagsModal } from './tags.js';
import { cargarContenido } from './content.js';
import { mostrarDetalle } from './detail.js';

// ── A.4 Detección de duplicados ──────────────────────────────────────────────
let dupTimer = null;
async function comprobarDuplicados() {
  clearTimeout(dupTimer);
  dupTimer = setTimeout(async () => {
    const aviso  = document.getElementById('modalDuplicadoAviso');
    if (!aviso) return;
    const titulo = document.getElementById('modalTitulo').value.trim();
    const excludeId = state.modoModal === 'editar' ? state.itemEditando?.id : null;
    if (titulo.length < 2) { aviso.style.display = 'none'; aviso.innerHTML = ''; return; }
    const hits = await api.buscarTituloSimilar(titulo, excludeId);
    if (!hits.length) { aviso.style.display = 'none'; aviso.innerHTML = ''; return; }
    aviso.style.display = '';
    const items = hits.map(h => `<span class="dup-pill" data-id="${h.id}" title="Ver entrada">${escapeHtml(h.titulo)} <em>· ${h.estado}</em></span>`).join('');
    aviso.innerHTML = `⚠ Ya tienes ${hits.length === 1 ? 'una entrada similar' : `${hits.length} entradas similares`}: ${items}`;
    aviso.querySelectorAll('.dup-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const id = parseInt(pill.dataset.id);
        cerrarModal();
        mostrarDetalle(id);
      });
    });
  }, 250);
}
export function inicializarDuplicados() {
  document.getElementById('modalTitulo').addEventListener('input', comprobarDuplicados);
}

function abrirModal(titulo) {
  document.getElementById('modalTitle').textContent = titulo;
  document.getElementById('modal').style.display = 'flex';
}

export function cerrarModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('newNombreInput').value = '';
  document.getElementById('modalPreview').src = 'img/no-image.png';
  const aviso = document.getElementById('modalDuplicadoAviso');
  if (aviso) { aviso.style.display = 'none'; aviso.innerHTML = ''; }
}

export function renderNombresModal() {
  const area = document.getElementById('nombresChips');
  area.innerHTML = '';
  state.nombresModal.forEach((nombre, i) => {
    const chip = document.createElement('span');
    chip.className = 'nombre-chip';
    chip.innerHTML = `${escapeHtml(nombre)}<button class="nombre-chip-del" data-i="${i}" title="Eliminar">×</button>`;
    chip.querySelector('.nombre-chip-del').addEventListener('click', () => {
      state.nombresModal.splice(i, 1);
      renderNombresModal();
    });
    area.appendChild(chip);
  });
}

export function agregarNombre() {
  const input = document.getElementById('newNombreInput');
  const val = input.value.trim();
  if (!val || state.nombresModal.includes(val)) { input.value = ''; return; }
  state.nombresModal.push(val);
  input.value = '';
  renderNombresModal();
}

export async function abrirModalNuevo() {
  state.modoModal             = 'nuevo';
  state.tagsModal             = new Set();
  state.nombresModal          = [];
  state.malDataImportado      = null;
  state.malEntregasPendientes = [];
  state.itemEditando          = null;

  // Pre-seleccionar tag por defecto
  const tagDefecto = await api.getSetting('tag_defecto');
  if (tagDefecto) {
    const tag = state.tagsDisponibles.find(t => t.nombre === tagDefecto);
    if (tag) state.tagsModal.add(tag.id);
  }

  document.getElementById('modalTitulo').value      = '';
  document.getElementById('modalEstado').value      = 'pendiente';
  document.getElementById('modalDescripcion').value = '';
  document.getElementById('modalImagen').value      = '';
  document.getElementById('modalPreview').src       = 'img/no-image.png';
  document.getElementById('malInput').value         = '';
  document.getElementById('malResults').innerHTML   = '';

  renderTagsModal();
  renderNombresModal();
  abrirModal('Añadir entrada');
}

export async function abrirModalEditar(item) {
  state.modoModal             = 'editar';
  state.malDataImportado      = null;
  state.malEntregasPendientes = [];
  state.itemEditando          = item;

  document.getElementById('modalTitulo').value      = item.titulo;
  document.getElementById('modalEstado').value      = item.estado;
  document.getElementById('modalDescripcion').value = item.descripcion || '';
  document.getElementById('modalImagen').value      = item.imagen || '';
  document.getElementById('modalPreview').src       = getImageSrc(item.imagen);
  document.getElementById('malInput').value         = '';
  document.getElementById('malResults').innerHTML   = '';

  const tagsDelItem = await api.getTagsContenido(item.id);
  state.tagsModal    = new Set(tagsDelItem.map(t => t.id));
  state.nombresModal = await api.getNombres(item.id);
  renderTagsModal();
  renderNombresModal();
  abrirModal('Editar entrada');
}

export async function guardarDesdeModal() {
  const titulo = document.getElementById('modalTitulo').value.trim();
  if (!titulo) {
    alert('El título es obligatorio.');
    return;
  }

  const primerTag = state.tagsDisponibles.find(t => state.tagsModal.has(t.id));
  const tipoLegacy = primerTag ? primerTag.nombre : 'anime';

  const esEdicion = state.modoModal === 'editar' && state.itemEditando;
  const mal = state.malDataImportado || {};
  const item = {
    titulo,
    tipo:              tipoLegacy,
    estado:            document.getElementById('modalEstado').value,
    episodio_actual:   esEdicion ? (state.itemEditando.episodio_actual || 0) : 0,
    episodios_totales: mal.episodios_totales != null
      ? mal.episodios_totales
      : (esEdicion ? (state.itemEditando.episodios_totales || 0) : 0),
    descripcion:       document.getElementById('modalDescripcion').value.trim(),
    anio:              mal.anio != null
      ? mal.anio
      : (esEdicion ? state.itemEditando.anio : null),
    imagen:            document.getElementById('modalImagen').value.trim(),
    fecha_inicio:      esEdicion ? (state.itemEditando.fecha_inicio || '') : '',
    fecha_fin:         esEdicion ? (state.itemEditando.fecha_fin || '') : '',
    // Campos MAL (C.3) — solo si se rellenó desde MAL
    mal_id:            mal.mal_id            ?? (esEdicion ? state.itemEditando.mal_id            : null),
    score_mal:         mal.score_mal         ?? (esEdicion ? state.itemEditando.score_mal         : null),
    mal_rank:          mal.mal_rank          ?? (esEdicion ? state.itemEditando.mal_rank          : null),
    estudio:           mal.estudio           ?? (esEdicion ? state.itemEditando.estudio           : ''),
    duracion_ep:       mal.duracion_ep       ?? (esEdicion ? state.itemEditando.duracion_ep       : ''),
    fecha_estreno:     mal.fecha_estreno     ?? (esEdicion ? state.itemEditando.fecha_estreno     : ''),
    fecha_fin_emision: mal.fecha_fin_emision ?? (esEdicion ? state.itemEditando.fecha_fin_emision : ''),
    estado_emision:    mal.estado_emision    ?? (esEdicion ? state.itemEditando.estado_emision    : ''),
  };

  let contenidoId;
  if (state.modoModal === 'nuevo') {
    const res = await api.guardarContenido(item);
    contenidoId = res.lastInsertRowid;
  } else {
    await api.actualizarContenido({ id: state.idActual, ...item });
    contenidoId = state.idActual;
  }
  await api.setTagsContenido(contenidoId, [...state.tagsModal]);
  await api.setNombres(contenidoId, state.nombresModal);

  // Si en esta edición se han vinculado datos de MyAnimeList a una entrada ya
  // existente, persistir los campos MAL aparte. actualizarContenido no los toca
  // a propósito, para que las operaciones de progreso/estado no los pisen.
  if (state.modoModal === 'editar' && state.malDataImportado) {
    await api.vincularDatosMal(contenidoId, item);
  }

  // Crear entregas de temporadas MAL si se seleccionaron varias
  if (state.malEntregasPendientes.length > 0) {
    for (const entrega of state.malEntregasPendientes) {
      await api.guardarEntregaCompleta({ contenido_id: contenidoId, ...entrega });
    }
    state.malEntregasPendientes = [];
  }

  cerrarModal();
  await cargarContenido();

  if (state.modoModal === 'editar' && state.idActual) {
    mostrarDetalle(state.idActual);
  }
}
