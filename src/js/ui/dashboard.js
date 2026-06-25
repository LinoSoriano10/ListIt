import { api } from '../api.js';
import { STATUS_COLOR, STATUS_LABEL } from '../lib/colors.js';
import { getImageSrc } from '../lib/image.js';
import { escapeHtml } from '../lib/escape.js';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export async function cargarDashboard() {
  const [stats, actividad, actividadDetalle] = await Promise.all([
    api.estadisticasGenerales(),
    api.actividadPorMes(12),
    api.obtenerActividad(20),
  ]);
  renderKpis(stats);
  renderDonut(stats.porEstado);
  renderDonutServicios(stats.cobertura || { con_mal: 0, sin_servicio: 0 });
  renderBarTags(stats.tagStats);
  renderViendo(stats.viendo);
  renderActividad(actividad);
  renderActividadReciente(actividadDetalle);
}

// ── A.8 Cobertura de servicios externos ──────────────────────────────────────

function renderDonutServicios(cobertura) {
  const canvas = document.getElementById('donutServicios');
  const leyenda = document.getElementById('donutServiciosLeyenda');
  const btnSync = document.getElementById('dashBtnMalSync');
  const btnHeader = document.getElementById('btnMalSync');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const total = cobertura.con_mal + cobertura.sin_servicio;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Mostrar/ocultar botón de sync masiva según haya entradas con MAL
  const tieneMal = cobertura.con_mal > 0;
  if (btnSync)   btnSync.style.display   = tieneMal ? '' : 'none';
  if (btnHeader) btnHeader.style.display = tieneMal ? '' : 'none';

  if (total === 0) {
    leyenda.innerHTML = '<p style="color:var(--muted);font-size:13px">Sin entradas</p>';
    return;
  }

  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r  = Math.min(cx, cy) - 8;
  const ri = r * 0.58;
  let angle = -Math.PI / 2;

  const segs = [
    { label: 'Con MAL',  n: cobertura.con_mal,      color: css('--accent')        || '#7c3aed' },
    { label: 'Manual',   n: cobertura.sin_servicio, color: css('--muted')         || '#7070a0' },
  ];

  for (const seg of segs) {
    if (seg.n === 0) continue;
    const slice = (seg.n / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    angle += slice;
  }

  // Agujero
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.fillStyle = css('--s2') || '#1a1a2e';
  ctx.fill();

  ctx.fillStyle    = css('--text') || '#eeeef8';
  ctx.font         = `bold 20px system-ui`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy);

  leyenda.innerHTML = segs.map(s => `
    <div class="dash-legend-item">
      <span class="dash-legend-dot" style="background:${s.color}"></span>
      <span class="dash-legend-label">${s.label}</span>
      <span class="dash-legend-val">${s.n}</span>
    </div>
  `).join('');
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function renderKpis(stats) {
  const viendo     = stats.porEstado.find(e => e.estado === 'viendo')?.n     || 0;
  const completado = stats.porEstado.find(e => e.estado === 'completado')?.n || 0;
  const horas      = Math.round(stats.minutos / 60);

  document.getElementById('dashKpis').innerHTML = `
    <div class="dash-kpi">
      <div class="dash-kpi-num">${stats.total}</div>
      <div class="dash-kpi-label">Entradas</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi-num" style="color:var(--viendo)">${viendo}</div>
      <div class="dash-kpi-label">Viendo</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi-num" style="color:var(--completado)">${completado}</div>
      <div class="dash-kpi-label">Completado</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi-num">
        ${horas.toLocaleString('es')}
        <span style="font-size:15px;font-weight:400;color:var(--muted)"> h</span>
      </div>
      <div class="dash-kpi-label">Horas estimadas</div>
    </div>
  `;
}

// ── Donut por estado ──────────────────────────────────────────────────────────

function renderDonut(porEstado) {
  const canvas = document.getElementById('donutEstado');
  const ctx    = canvas.getContext('2d');
  const total  = porEstado.reduce((s, e) => s + e.n, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (total === 0) return;

  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r  = Math.min(cx, cy) - 8;
  const ri = r * 0.58;
  let angle = -Math.PI / 2;

  for (const { estado, n } of porEstado) {
    const slice = (n / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = STATUS_COLOR[estado] || '#555';
    ctx.fill();
    angle += slice;
  }

  // Agujero interior
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.fillStyle = css('--s2') || '#1a1a2e';
  ctx.fill();

  // Total centrado
  ctx.fillStyle  = css('--text') || '#eeeef8';
  ctx.font       = `bold 20px system-ui`;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy);

  // Leyenda
  const legend = document.getElementById('donutLeyenda');
  legend.innerHTML = porEstado.map(({ estado, n }) => `
    <div class="dash-legend-item">
      <span class="dash-legend-dot" style="background:${STATUS_COLOR[estado]}"></span>
      <span class="dash-legend-label">${STATUS_LABEL[estado] || estado}</span>
      <span class="dash-legend-val">${n}</span>
    </div>
  `).join('');
}

// ── Barras por tag ────────────────────────────────────────────────────────────

function renderBarTags(tagStats) {
  const canvas = document.getElementById('barTags');
  if (!tagStats.length) return;

  const barH  = 22, gap = 7, labelW = 72, padR = 38;
  canvas.width  = canvas.parentElement.clientWidth || 260;
  canvas.height = tagStats.length * (barH + gap) + gap;

  const ctx  = canvas.getContext('2d');
  const barW = canvas.width - labelW - 8 - padR;
  const max  = Math.max(...tagStats.map(t => t.n), 1);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  tagStats.forEach((t, i) => {
    const y = gap + i * (barH + gap);
    const w = (t.n / max) * barW;

    // Fondo barra
    ctx.fillStyle = css('--s4') || '#2e2e48';
    ctx.beginPath();
    ctx.roundRect(labelW + 8, y, barW, barH, 4);
    ctx.fill();

    // Barra rellena
    ctx.fillStyle = css('--accent') || '#7c3aed';
    ctx.beginPath();
    ctx.roundRect(labelW + 8, y, Math.max(w, 4), barH, 4);
    ctx.fill();

    // Label
    ctx.fillStyle    = css('--muted') || '#7070a0';
    ctx.font         = '11px system-ui';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.nombre, labelW, y + barH / 2);

    // Número
    ctx.fillStyle = css('--text') || '#eeeef8';
    ctx.textAlign = 'left';
    ctx.fillText(t.n, labelW + 8 + w + 5, y + barH / 2);
  });
}

// ── En curso (viendo) ─────────────────────────────────────────────────────────

function renderViendo(items) {
  const el = document.getElementById('dashViendo');
  if (!items.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">Nada en curso.</p>';
    return;
  }
  el.innerHTML = items.map(c => {
    const tieneEntregas = c.total_entregas > 0;
    const pct = tieneEntregas
      ? (c.total_entregas ? Math.round(c.entregas_vistas / c.total_entregas * 100) : 0)
      : (c.episodios_totales ? Math.round(c.episodio_actual / c.episodios_totales * 100) : 0);
    const textoProgreso = tieneEntregas
      ? `${c.entregas_vistas}/${c.total_entregas} entregas`
      : c.episodios_totales ? `Ep. ${c.episodio_actual}/${c.episodios_totales}` : '';

    return `
      <div class="dash-viendo-item">
        <img class="dash-viendo-img" src="${escapeHtml(getImageSrc(c.imagen))}" alt="">
        <div class="dash-viendo-info">
          <div class="dash-viendo-titulo mq">${escapeHtml(c.titulo)}</div>
          ${textoProgreso ? `
            <div class="dash-viendo-progreso">
              <div class="dh-ep-bar" style="margin:4px 0 2px">
                <div class="dh-ep-fill" style="width:${pct}%"></div>
              </div>
              <span style="font-size:11px;color:var(--muted)">${textoProgreso}</span>
            </div>` : ''}
        </div>
        <span class="dash-viendo-pct">${pct > 0 ? pct + '%' : ''}</span>
      </div>`;
  }).join('');
}

// ── Actividad por mes ─────────────────────────────────────────────────────────

function renderActividad(meses) {
  const canvas = document.getElementById('barActividad');
  if (!meses.length) return;

  const barW  = 28, gap = 6, padB = 28;
  canvas.width  = meses.length * (barW + gap) + gap;
  canvas.height = canvas.parentElement.clientHeight || 100;

  const ctx    = canvas.getContext('2d');
  const max    = Math.max(...meses.map(m => m.n), 1);
  const areaH  = canvas.height - padB;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  meses.forEach((m, i) => {
    const x = gap + i * (barW + gap);
    const h = Math.max((m.n / max) * (areaH - 8), 4);
    const y = areaH - h;

    ctx.fillStyle = css('--s4') || '#2e2e48';
    ctx.beginPath();
    ctx.roundRect(x, 8, barW, areaH - 8, 4);
    ctx.fill();

    ctx.fillStyle = css('--accent') || '#7c3aed';
    ctx.beginPath();
    ctx.roundRect(x, y, barW, h, 4);
    ctx.fill();

    // Etiqueta mes (abreviada: "Ene", "Feb"...)
    const [, month] = m.mes.split('-');
    const abbr = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(month,10)-1] || m.mes;
    ctx.fillStyle    = css('--muted') || '#7070a0';
    ctx.font         = '10px system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(abbr, x + barW / 2, areaH + 4);
  });
}

// ── Actividad reciente ────────────────────────────────────────────────────────

const TIPO_ICON = {
  creado:          '✚',
  estado_cambio:   '↔',
  entrega_marcada: '✓',
};

function renderActividadReciente(eventos) {
  const el = document.getElementById('dashActividad');
  if (!el) return;
  if (!eventos.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">Sin actividad registrada.</p>';
    return;
  }
  el.innerHTML = eventos.map(e => {
    const icon  = TIPO_ICON[e.tipo] || '·';
    const fecha = e.fecha ? e.fecha.slice(0, 10) : '';
    return `
      <div class="dash-act-item">
        <span class="dash-act-icon">${icon}</span>
        <div class="dash-act-info">
          <span class="dash-act-titulo mq">${escapeHtml(e.titulo || '–')}</span>
          ${e.detalle ? `<span class="dash-act-detalle">${escapeHtml(e.detalle)}</span>` : ''}
        </div>
        <span class="dash-act-fecha">${fecha}</span>
      </div>`;
  }).join('');
}
