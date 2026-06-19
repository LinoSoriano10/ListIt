import { state } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../lib/escape.js';

const BUILTIN = ['anime', 'serie', 'pelicula'];

export function abrirTagsManager() {
  document.getElementById('modalTagsManager').style.display = 'flex';
  refrescarLista();
}

export function cerrarTagsManager() {
  document.getElementById('modalTagsManager').style.display = 'none';
}

async function refrescarLista() {
  const tags = await api.contarPorTag();
  const lista = document.getElementById('tagsManagerList');

  lista.innerHTML = tags.map(t => `
    <div class="tm-row" data-id="${t.id}">
      <span class="tm-nombre" data-id="${t.id}">${escapeHtml(t.nombre)}</span>
      <span class="tm-count" title="${t.n} entradas">${t.n}</span>
      <div class="tm-actions">
        ${BUILTIN.includes(t.nombre)
          ? `<span class="tm-lock" title="Etiqueta predefinida — no se puede renombrar ni eliminar">🔒</span>`
          : `<button class="tm-btn tm-btn-rename" data-id="${t.id}" title="Renombrar">✏</button>
             <button class="tm-btn tm-btn-del" data-id="${t.id}" data-n="${t.n}" data-nombre="${encodeURIComponent(t.nombre)}" title="Eliminar">×</button>`}
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('.tm-btn-rename').forEach(btn => {
    btn.addEventListener('click', () => iniciarRename(parseInt(btn.dataset.id)));
  });

  lista.querySelectorAll('.tm-btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const n      = parseInt(btn.dataset.n);
      const nombre = decodeURIComponent(btn.dataset.nombre);
      const msg    = n > 0
        ? `¿Eliminar la etiqueta "${nombre}"?\nSe quitará de ${n} entrada${n !== 1 ? 's' : ''}.`
        : `¿Eliminar la etiqueta "${nombre}"?`;
      if (!confirm(msg)) return;
      await api.eliminarTag(parseInt(btn.dataset.id));
      state.tagsDisponibles = await api.getTags();
      refrescarLista();
    });
  });
}

async function iniciarRename(id) {
  const span = document.querySelector(`.tm-nombre[data-id="${id}"]`);
  if (!span) return;
  const oldText = span.textContent;
  const input   = document.createElement('input');
  input.value     = oldText;
  input.className = 'tm-input-rename';
  span.replaceWith(input);
  input.focus();
  input.select();

  let saved = false;
  const guardar = async () => {
    if (saved) return;
    saved = true;
    const nuevo = input.value.trim().toLowerCase();
    if (nuevo && nuevo !== oldText) {
      await api.actualizarTag(id, nuevo);
      state.tagsDisponibles = await api.getTags();
    }
    refrescarLista();
  };
  input.addEventListener('blur', guardar);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { saved = true; input.replaceWith(span); }
  });
}
