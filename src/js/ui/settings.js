import { state } from '../state.js';
import { api } from '../api.js';
import { cargarContenido } from './content.js';
import { escapeHtml } from '../lib/escape.js';

export function aplicarTema(tema) {
  if (tema === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

export function abrirSettings() {
  cargarSettings();
  document.getElementById('modalSettings').style.display = 'flex';
}

export function cerrarSettings() {
  document.getElementById('modalSettings').style.display = 'none';
}

async function cargarSettings() {
  const [tagDefecto, ordenDefecto, theme, tags] = await Promise.all([
    api.getSetting('tag_defecto'),
    api.getSetting('orden_defecto'),
    api.getSetting('theme'),
    api.getTags(),
  ]);

  const tagSel = document.getElementById('settingTagDefecto');
  tagSel.innerHTML =
    `<option value="">— Sin defecto —</option>` +
    tags.map(t =>
      `<option value="${escapeHtml(t.nombre)}"${t.nombre === tagDefecto ? ' selected' : ''}>${escapeHtml(t.nombre)}</option>`
    ).join('');

  document.getElementById('settingOrdenDefecto').value = ordenDefecto || 'reciente';
  document.getElementById('settingTheme').value        = theme || 'dark';
}

export async function guardarSettings() {
  const tagDefecto   = document.getElementById('settingTagDefecto').value;
  const ordenDefecto = document.getElementById('settingOrdenDefecto').value;
  const theme        = document.getElementById('settingTheme').value;

  await Promise.all([
    api.setSetting('tag_defecto',   tagDefecto),
    api.setSetting('orden_defecto', ordenDefecto),
    api.setSetting('theme',         theme),
  ]);

  // Reflejar el nuevo orden por defecto en el selector del header y aplicarlo de inmediato.
  state.filtroOrden = ordenDefecto || 'reciente';
  const selOrden = document.getElementById('selectOrden');
  if (selOrden) selOrden.value = state.filtroOrden;

  aplicarTema(theme);
  cerrarSettings();
  await cargarContenido(document.getElementById('searchBar')?.value || '');
}
