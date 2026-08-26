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
