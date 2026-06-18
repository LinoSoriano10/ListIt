import { state } from '../state.js';
import { api } from '../api.js';

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
      `<option value="${t.nombre}"${t.nombre === tagDefecto ? ' selected' : ''}>${t.nombre}</option>`
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

  // Aplicar orden inmediatamente
  state.filtroOrden = ordenDefecto || 'reciente';
  const btnR = document.getElementById('btnSortReciente');
  const btnA = document.getElementById('btnSortAlfabetico');
  if (ordenDefecto === 'alfabetico') {
    btnA.classList.add('active'); btnR.classList.remove('active');
  } else {
    btnR.classList.add('active'); btnA.classList.remove('active');
  }

  aplicarTema(theme);
  cerrarSettings();
}
