import { state } from '../state.js';
import { api } from '../api.js';
import { renderGrid } from './grid.js';
import { actualizarContadores } from './contadores.js';
import { matchAll } from '../lib/search.js';

export function mostrarVista(vista) {
  const grid  = document.getElementById('grid');
  const empty = document.getElementById('emptyState');
  const dash  = document.getElementById('dashboardView');

  if (vista === 'dashboard') {
    grid.style.display  = 'none';
    empty.style.display = 'none';
    dash.style.display  = '';
  } else {
    dash.style.display = 'none';
    grid.style.display = '';
    // empty visibility gestionada por renderGrid
  }
  state.vistaActual = vista;
}

export async function cargarContenido(termino = '') {
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
