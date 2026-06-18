// Ventana secundaria de detalle expandido (C.3).
// Solo lectura. Se comunica con el main process via window.api/events.

import { getImageSrc } from './lib/image.js';
import { escapeHtml }  from './lib/escape.js';
import { STATUS_COLOR, STATUS_LABEL } from './lib/colors.js';
import { actualizarEntradaDesdeMal }  from './lib/mal.js';

const api    = window.api;
const events = window.events;

let currentId = null;

async function cargar(id) {
  currentId = id;
  const [item, entregas, nombres, actividad] = await Promise.all([
    api.getDetalle(id),
    api.getEntregas(id),
    api.getNombres(id),
    api.obtenerActividadEntrada(id, 30),
  ]);

  if (!item) {
    document.getElementById('dw').innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Entrada no encontrada</div>';
    document.title = 'ListIt — Detalle';
    return;
  }
  document.title = `ListIt — ${item.titulo}`;

  const color = STATUS_COLOR[item.estado];

  // Meta line: estudio · tipo · duración · fechas
  const metaParts = [];
  if (item.estudio)           metaParts.push(escapeHtml(item.estudio));
  if (item.duracion_ep)       metaParts.push(escapeHtml(item.duracion_ep));
  if (item.fecha_estreno) {
    const fechas = item.fecha_fin_emision && item.fecha_fin_emision !== item.fecha_estreno
      ? `${escapeHtml(item.fecha_estreno)} → ${escapeHtml(item.fecha_fin_emision)}`
      : escapeHtml(item.fecha_estreno);
    metaParts.push(fechas);
  }
  if (item.estado_emision)    metaParts.push(escapeHtml(item.estado_emision));

  const totalEp = entregas.reduce((s, e) => s + (e.episodios_totales || 0), 0) || item.episodios_totales || 0;
  const tipoLinea = totalEp > 0 ? `${totalEp} ep.` : '';

  const meta = metaParts.length ? metaParts.join(' <span class="sep">·</span> ') : '<span style="color:var(--muted)">Sin datos MAL</span>';

  // Score MAL block (solo si hay datos)
  const scoreBlock = (item.score_mal != null) ? `
    <div class="dw-mal-score">
      <div>
        <div class="score-num">★ ${item.score_mal.toFixed(2)}</div>
        <div class="score-label">MyAnimeList</div>
      </div>
      ${item.mal_rank ? `<div><span class="rank">#${item.mal_rank}</span><div class="score-label">Ranking</div></div>` : ''}
    </div>
  ` : '';

  // Entregas section
  const entregasHtml = entregas.length === 0
    ? '<p class="dw-empty">Sin temporadas registradas</p>'
    : `<div class="dw-act-list">${entregas.map(e => {
        const epA = e.episodio_actual || 0;
        const epT = e.episodios_totales || 0;
        const completa = e.visto || (epT > 0 && epA >= epT);
        return `<div class="dw-act-item">
          <span style="color:${completa ? 'var(--viendo)' : 'var(--muted)'}; min-width:24px">${completa ? '✓' : '○'}</span>
          <span class="dw-act-detalle">
            <strong>${escapeHtml(e.numero)}</strong>
            ${e.titulo ? ` · ${escapeHtml(e.titulo)}` : ''}
            ${epT > 0 ? ` <span style="color:var(--muted)">(${epA}/${epT} ep.)</span>` : ''}
          </span>
        </div>`;
      }).join('')}</div>`;

  // Nombres alternativos
  const nombresHtml = nombres.length === 0
    ? ''
    : `<div class="dw-section">
        <h3>Nombres alternativos</h3>
        <div style="font-size:13px;color:var(--text);line-height:1.7">
          ${nombres.map(n => escapeHtml(n)).join(' <span class="sep" style="color:var(--muted)">·</span> ')}
        </div>
      </div>`;

  // Actividad
  const actividadHtml = actividad.length === 0
    ? '<p class="dw-empty">Sin actividad registrada para esta entrada.</p>'
    : `<div class="dw-act-list">${actividad.map(a => `
        <div class="dw-act-item">
          <span class="dw-act-fecha">${(a.fecha || '').slice(0,10)}</span>
          <span class="dw-act-detalle">
            <strong>${escapeHtml(traducirTipo(a.tipo))}</strong>
            ${a.detalle ? ` — ${escapeHtml(a.detalle)}` : ''}
          </span>
        </div>
      `).join('')}</div>`;

  document.getElementById('dw').innerHTML = `
    <div class="dw-header">
      <img class="dw-img" src="${getImageSrc(item.imagen)}" alt="" onerror="this.src='img/no-image.png'">
      <div class="dw-info">
        <div class="dw-titulo">${escapeHtml(item.titulo)}</div>
        <div class="dw-meta-line">${meta}</div>
        <div class="dw-meta-line" style="margin-top:8px">
          <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700">
            <span style="width:8px;height:8px;border-radius:50%;background:${color}"></span>
            <span style="color:${color}">${STATUS_LABEL[item.estado]}</span>
          </span>
          ${tipoLinea ? `<span class="sep">·</span> ${tipoLinea}` : ''}
          ${item.anio ? `<span class="sep">·</span> ${item.anio}` : ''}
        </div>
        ${scoreBlock}
      </div>
    </div>

    <div class="dw-body">
      <div class="dw-section">
        <h3>Sinopsis</h3>
        <div class="dw-desc">${item.descripcion ? escapeHtml(item.descripcion) : '<em class="dw-empty">Sin descripción</em>'}</div>
      </div>

      <div class="dw-section">
        <h3>Temporadas / Entregas</h3>
        ${entregasHtml}
      </div>

      ${nombresHtml}

      <div class="dw-section">
        <h3>Historial</h3>
        ${actividadHtml}
      </div>
    </div>

    <div class="dw-footer">
      ${item.mal_id ? '<button class="dh-btn-mal" id="btnDwActualizarMAL">↻ Actualizar desde MAL</button>' : ''}
      <button class="btn-secondary" id="btnDwRefrescar" style="margin-left:auto">↻ Refrescar</button>
      <button class="btn-primary"   id="btnDwCerrar">Cerrar</button>
    </div>
  `;

  // Listeners
  document.getElementById('btnDwCerrar').onclick = () => window.close();
  document.getElementById('btnDwRefrescar').onclick = () => cargar(currentId);

  const btnMal = document.getElementById('btnDwActualizarMAL');
  if (btnMal && item.mal_id) {
    btnMal.onclick = async () => {
      btnMal.disabled = true;
      btnMal.textContent = '⟳ Actualizando…';
      try {
        const res = await actualizarEntradaDesdeMal(currentId, item.mal_id);
        await cargar(currentId);
        const msg = res.cambios.length > 0
          ? `✓ Actualizado: ${res.cambios.join(', ')}`
          : '✓ Datos al día (sin cambios)';
        mostrarFlash(msg);
      } catch (e) {
        btnMal.disabled = false;
        btnMal.textContent = '↻ Actualizar desde MAL';
        mostrarFlash(`✗ Error: ${e.message || e}`, true);
      }
    };
  }
}

function traducirTipo(tipo) {
  return {
    creado:           'Creada',
    estado_cambio:    'Cambio de estado',
    entrega_marcada:  'Temporada marcada',
    ep_visto:         'Episodio visto',
    mal_sync:         'Datos MAL actualizados',
  }[tipo] || tipo;
}

function mostrarFlash(texto, esError = false) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed;bottom:20px;right:20px;padding:10px 16px;
    background:var(--surface);border:1px solid ${esError ? 'var(--abandonado)' : 'var(--viendo)'};
    border-radius:8px;font-size:13px;color:var(--text);z-index:2000;
    box-shadow:0 8px 24px rgba(0,0,0,0.4);
  `;
  flash.textContent = texto;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 3500);
}

// Cargar cuando el main envíe el id
events.on('detalle-cargar', id => cargar(id));
events.on('detalle-refrescar', id => { if (id === currentId) cargar(currentId); });
