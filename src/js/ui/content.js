import { state } from '../state.js';
import { api } from '../api.js';
import { renderGrid } from './grid.js';
import { actualizarContadores } from './contadores.js';
import { matchAll } from '../lib/search.js';
import { refrescarTipos } from '../lib/tipos-ui.js';

export function mostrarVista(vista) {
  const grid  = document.getElementById('grid');
  const empty = document.getElementById('emptyState');
  const dash  = document.getElementById('dashboardView');
  const cal   = document.getElementById('calendarioView');

  const esGrid = vista !== 'dashboard' && vista !== 'calendario';

  dash.style.display  = vista === 'dashboard'  ? '' : 'none';
  cal.style.display   = vista === 'calendario' ? '' : 'none';
  grid.style.display  = esGrid ? '' : 'none';
  // La visibilidad de `empty` la gestiona renderGrid cuando toca el grid.
  if (!esGrid) empty.style.display = 'none';

  state.vistaActual = vista;
  sincronizarSidebar(vista, esGrid);
}

// El resaltado de la barra lateral se deriva de la vista activa, en un solo
// sitio. Antes cada grupo de botones limpiaba solo el suyo, así que al volver
// al listado desde Dashboard o Calendario quedaban dos opciones marcadas a la
// vez.
function sincronizarSidebar(vista, esGrid) {
  const botonDeVista = { dashboard: 'btnDashboard', calendario: 'btnCalendario' }[vista];

  document.querySelectorAll('.filter-btn-dashboard').forEach(b => {
    // Solo los botones que abren una vista participan; el resto (Ajustes,
    // Gestionar etiquetas…) abren modales y nunca deben quedarse marcados.
    if (b.id === 'btnDashboard' || b.id === 'btnCalendario') {
      b.classList.toggle('active', b.id === botonDeVista);
    } else {
      b.classList.remove('active');
    }
  });

  document.querySelectorAll('.filter-btn[data-estado]').forEach(b => {
    b.classList.toggle('active', esGrid && b.dataset.estado === state.filtroEstado);
  });
}

export async function cargarContenido(termino = '') {
  // Se releen los tipos porque su visibilidad depende del uso: crear la primera
  // serie debe hacer aparecer ese tipo, y borrar la última, desaparecerlo.
  await refrescarTipos();

  const items = await api.getContenido({
    estado: state.filtroEstado,
    tag:    state.filtroTag,
    orden:  state.filtroOrden,
  });
  state.todosLosItems = items;
  if (state.vistaActual !== 'grid') mostrarVista('grid');
  renderGrid(matchAll(termino, items));
  await actualizarContadores();
}
