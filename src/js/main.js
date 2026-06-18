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
import {
  abrirImport,
  cerrarImport,
  manejarPickXml,
  descargarPlantilla,
} from './ui/import.js';
import { buscarEnMAL, aplicarDatosMAL } from './lib/mal.js';
import { getImageSrc } from './lib/image.js';
import { cargarDashboard } from './ui/dashboard.js';
import { abrirTagsManager, cerrarTagsManager } from './ui/tagsManager.js';
import { abrirSettings, cerrarSettings, guardarSettings, aplicarTema } from './ui/settings.js';
import { cerrarDetalle } from './ui/detail.js';
import { inicializarBulk, salirSeleccion, refrescarTagsBulk } from './ui/bulk-actions.js';
import { abrirMalSync, cerrarMalSync } from './ui/mal-sync.js';
import { deshacer } from './lib/undo.js';

const $ = (id) => document.getElementById(id);

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

// ─── Importación XML ──────────────────────────────────────
$('btnImport').addEventListener('click', abrirImport);
$('btnCerrarImport').addEventListener('click', cerrarImport);

$('modalImport').addEventListener('click', (e) => {
  if (e.target === $('modalImport')) cerrarImport();
});

$('btnPickXml').addEventListener('click', manejarPickXml);
$('btnDescargarPlantilla').addEventListener('click', descargarPlantilla);

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
    if ($('modalMalSync')?.style.display !== 'none')    { cerrarMalSync(); return; }
    if ($('modalSettings')?.style.display !== 'none')   { cerrarSettings(); return; }
    if ($('modalTagsManager').style.display !== 'none') { cerrarTagsManager(); return; }
    if ($('modalImport').style.display !== 'none')      { cerrarImport(); return; }
    if ($('modal').style.display !== 'none')            { cerrarModal(); return; }
    if (state.modoSeleccion)                            { salirSeleccion(); return; }
    if ($('detailPanel').classList.contains('open'))    { cerrarDetalle(); return; }
  }
  if (enInput) return;

  if (e.ctrlKey && e.key === 'n')              { e.preventDefault(); abrirModalNuevo(); }
  if (e.ctrlKey && e.key === 'f')              { e.preventDefault(); $('searchBar').focus(); $('searchBar').select(); }
  if (e.ctrlKey && e.key === 'i')              { e.preventDefault(); abrirImport(); }
  if (e.ctrlKey && e.key === ',')              { e.preventDefault(); abrirSettings(); }
  // B.7 Deshacer
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); deshacer(); }
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

// ─── Exportar ──────────────────────────────────────────────
const exportMenu = $('exportMenu');

$('btnExport').addEventListener('click', e => {
  e.stopPropagation();
  exportMenu.style.display = exportMenu.style.display === 'none' ? '' : 'none';
});
document.addEventListener('click', () => { exportMenu.style.display = 'none'; });

$('btnExportXml').addEventListener('click', async () => {
  exportMenu.style.display = 'none';
  await api.exportarXml();
});
$('btnExportMd').addEventListener('click', async () => {
  exportMenu.style.display = 'none';
  await api.exportarMarkdown();
});
$('btnExportBd').addEventListener('click', async () => {
  exportMenu.style.display = 'none';
  await api.exportarBd();
});

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

  // A.4 Inicializar detección de duplicados en el modal
  inicializarDuplicados();

  // A.6 Inicializar bulk actions (selección múltiple)
  inicializarBulk(() => cargarContenido($('searchBar').value));

  actualizarTagFilterBar();
  await cargarContenido();
})();
