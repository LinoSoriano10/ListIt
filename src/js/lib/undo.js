// Sistema de undo simple, basado en snapshots.
// La pila vive en `state.undoStack` para que sea inspeccionable.
// Se limita a 5 operaciones para no crecer indefinidamente.

import { state } from '../state.js';
import { api } from '../api.js';
import { toast } from './toast.js';

const MAX = 5;

/**
 * Empuja una entrada deshacer a la pila.
 * @param {object} entrada {tipo, snapshot, descripcion, handler}
 *   - tipo: 'eliminar'|'actualizar'
 *   - snapshot: datos para deshacer
 *   - descripcion: texto para mostrar al usuario
 *   - handler: async () => void  (lógica de deshacer)
 */
export function pushUndo(entrada) {
  state.undoStack.push(entrada);
  while (state.undoStack.length > MAX) state.undoStack.shift();
}

/**
 * Ejecuta el último undo. Devuelve true si se hizo algo.
 */
export async function deshacer() {
  const ultima = state.undoStack.pop();
  if (!ultima) return false;
  try {
    await ultima.handler();
    toast.success('Acción deshecha ✓');
    return true;
  } catch (e) {
    toast.error(`Error al deshacer: ${e.message}`);
    return false;
  }
}

/**
 * Captura un snapshot completo de una entrada (contenido + entregas + tags + nombres)
 * para poder restaurarla tras eliminar.
 */
export async function snapshotEntrada(id) {
  const [contenido, entregas, tagsItem, nombres] = await Promise.all([
    api.getDetalle(id),
    api.getEntregas(id),
    api.getTagsContenido(id),
    api.getNombres(id),
  ]);
  return { contenido, entregas, tagsItem, nombres };
}

/**
 * Restaura una entrada desde su snapshot (re-inserta todo).
 */
export async function restaurarEntrada(snapshot) {
  const { contenido, entregas, tagsItem, nombres } = snapshot;
  // Eliminar id antiguo del snapshot porque crearemos uno nuevo
  const { id: _oldId, ...c } = contenido;
  void _oldId;
  const res = await api.guardarContenido(c);
  const newId = res.lastInsertRowid;
  // Reinsertar tags asociaciones
  if (tagsItem.length) await api.setTagsContenido(newId, tagsItem.map(t => t.id));
  // Reinsertar nombres
  if (nombres.length) await api.setNombres(newId, nombres);
  // Reinsertar entregas en orden
  for (const e of entregas) {
    await api.guardarEntregaCompleta({
      contenido_id: newId,
      numero: e.numero,
      titulo: e.titulo,
      visto: e.visto,
      episodio_actual: e.episodio_actual,
      episodios_totales: e.episodios_totales,
      mal_id: e.mal_id,
      no_emitido: e.no_emitido,
    });
  }
  return newId;
}
