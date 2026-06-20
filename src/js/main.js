import { state } from './state.js';
import { api } from './api.js';
import { cargarContenido, mostrarVista } from './ui/content.js';
import { renderGrid } from './ui/grid.js';
import { matchAll } from './lib/search.js';
import { actualizarTagFilterBar, crearYAnadirTag } from './ui/tags.js';
import {
  abrirModalNuevo,
  cerrarModal,
  guardarDesdeModal,
  agregarNombre,
  renderNombresModal,
  inicializarDuplicados,
} from './ui/modal.js';
import { buscarEnMAL, aplicarDatosMAL } from './lib/mal.js';
import { getImageSrc, instalarFallbackImagenes } from './lib/image.js';
import { cargarDashboard } from './ui/dashboard.js';
import { abrirTagsManager, cerrarTagsManager } from './ui/tagsManager.js';
import { abrirSettings, cerrarSettings, guardarSettings, aplicarTema } from './ui/settings.js';
import { cerrarDetalle, mostrarDetalle } from './ui/detail.js';
import { inicializarBulk, salirSeleccion, refrescarTagsBulk } from './ui/bulk-actions.js';
import { abrirMalSync, cerrarMalSync } from './ui/mal-sync.js';
import { abrirAddSeason, cerrarAddSeason, inicializarAddSeason } from './ui/add-season.js';
import { deshacer } from './lib/undo.js';

const $ = (id) => document.getElementById(id);

// Fallback de imágenes rotas sin handlers inline (compatible con la CSP estricta).
instalarFallbackImagenes();

// Cuando otra ventana (el detalle expandido) actualiza datos desde MAL, el
// proceso principal nos avisa para no quedarnos con datos obsoletos: recargamos
// el grid conservando el filtro/búsqueda y re-renderizamos el panel solo si está
// abierto en esa misma entrada.
window.events?.on('detalle-refrescar', (id) => {
  cargarContenido($('searchBar').value);
  if (state.idActual === id && $('detailPanel').classList.contains('open')) {
    mostrarDetalle(id);
  }
});

// ─── Filtros del sidebar ──────────────────────────────────
document.querySelectorAll('.filter-btn[data-estado]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-estado]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filtroEstado = btn.dataset.estado;
    cargarContenido($('searchBar').value);
  });
});

// ─── Sidebar toggle ───────────────────────────────────────
$('btnToggleSidebar').addEventListener('click', () => {
  $('sidebar').classList.toggle('collapsed');
});

// ─── Limpiar filtro de tag ────────────────────────────────
$('btnClearTagFilter').addEventListener('click', () => {
  state.filtroTag = null;
  actualizarTagFilterBar();
  cargarContenido($('searchBar').value);
});

// ─── Búsqueda local con debounce ──────────────────────────
let searchTimeout = null;
$('searchBar').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderGrid(matchAll(e.target.value, state.todosLosItems));
  }, 200);
});

// ─── Botón añadir ─────────────────────────────────────────
$('btnNuevo').addEventListener('click', abrirModalNuevo);

// ─── Modal: tags ──────────────────────────────────────────
$('btnAddTag').addEventListener('click', crearYAnadirTag);
$('newTagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') crearYAnadirTag();
});

// ─── Modal: nombres alternativos ──────────────────────────
$('btnAddNombre').addEventListener('click', agregarNombre);
$('newNombreInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') agregarNombre();
});

// ─── Modal: seleccionar imagen local ──────────────────────
$('btnSeleccionarImg').addEventListener('click', async () => {
  const ruta = await api.seleccionarImagen();
  if (ruta) {
    $('modalImagen').value = ruta;
    $('modalPreview').src  = getImageSrc(ruta);
  }
});

// ─── Modal: previsualizar URL de imagen ───────────────────
let imgUrlTimeout = null;
$('modalImagen').addEventListener('input', (e) => {
  clearTimeout(imgUrlTimeout);
  const val = e.target.value.trim();
  if (!val) {
    $('modalPreview').src = 'img/no-image.png';
    return;
  }
  imgUrlTimeout = setTimeout(() => {
    $('modalPreview').src = getImageSrc(val);
  }, 400);
});

