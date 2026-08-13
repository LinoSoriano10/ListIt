import { api } from '../api.js';
import { escapeHtml } from '../lib/escape.js';
import { toast } from '../lib/toast.js';
import { mensajeErrorMal } from '../lib/mal-errores.js';

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
  const [tagDefecto, theme, tags] = await Promise.all([
    api.getSetting('tag_defecto'),
    api.getSetting('theme'),
    api.getTags(),
  ]);

  const tagSel = document.getElementById('settingTagDefecto');
  tagSel.innerHTML =
    `<option value="">— Sin defecto —</option>` +
    tags.map(t =>
      `<option value="${escapeHtml(t.nombre)}"${t.nombre === tagDefecto ? ' selected' : ''}>${escapeHtml(t.nombre)}</option>`
    ).join('');

  document.getElementById('settingTheme').value = theme || 'dark';

  await refrescarEstadoMal();
}

// ─── Credencial de MyAnimeList ────────────────────────────────────────────────
// El Client ID nunca vuelve del proceso principal: solo se consulta si hay uno
// guardado. Por eso el campo se muestra siempre vacío aunque esté configurado.

async function refrescarEstadoMal() {
  const el = document.getElementById('malCredEstado');
  const input = document.getElementById('settingMalClientId');
  input.value = '';

  const { configurado, cifrado } = await api.malCredencialEstado();

  if (configurado) {
    el.textContent = cifrado
      ? '✓ Configurado (guardado cifrado)'
      : '✓ Configurado (sin cifrar: este sistema no ofrece almacén seguro)';
    el.style.color = 'var(--accent2)';
    input.placeholder = 'Pega un Client ID nuevo para reemplazarlo';
  } else {
    el.textContent = 'Sin configurar — se usará Jikan, cuya búsqueda está caída';
    el.style.color = 'var(--muted)';
    input.placeholder = 'Pega aquí tu Client ID';
  }
}

export async function guardarClientIdMal() {
  const input = document.getElementById('settingMalClientId');
  const valor = input.value.trim();
  if (!valor) {
    toast.error('Pega tu Client ID antes de guardar');
    return;
  }

  // Se valida contra la API antes de guardarlo: más vale enterarse aquí que al
  // primer intento de búsqueda.
  const res = await api.malCredencialGuardar(valor);
  if (res.ok) {
    toast.success('Client ID verificado y guardado');
  } else {
    toast.error(mensajeErrorMal(res.codigo, res.mensaje));
  }
  await refrescarEstadoMal();
}

export async function borrarClientIdMal() {
  await api.malCredencialBorrar();
  toast.info('Client ID borrado de este ordenador');
  await refrescarEstadoMal();
}

export async function guardarSettings() {
  const tagDefecto = document.getElementById('settingTagDefecto').value;
  const theme      = document.getElementById('settingTheme').value;

  await Promise.all([
    api.setSetting('tag_defecto', tagDefecto),
    api.setSetting('theme',       theme),
  ]);

  aplicarTema(theme);
  cerrarSettings();
}
