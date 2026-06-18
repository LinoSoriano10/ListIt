import { state } from '../state.js';
import { api } from '../api.js';

export function actualizarTagFilterBar() {
  const bar   = document.getElementById('tagFilterBar');
  const label = document.getElementById('tagFilterLabel');
  if (state.filtroTag) {
    bar.style.display = '';
    label.textContent = state.filtroTag;
  } else {
    bar.style.display = 'none';
  }
}

export function renderTagsModal() {
  const area = document.getElementById('modalTagsArea');
  area.innerHTML = '';
  state.tagsDisponibles.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-pill' + (state.tagsModal.has(tag.id) ? ' active' : '');
    btn.textContent = tag.nombre;
    btn.addEventListener('click', () => {
      if (state.tagsModal.has(tag.id)) state.tagsModal.delete(tag.id);
      else state.tagsModal.add(tag.id);
      renderTagsModal();
    });
    area.appendChild(btn);
  });
}

export async function crearYAnadirTag() {
  const input = document.getElementById('newTagInput');
  const nombre = input.value.trim().toLowerCase();
  if (!nombre) return;
  const tag = await api.crearTag(nombre);
  input.value = '';
  state.tagsDisponibles = await api.getTags();
  state.tagsModal.add(tag.id);
  renderTagsModal();
}
