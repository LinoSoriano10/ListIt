import { state } from '../state.js';
import { api } from '../api.js';
import { toast } from '../lib/toast.js';
import { pushUndo, snapshotEntrada, restaurarEntrada } from '../lib/undo.js';
import { escapeHtml } from '../lib/escape.js';

let onChange = null;  // callback inyectado por main.js para recargar UI

export function inicializarBulk(reloadFn) {
  onChange = reloadFn;

  // Callbacks consumidos por grid.js al hacer click en una card.
  state.onCardCtrlClick = (id, cardEl) => {
    if (!state.modoSeleccion) entrarSeleccion(id);
    else toggleSeleccion(id, cardEl);
  };
  state.onCardSelectClick = (id, cardEl) => {
    toggleSeleccion(id, cardEl);
  };

  // Atajos de teclado
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const enInput = ['INPUT','TEXTAREA','SELECT'].includes(tag);
    if (enInput) return;
    // Ctrl+A → seleccionar todas visibles
    if (e.ctrlKey && e.key === 'a' && state.modoSeleccion) {
      e.preventDefault();
      document.querySelectorAll('#grid .card').forEach(c => {
        const id = parseInt(c.dataset.id);
        state.seleccionMultiple.add(id);
        c.classList.add('bulk-selected');
      });
      actualizarBarra();
    }
    // Esc fuera del input → salir del modo selección
    if (e.key === 'Escape' && state.modoSeleccion) {
      salirSeleccion();
    }
  });

  document.getElementById('bulkBtnCancel').addEventListener('click', salirSeleccion);

  document.getElementById('bulkBtnDel').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar ${state.seleccionMultiple.size} entradas?\nSe podrán recuperar con Ctrl+Z (solo la última eliminación).`)) return;
    const ids = [...state.seleccionMultiple];
    const snapshots = await Promise.all(ids.map(id => snapshotEntrada(id)));
    for (const id of ids) await api.eliminarContenido(id);
    // Undo restaura todas
    pushUndo({
      tipo: 'eliminar-lote',
      descripcion: `${ids.length} eliminadas`,
      handler: async () => {
        for (const snap of snapshots) await restaurarEntrada(snap);
        await onChange();
      },
    });
    toast.success(`${ids.length} eliminadas`, {
      accion: { label: 'Deshacer', handler: async () => {
        for (const snap of snapshots) await restaurarEntrada(snap);
        // Quitamos la entrada de undoStack ya que la consumimos por toast
        const idx = state.undoStack.findIndex(u => u.tipo === 'eliminar-lote' && u.descripcion === `${ids.length} eliminadas`);
        if (idx !== -1) state.undoStack.splice(idx, 1);
        await onChange();
      } },
    });
    salirSeleccion();
    await onChange();
  });

  document.getElementById('bulkEstadoSelect').addEventListener('change', async (e) => {
    const nuevoEstado = e.target.value;
    if (!nuevoEstado) return;
    const ids = [...state.seleccionMultiple];
    for (const id of ids) {
      const item = await api.getDetalle(id);
      if (item) await api.actualizarContenido({ ...item, estado: nuevoEstado });
    }
    toast.success(`${ids.length} entradas → ${nuevoEstado}`);
    e.target.value = '';
    salirSeleccion();
    await onChange();
  });

  document.getElementById('bulkTagSelect').addEventListener('change', async (e) => {
    const tagId = parseInt(e.target.value);
    if (!tagId) return;
    const ids = [...state.seleccionMultiple];
    for (const id of ids) {
      const tagsActuales = await api.getTagsContenido(id);
      const ids2 = tagsActuales.map(t => t.id);
      if (!ids2.includes(tagId)) ids2.push(tagId);
      await api.setTagsContenido(id, ids2);
    }
    const nombre = state.tagsDisponibles.find(t => t.id === tagId)?.nombre || 'tag';
    toast.success(`${ids.length} entradas marcadas con "${nombre}"`);
    e.target.value = '';
    salirSeleccion();
    await onChange();
  });
}

export function refrescarTagsBulk() {
  const sel = document.getElementById('bulkTagSelect');
  sel.innerHTML = '<option value="">Añadir etiqueta…</option>' +
    state.tagsDisponibles.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
}

export function entrarSeleccion(idInicial) {
  state.modoSeleccion = true;
  state.seleccionMultiple.clear();
  if (idInicial != null) state.seleccionMultiple.add(idInicial);
  document.body.classList.add('bulk-mode');
  refrescarTagsBulk();
  actualizarBarra();
  pintarSeleccionados();
}

export function salirSeleccion() {
  state.modoSeleccion = false;
  state.seleccionMultiple.clear();
  document.body.classList.remove('bulk-mode');
  document.getElementById('bulkBar').style.display = 'none';
  document.querySelectorAll('#grid .card.bulk-selected').forEach(c => c.classList.remove('bulk-selected'));
}

export function toggleSeleccion(id, cardEl) {
  if (state.seleccionMultiple.has(id)) {
    state.seleccionMultiple.delete(id);
    cardEl.classList.remove('bulk-selected');
  } else {
    state.seleccionMultiple.add(id);
    cardEl.classList.add('bulk-selected');
  }
  actualizarBarra();
}

function pintarSeleccionados() {
  document.querySelectorAll('#grid .card').forEach(c => {
    const id = parseInt(c.dataset.id);
    if (state.seleccionMultiple.has(id)) c.classList.add('bulk-selected');
  });
}

function actualizarBarra() {
  const bar = document.getElementById('bulkBar');
  const n = state.seleccionMultiple.size;
  if (n === 0) {
    bar.style.display = 'none';
    return;
  }
  document.getElementById('bulkBarCount').textContent = `${n} seleccionada${n !== 1 ? 's' : ''}`;
  bar.style.display = '';
}