// ─── B.4 Orden (select) ──────────────────────────────────────────
$('selectOrden').addEventListener('change', async (e) => {
  state.filtroOrden = e.target.value;
  await api.setSetting('orden_defecto', state.filtroOrden);
  cargarContenido($('searchBar').value);
});

// ─── B.2 Tamaño de cards (select) ────────────────────────────────
$('selectCardSize').addEventListener('change', async (e) => {
  state.cardSize = e.target.value;
  await api.setSetting('card_size', state.cardSize);
  renderGrid(matchAll($('searchBar').value, state.todosLosItems));
});

// ─── Modal: guardar / cerrar ──────────────────────────────
$('btnGuardarModal').addEventListener('click', guardarDesdeModal);
$('btnCerrarModal').addEventListener('click', cerrarModal);
$('btnCancelarModal').addEventListener('click', cerrarModal);

$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) cerrarModal();
});


// ─── MyAnimeList ──────────────────────────────────────────
$('btnBuscarMAL').addEventListener('click', () => {
  const q = $('malInput').value.trim();
  if (q) buscarEnMAL(q, (anime) => aplicarDatosMAL(anime, renderNombresModal));
});
$('malInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const q = $('malInput').value.trim();
    if (q) buscarEnMAL(q, (anime) => aplicarDatosMAL(anime, renderNombresModal));
  }
});

// ─── Atajos de teclado ─────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const enInput = ['INPUT','TEXTAREA','SELECT'].includes(tag);

  if (e.key === 'Escape') {
    if ($('modalAtajos')?.style.display !== 'none')     { cerrarAtajos(); return; }
    if ($('modalAddSeason')?.style.display !== 'none')  { cerrarAddSeason(); return; }
    if ($('modalMalSync')?.style.display !== 'none')    { cerrarMalSync(); return; }
    if ($('modalSettings')?.style.display !== 'none')   { cerrarSettings(); return; }
    if ($('modalTagsManager').style.display !== 'none') { cerrarTagsManager(); return; }
    if ($('modal').style.display !== 'none')            { cerrarModal(); return; }
    if (state.modoSeleccion)                            { salirSeleccion(); return; }
    if ($('detailPanel').classList.contains('open'))    { cerrarDetalle(); return; }
  }
  if (enInput) return;

  if (e.ctrlKey && e.key === 'n')              { e.preventDefault(); abrirModalNuevo(); }
  if (e.ctrlKey && e.key === 'f')              { e.preventDefault(); $('searchBar').focus(); $('searchBar').select(); }
  if (e.ctrlKey && e.key === ',')              { e.preventDefault(); abrirSettings(); }
  // B.7 Deshacer
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); deshacer(); }
  // Ayuda de atajos
  if (e.key === '?')                             { e.preventDefault(); abrirAtajos(); }
});

// ─── Dashboard ────────────────────────────────────────────
$('btnDashboard').addEventListener('click', async () => {
  document.querySelectorAll('.filter-btn-dashboard').forEach(b => b.classList.remove('active'));
  $('btnDashboard').classList.add('active');
  mostrarVista('dashboard');
  await cargarDashboard();
});

// ─── Settings ──────────────────────────────────────────────
$('btnSettings').addEventListener('click', abrirSettings);
$('btnCerrarSettings').addEventListener('click', cerrarSettings);
$('btnCancelarSettings').addEventListener('click', cerrarSettings);
$('btnGuardarSettings').addEventListener('click', guardarSettings);
$('modalSettings').addEventListener('click', e => {
  if (e.target === $('modalSettings')) cerrarSettings();
});

// ─── Atajos de teclado (ayuda) ─────────────────────────────
const abrirAtajos  = () => { $('modalAtajos').style.display = 'flex'; };
const cerrarAtajos = () => { $('modalAtajos').style.display = 'none'; };
$('btnAtajos').addEventListener('click', abrirAtajos);
$('btnCerrarAtajos').addEventListener('click', cerrarAtajos);
$('btnCerrarAtajosOk').addEventListener('click', cerrarAtajos);
$('modalAtajos').addEventListener('click', e => {
  if (e.target === $('modalAtajos')) cerrarAtajos();
});

