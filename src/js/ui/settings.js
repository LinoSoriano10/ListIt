import { api } from '../api.js';
import { escapeHtml } from '../lib/escape.js';
import { toast } from '../lib/toast.js';
import { mensajeErrorMal } from '../lib/mal-errores.js';
import { parsearConfigFirebase } from '../lib/firebase-config.js';
import { invalidarTipos } from '../lib/tipos-ui.js';

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

  await renderTipos();
  await refrescarEstadoMal();
  await refrescarEstadoSync();
}

// ─── Tipos de contenido ───────────────────────────────────────────────────────
// Cada tipo declara su unidad, cuánto dura y si cuenta como tiempo de visionado.
// Es lo que evita que un manwa de 400 capítulos sume 160 horas que nadie ha visto.

async function renderTipos() {
  const cont = document.getElementById('settingsTipos');
  if (!cont) return;

  const tipos = await api.tiposObtener();

  cont.innerHTML = tipos.map(t => {
    const unidad = t.unidad === 'capitulo' ? 'capítulo' : 'episodio';
    const vis = t.visible === 1 ? 'visible' : t.visible === 0 ? 'oculto' : 'auto';
    return `
      <div class="tipo-fila" data-clave="${escapeHtml(t.clave)}">
        <div class="tipo-nombre">
          ${escapeHtml(t.nombre)}
          <span class="tipo-uso">${t.entradas} ${t.entradas === 1 ? 'entrada' : 'entradas'}</span>
        </div>
        <label class="tipo-campo" title="Minutos que dura cada ${unidad}">
          <input type="number" class="tipo-min" min="0" max="600" value="${t.minutos_por_unidad}"
                 ${t.cuenta_tiempo ? '' : 'disabled'}>
          <span>min/${unidad}</span>
        </label>
        <label class="tipo-campo" title="Si se marca, suma a las horas de visionado">
          <input type="checkbox" class="tipo-cuenta" ${t.cuenta_tiempo ? 'checked' : ''}>
          <span>cuenta tiempo</span>
        </label>
        <select class="tipo-visible" title="Cuándo mostrar este tipo en la interfaz">
          <option value="auto"    ${vis === 'auto'    ? 'selected' : ''}>Automático</option>
          <option value="visible" ${vis === 'visible' ? 'selected' : ''}>Visible</option>
          <option value="oculto"  ${vis === 'oculto'  ? 'selected' : ''}>Oculto</option>
        </select>
      </div>`;
  }).join('');

  cont.querySelectorAll('.tipo-fila').forEach(fila => {
    const clave = fila.dataset.clave;
    const guardar = async (campos) => {
      await api.tiposActualizar(clave, campos);
      invalidarTipos();          // la caché del renderer queda obsoleta
      await renderTipos();
    };

    fila.querySelector('.tipo-min').addEventListener('change', e =>
      guardar({ minutos_por_unidad: Math.max(0, parseInt(e.target.value, 10) || 0) }));

    fila.querySelector('.tipo-cuenta').addEventListener('change', e =>
      guardar({ cuenta_tiempo: e.target.checked ? 1 : 0 }));

    fila.querySelector('.tipo-visible').addEventListener('change', e => {
      const v = e.target.value;
      guardar({ visible: v === 'auto' ? null : (v === 'visible' ? 1 : 0) });
    });
  });
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

// ─── Sincronización con Firestore ─────────────────────────────────────────────

const MENSAJES_SYNC = {
  'sin-configurar':    'La sincronización no está configurada.',
  'config-invalida':   'La configuración de Firebase no es válida.',
  'auth-invalida':     'Email o contraseña incorrectos.',
  'permiso-denegado':  'Firestore rechazó la operación. Revisa las reglas de seguridad de tu proyecto.',
  'no-existe':         'Todavía no hay ninguna copia en la nube. Sube primero desde el ordenador que tenga los datos buenos.',
  'demasiado-grande':  'La biblioteca no cabe en un documento de Firestore.',
  'corrupto':          'La copia en la nube está dañada.',
  'red':               'Sin conexión con Firebase.',
};

function mensajeSync(codigo, respaldo) {
  return MENSAJES_SYNC[codigo] || respaldo || 'No se pudo sincronizar.';
}

function fechaCorta(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 'nunca' : d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function refrescarEstadoSync() {
  const el         = document.getElementById('syncEstado');
  const formulario = document.getElementById('syncFormulario');
  const acciones   = document.getElementById('syncAcciones');

  const e = await api.syncEstado();

  formulario.style.display = e.configurado ? 'none' : '';
  acciones.style.display   = e.configurado ? '' : 'none';

  if (!e.configurado) {
    el.textContent = 'Desactivada';
    el.style.color = 'var(--muted)';
    return;
  }

  const partes = [`✓ Activa · ${e.proyecto}`, `última: ${fechaCorta(e.ultimaFecha)}`];
  if (e.nuncaSincronizado)      partes.push('sin sincronizar todavía');
  else if (e.hayCambiosLocales) partes.push('con cambios locales sin subir');
  el.textContent = partes.join(' · ');
  el.style.color = e.hayCambiosLocales ? 'var(--accent2)' : 'var(--muted)';

  // La contraseña no vuelve nunca del proceso principal; se limpian los campos.
  document.getElementById('syncPassword').value = '';
}

export async function activarSync() {
  const { config, faltan } = parsearConfigFirebase(document.getElementById('syncConfig').value);
  if (!config) {
    toast.error(`No se reconoce la configuración. Faltan: ${faltan.join(', ')}`);
    return;
  }

  const email    = document.getElementById('syncEmail').value.trim();
  const password = document.getElementById('syncPassword').value;
  if (!email || !password) {
    toast.error('Hacen falta el email y la contraseña de la cuenta de Firebase');
    return;
  }

  toast.info('Conectando con Firebase…');
  const r = await api.syncConfigurar({ config, email, password });
  if (r.ok) {
    toast.success(`Sincronización activada en «${r.proyecto}»`);
    document.getElementById('syncConfig').value = '';
    document.getElementById('syncPassword').value = '';
  } else {
    toast.error(mensajeSync(r.codigo, r.mensaje));
  }
  await refrescarEstadoSync();
}

export async function subirSync(forzar = false) {
  toast.info('Subiendo biblioteca…');
  const r = await api.syncSubir({ forzar });

  if (!r.ok) { toast.error(mensajeSync(r.codigo, r.mensaje)); return; }

  if (r.conflicto) {
    const ok = confirm(
      `En la nube hay una copia más reciente que la última que sincronizaste.\n\n` +
      `Subida desde: ${r.remoto.dispositivo || 'otro equipo'}\n` +
      `Fecha: ${fechaCorta(r.remoto.generado_en)}\n\n` +
      `Si continúas, esa copia se perderá y quedará la de este ordenador.\n` +
      `¿Subir de todas formas?`
    );
    if (ok) await subirSync(true);
    return;
  }

  if (r.sinCambios) toast.info('La nube ya estaba al día');
  else toast.success(`Biblioteca subida (${Math.round(r.bytes / 1024)} KB, ${r.porcentaje}% del límite)`);

  await refrescarEstadoSync();
}

export async function bajarSync(forzar = false) {
  toast.info('Descargando biblioteca…');
  const r = await api.syncBajar({ forzar });

  if (!r.ok) { toast.error(mensajeSync(r.codigo, r.mensaje)); return; }

  if (r.conflicto) {
    const ok = confirm(
      `Este ordenador tiene cambios que no has subido.\n\n` +
      `La copia de la nube es de: ${r.remoto.dispositivo || 'otro equipo'}\n` +
      `Fecha: ${fechaCorta(r.remoto.generado_en)}\n\n` +
      `Si continúas, tus cambios locales se perderán y quedará la copia de la nube.\n` +
      `(Se guardará una copia de seguridad local antes de sustituir nada.)\n\n` +
      `¿Bajar de todas formas?`
    );
    if (ok) await bajarSync(true);
    return;
  }

  if (r.sinCambios) {
    toast.info('Tu biblioteca ya coincide con la de la nube');
  } else {
    const n = r.resumen?.contenido ?? 0;
    toast.success(`Biblioteca sustituida: ${n} series. Copia previa guardada en backups.`);
  }

  await refrescarEstadoSync();
}

export async function desactivarSync() {
  const ok = confirm(
    '¿Desactivar la sincronización?\n\n' +
    'Se borrarán de este ordenador la configuración de Firebase y las credenciales.\n' +
    'Tu biblioteca local y la copia de la nube se quedan como están.'
  );
  if (!ok) return;

  await api.syncDesactivar();
  toast.info('Sincronización desactivada');
  await refrescarEstadoSync();
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
