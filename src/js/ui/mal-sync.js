// Modal de sincronización masiva desde MAL (A.7).
// Reusa la lógica de actualización individual de C.3 (api.actualizarDesdeMal)
// en un bucle con rate limit.

import { api } from '../api.js';
import { toast } from '../lib/toast.js';
import { escapeHtml } from '../lib/escape.js';

const JIKAN_DELAY_MS = 400; // Jikan permite ~60 req/min con burst de 3
let cancelado = false;

export async function abrirMalSync() {
  cancelado = false;
  const entradas = await api.obtenerEntradasConMalId();
  const total = entradas.length;

  document.getElementById('modalMalSync').style.display = 'flex';
  document.getElementById('malSyncTitle').textContent = 'Sincronizar desde MAL';

  // Paso 1: preview
  document.getElementById('malSyncBody').innerHTML = `
    <div class="malsync-info">
      <b>${total}</b> entrada${total !== 1 ? 's' : ''} con MAL detectadas.
      ${total === 0 ? '<br><br><em>No hay nada que sincronizar.</em>' : ''}
    </div>
    ${total > 0 ? `
    <div class="malsync-list">
      <strong>Se actualizarán estos campos:</strong>
      <ul>
        <li>Puntuación MAL, ranking</li>
        <li>Estado de emisión (Finalizado / En emisión)</li>
        <li>Estudio, duración por episodio</li>
        <li>Fechas de estreno y fin de emisión</li>
        <li>Episodios totales (solo si MAL > actual)</li>
      </ul>
      <p style="margin-top:8px;color:var(--accent2)">
        Tu progreso (episodios vistos, temporadas marcadas, estado personal)
        <b>nunca</b> se modifica.
      </p>
    </div>
    <p style="font-size:11px;color:var(--muted);text-align:center">
      Tiempo estimado: ${Math.ceil(total * JIKAN_DELAY_MS / 1000)} s · 400ms entre peticiones
    </p>
    ` : ''}
  `;
  document.getElementById('malSyncFooter').innerHTML = `
    <button class="btn-secondary" id="btnMalSyncCerrar">Cerrar</button>
    ${total > 0 ? '<button class="btn-primary" id="btnMalSyncStart">Iniciar actualización</button>' : ''}
  `;
  document.getElementById('btnMalSyncCerrar').onclick = cerrarMalSync;
  if (total > 0) {
    document.getElementById('btnMalSyncStart').onclick = () => ejecutarSync(entradas);
  }
}

export function cerrarMalSync() {
  cancelado = true;
  document.getElementById('modalMalSync').style.display = 'none';
}

async function ejecutarSync(entradas) {
  // Paso 2: progreso
  const total = entradas.length;
  document.getElementById('malSyncBody').innerHTML = `
    <div style="text-align:center;font-size:13px;color:var(--text)">
      Actualizando entradas...
    </div>
    <div class="malsync-progress"><div class="malsync-progress-bar" id="malSyncBar" style="width:0%"></div></div>
    <div class="malsync-current" id="malSyncCurrent">Preparando...</div>
  `;
  document.getElementById('malSyncFooter').innerHTML = `
    <button class="btn-secondary" id="btnMalSyncStop">Cancelar</button>
  `;
  document.getElementById('btnMalSyncStop').onclick = () => { cancelado = true; };

  const resumen = {
    actualizadas: 0,
    sinCambios:   0,
    errores:      [],
    novedades:    [],
  };

  for (let i = 0; i < entradas.length; i++) {
    if (cancelado) break;
    const e = entradas[i];
    const pct = Math.round(((i) / total) * 100);
    document.getElementById('malSyncBar').style.width = pct + '%';
    document.getElementById('malSyncCurrent').textContent = `${i+1}/${total} · ${e.titulo}`;
    try {
      const resp = await fetch(`https://api.jikan.moe/v4/anime/${e.mal_id}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.data) throw new Error('Sin datos');
      const res = await api.actualizarDesdeMal(e.id, json.data);
      if (res.cambios.length > 0) {
        resumen.actualizadas++;
        if (res.episodios_actualizados) {
          resumen.novedades.push(`"${e.titulo}" — episodios totales actualizados`);
        }
      } else {
        resumen.sinCambios++;
      }
      // Detectar secuelas
      const sec = (json.data.relations || []).find(r => r.relation === 'Sequel');
      if (sec && sec.entry?.length) {
        resumen.novedades.push(`"${e.titulo}" — secuela en MAL: ${sec.entry[0].name}`);
      }
    } catch (err) {
      resumen.errores.push(`${e.titulo}: ${err.message || err}`);
    }
    // Rate limit
    if (i < entradas.length - 1 && !cancelado) {
      await new Promise(r => setTimeout(r, JIKAN_DELAY_MS));
    }
  }

  // Paso 3: resultado
  document.getElementById('malSyncBar').style.width = '100%';
  mostrarResultado(resumen, cancelado);
}

function mostrarResultado(r, cancelled) {
  document.getElementById('malSyncTitle').textContent = cancelled
    ? 'Sincronización cancelada'
    : 'Sincronización completada';
  document.getElementById('malSyncBody').innerHTML = `
    <div class="malsync-result-summary">
      <div class="malsync-result-card">
        <div class="malsync-result-num" style="color:var(--viendo)">${r.actualizadas}</div>
        <div class="malsync-result-label">Actualizadas</div>
      </div>
      <div class="malsync-result-card">
        <div class="malsync-result-num" style="color:var(--muted)">${r.sinCambios}</div>
        <div class="malsync-result-label">Sin cambios</div>
      </div>
      <div class="malsync-result-card">
        <div class="malsync-result-num" style="color:var(--abandonado)">${r.errores.length}</div>
        <div class="malsync-result-label">Errores</div>
      </div>
    </div>

    ${r.novedades.length > 0 ? `
    <div class="malsync-novedades">
      <h4>Novedades detectadas (${r.novedades.length})</h4>
      <ul>${r.novedades.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    </div>
    ` : ''}

    ${r.errores.length > 0 ? `
    <div class="malsync-novedades" style="background:rgba(244,63,94,0.08);border-color:rgba(244,63,94,0.3)">
      <h4 style="color:var(--abandonado)">Errores</h4>
      <ul>${r.errores.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
    </div>
    ` : ''}
  `;
  document.getElementById('malSyncFooter').innerHTML = `
    <button class="btn-primary" id="btnMalSyncDone">Cerrar</button>
  `;
  document.getElementById('btnMalSyncDone').onclick = async () => {
    cerrarMalSync();
    // Notificar al main que recargue
    if (window.__onMalSyncDone) await window.__onMalSyncDone();
  };
}