// ─── Añadir temporada desde MAL (F2) ───────────────────────
$('btnAddTemporada').addEventListener('click', () => abrirAddSeason());
$('btnCerrarAddSeason').addEventListener('click', cerrarAddSeason);
$('btnCancelarAddSeason').addEventListener('click', cerrarAddSeason);
$('modalAddSeason').addEventListener('click', e => {
  if (e.target === $('modalAddSeason')) cerrarAddSeason();
});
inicializarAddSeason();

// ─── Panel de detalle redimensionable (B5) ─────────────────
(() => {
  const panel   = $('detailPanel');
  const resizer = $('detailResizer');
  const root    = document.documentElement;
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panel.offsetWidth;
    panel.style.transition = 'none';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      // Arrastrar hacia la izquierda ensancha el panel (está a la derecha).
      const ancho = Math.min(600, Math.max(280, startW + (startX - ev.clientX)));
      root.style.setProperty('--detail-w', ancho + 'px');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      panel.style.transition = '';
      document.body.style.userSelect = '';
      const ancho = parseInt(root.style.getPropertyValue('--detail-w')) || 350;
      api.setSetting('detail_width', String(ancho));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();

// ─── Tags Manager ──────────────────────────────────────────
$('btnTagsManager').addEventListener('click', abrirTagsManager);
$('btnCerrarTagsManager').addEventListener('click', cerrarTagsManager);
$('btnCerrarTagsManagerOk').addEventListener('click', cerrarTagsManager);
$('modalTagsManager').addEventListener('click', e => {
  if (e.target === $('modalTagsManager')) cerrarTagsManager();
});

$('tmBtnAddTag').addEventListener('click', async () => {
  const input = $('tmNewTagInput');
  const nombre = input.value.trim().toLowerCase();
  if (!nombre) return;
  await api.crearTag(nombre);
  state.tagsDisponibles = await api.getTags();
  refrescarTagsBulk();
  input.value = '';
  abrirTagsManager();
});
$('tmNewTagInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('tmBtnAddTag').click();
});

// ─── A.7 Sincronización masiva MAL ─────────────────────────
$('btnMalSync').addEventListener('click', abrirMalSync);
$('dashBtnMalSync').addEventListener('click', abrirMalSync);
$('btnCerrarMalSync').addEventListener('click', cerrarMalSync);
$('btnCancelarMalSync').addEventListener('click', cerrarMalSync);
$('modalMalSync').addEventListener('click', e => {
  if (e.target === $('modalMalSync')) cerrarMalSync();
});
window.__onMalSyncDone = async () => {
  await cargarContenido();
  if (state.vistaActual === 'dashboard') await cargarDashboard();
};

// ─── Copia de seguridad (.db) ──────────────────────────────
$('btnExportBd').addEventListener('click', () => api.exportarBd());

// ─── Inicio ───────────────────────────────────────────────
(async () => {
  state.tagsDisponibles = await api.getTags();

  // Aplicar tema guardado
  const theme = await api.getSetting('theme');
  if (theme) aplicarTema(theme);

  // B.4 Aplicar orden guardado en settings
  const ordenDefecto = await api.getSetting('orden_defecto');
  if (ordenDefecto) {
    state.filtroOrden = ordenDefecto;
    $('selectOrden').value = ordenDefecto;
  }

  // B.2 Aplicar tamaño de cards guardado
  const cardSize = await api.getSetting('card_size');
  if (cardSize) {
    state.cardSize = cardSize;
    $('selectCardSize').value = cardSize;
  }

  // B5 Aplicar ancho guardado del panel de detalle
  const detailW = await api.getSetting('detail_width');
  if (detailW) document.documentElement.style.setProperty('--detail-w', detailW + 'px');

  // A.4 Inicializar detección de duplicados en el modal
  inicializarDuplicados();

  // A.6 Inicializar bulk actions (selección múltiple)
  inicializarBulk(() => cargarContenido($('searchBar').value));

  actualizarTagFilterBar();
  await cargarContenido();
})();
