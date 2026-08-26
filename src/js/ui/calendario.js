// Vista de calendario semanal.
//
// Responde a "¿qué sale esta semana y qué me falta por ver?". Los datos son el
// calendario de emisión que el proceso principal trae de AniList y guarda en
// local, así que la vista funciona aunque no haya conexión: se verá lo último
// que se descargó en lugar de nada.

import { api } from '../api.js';
import { escapeHtml } from '../lib/escape.js';
import { getImageSrc } from '../lib/image.js';
import { mostrarDetalle } from './detail.js';
import { toast } from '../lib/toast.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Desplazamiento en semanas respecto a la actual. 0 = esta semana.
let semanaOffset = 0;

/**
 * Lunes a las 00:00 de la semana desplazada `offset` semanas, en hora local.
 */
function lunesDe(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // getDay() da 0 para domingo; se traslada a una semana que empieza en lunes.
  const desdeLunes = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desdeLunes + offset * 7);
  return d;
}

function rangoSemana(offset) {
  const inicio = lunesDe(offset);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7);
  return { inicio, fin };
}

function etiquetaRango({ inicio, fin }) {
  const ultimo = new Date(fin);
  ultimo.setDate(ultimo.getDate() - 1);
  const fmt = (d, conAnio) => d.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}),
  });
  return `${fmt(inicio, false)} – ${fmt(ultimo, true)}`;
}

function horaDe(fechaUtc) {
  return new Date(fechaUtc * 1000).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit',
  });
}

export async function cargarCalendario() {
  const cont = document.getElementById('calendarioGrid');
  const lbl  = document.getElementById('calendarioRango');
  if (!cont) return;

  const rango = rangoSemana(semanaOffset);
  lbl.textContent = etiquetaRango(rango);
  document.getElementById('calendarioHoy').style.display = semanaOffset === 0 ? 'none' : '';

  const desde = Math.floor(rango.inicio.getTime() / 1000);
  const hasta = Math.floor(rango.fin.getTime() / 1000);
  const filas = await api.calendarioObtener(desde, hasta);

  // Reparto por día de la semana, en hora local.
  const porDia = Array.from({ length: 7 }, () => []);
  for (const f of filas) {
    const d = new Date(f.fecha_utc * 1000);
    porDia[(d.getDay() + 6) % 7].push(f);
  }

  const ahora = Math.floor(Date.now() / 1000);
  const hoyIdx = semanaOffset === 0 ? (new Date().getDay() + 6) % 7 : -1;

  cont.innerHTML = DIAS.map((nombre, i) => {
    const dia = new Date(rango.inicio);
    dia.setDate(dia.getDate() + i);

    const items = porDia[i].sort((a, b) => a.fecha_utc - b.fecha_utc);
    const cuerpo = items.length === 0
      ? '<div class="cal-vacio">Sin emisiones</div>'
      : items.map(f => tarjeta(f, ahora)).join('');

    return `
      <div class="cal-dia${i === hoyIdx ? ' cal-dia--hoy' : ''}">
        <div class="cal-dia-cab">
          <span class="cal-dia-nombre">${nombre}</span>
          <span class="cal-dia-num">${dia.getDate()}</span>
        </div>
        <div class="cal-dia-cuerpo">${cuerpo}</div>
      </div>`;
  }).join('');

  cont.querySelectorAll('.cal-item').forEach(el => {
    el.addEventListener('click', () => mostrarDetalle(Number(el.dataset.id)));
  });
}

function tarjeta(f, ahora) {
  const emitido = f.fecha_utc <= ahora;
  // `vistos` es el progreso de ESA temporada, y el episodio también va numerado
  // dentro de ella, así que la comparación es directa.
  const atrasado = emitido && f.episodio > (f.vistos || 0);

  let marca = '';
  if (!emitido)      marca = '<span class="cal-marca cal-marca--proximo">próximo</span>';
  else if (atrasado) marca = '<span class="cal-marca cal-marca--pendiente">sin ver</span>';

  // La temporada solo se enseña si aporta algo: en una serie de una sola
  // temporada, un "T1" en cada tarjeta es ruido.
  const temporada = f.temporada && f.temporada !== 'T1'
    ? `<span class="cal-item-temp">${escapeHtml(f.temporada)}</span> ` : '';

  const detalle = `${f.titulo}${f.temporada ? ' · ' + f.temporada : ''} · episodio ${f.episodio}`
    + (atrasado ? ` (vas por el ${f.vistos || 0})` : '');

  return `
    <div class="cal-item${atrasado ? ' cal-item--atrasado' : ''}" data-id="${f.contenido_id}"
         title="${escapeHtml(detalle)}">
      <img class="cal-item-img" src="${escapeHtml(getImageSrc(f.imagen))}" alt="">
      <div class="cal-item-info">
        <div class="cal-item-tit">${escapeHtml(f.titulo)}</div>
        <div class="cal-item-meta">${temporada}ep ${f.episodio} · ${horaDe(f.fecha_utc)} ${marca}</div>
      </div>
    </div>`;
}

export function semanaAnterior()  { semanaOffset--; return cargarCalendario(); }
export function semanaSiguiente() { semanaOffset++; return cargarCalendario(); }
export function semanaActual()    { semanaOffset = 0; return cargarCalendario(); }

/**
 * Pide a AniList el calendario actualizado. Es explícito porque habla con un
 * servicio externo; el arranque ya hace un refresco silencioso.
 */
export async function refrescarCalendario() {
  const btn = document.getElementById('calendarioRefrescar');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }

  const r = await api.calendarioRefrescar();

  if (btn) { btn.disabled = false; btn.textContent = '↻ Actualizar'; }

  if (r.ok) {
    if (r.series === 0) {
      toast.info('No sigues ninguna serie en emisión ahora mismo');
    } else {
      toast.success(`${r.episodios} episodios · ${r.temporadas} temporadas de ${r.series} series`);
    }
  } else if (r.codigo === 'desactivada') {
    // AniList apaga su API a veces. Se sigue mostrando lo ya guardado.
    toast.error('AniList tiene su API desactivada. Se muestra el último calendario descargado.');
  } else {
    toast.error(r.mensaje || 'No se pudo actualizar el calendario');
  }
  await cargarCalendario();
}
