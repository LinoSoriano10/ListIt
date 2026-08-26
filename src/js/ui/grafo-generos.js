// Grafo de géneros: dibujo e interacción sobre Canvas 2D.
//
// La física vive aparte, en lib/grafo-fuerzas.js, y aquí solo se proyecta y se
// pinta. Esa separación es a propósito: pasar a una vista 3D sería cambiar la
// proyección de este fichero y añadir un eje z al otro, sin tocar los datos ni
// la interacción.
//
// Se dibuja a mano porque no hay bundler y la CSP es `script-src 'self'`, así
// que no se puede cargar una librería de grafos. Tampoco hace falta: el resto
// del dashboard ya está hecho con Canvas 2D y esto sigue el mismo idioma.
//
// Con 295 series y ~40 géneros a la vez no se leería nada, así que por defecto
// solo se muestran los géneros y, al pulsar uno, sus series.

import { api } from '../api.js';
import { escapeHtml } from '../lib/escape.js';
import { mostrarDetalle } from './detail.js';
import { crearSimulacion, estabilizar, nodoEn, encuadrar } from '../lib/grafo-fuerzas.js';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

let datos = null;          // { generos, series, enlaces }
let sim = null;
let vista = null;          // { escala, dx, dy }
let generoActivo = null;   // id del género desplegado, o null
let hover = null;

const ALTO_LIENZO = 580;
const RADIO_GENERO_MIN = 15;
const RADIO_GENERO_MAX = 36;
const RADIO_SERIE = 7;

export async function cargarGrafoGeneros() {
  const canvas = document.getElementById('grafoGeneros');
  if (!canvas) return;

  datos = await api.grafoGeneros();

  const aviso = document.getElementById('grafoVacio');
  const hay = datos.generos.length > 0;
  canvas.style.display = hay ? '' : 'none';
  document.getElementById('grafoLeyenda').style.display = hay ? '' : 'none';
  if (aviso) {
    aviso.style.display = hay ? 'none' : '';
    aviso.textContent = 'Todavía no hay géneros guardados. Lanza «Sincronizar desde MAL» '
      + 'y volverán con cada entrada.';
  }
  if (!hay) return;

  generoActivo = null;
  construir(canvas);
  instalarEventos(canvas);
}

function construir(canvas) {
  const ancho = canvas.parentElement.clientWidth || 640;
  const alto  = ALTO_LIENZO;
  canvas.width  = ancho;
  canvas.height = alto;

  const nodos = datos.generos.map(g => ({ id: `g:${g.id}`, tipo: 'genero', nombre: g.nombre, n: g.n }));
  const enlaces = [];

  if (generoActivo != null) {
    // Solo las series del género desplegado, para que se pueda leer algo.
    const idsSerie = new Set(
      datos.enlaces.filter(e => e.genero_id === generoActivo).map(e => e.contenido_id)
    );
    const porId = new Map(datos.series.map(s => [s.id, s]));
    for (const id of idsSerie) {
      const s = porId.get(id);
      if (s) nodos.push({ id: `s:${id}`, tipo: 'serie', nombre: s.titulo, estado: s.estado, serieId: id });
    }
    // Se conservan los enlaces de esas series a TODOS sus géneros: así se ve de
    // un vistazo qué comparten con los demás, que es la gracia del grafo.
    for (const e of datos.enlaces) {
      if (idsSerie.has(e.contenido_id)) {
        enlaces.push({ origen: `s:${e.contenido_id}`, destino: `g:${e.genero_id}` });
      }
    }
  } else {
    // Vista general: géneros unidos si comparten series, con el grosor según
    // cuántas comparten.
    const comunes = new Map();
    const porSerie = new Map();
    for (const e of datos.enlaces) {
      if (!porSerie.has(e.contenido_id)) porSerie.set(e.contenido_id, []);
      porSerie.get(e.contenido_id).push(e.genero_id);
    }
    for (const gs of porSerie.values()) {
      for (let i = 0; i < gs.length; i++) {
        for (let j = i + 1; j < gs.length; j++) {
          const clave = gs[i] < gs[j] ? `${gs[i]}|${gs[j]}` : `${gs[j]}|${gs[i]}`;
          comunes.set(clave, (comunes.get(clave) || 0) + 1);
        }
      }
    }
    // Solo los pares con peso suficiente: si no, el grafo es una maraña.
    const umbral = Math.max(2, Math.round(datos.series.length / 60));
    for (const [clave, peso] of comunes) {
      if (peso < umbral) continue;
      const [a, b] = clave.split('|');
      enlaces.push({ origen: `g:${a}`, destino: `g:${b}`, peso });
    }
  }

  sim = crearSimulacion({ nodos, enlaces, ancho, alto, semilla: 1234 });
  estabilizar(sim, 700);
  vista = encuadrar(sim, 62);
  dibujar(canvas);
}

function radioDe(n) {
  if (n.tipo !== 'genero') return RADIO_SERIE;
  const max = Math.max(...datos.generos.map(g => g.n), 1);
  return RADIO_GENERO_MIN + (n.n / max) * (RADIO_GENERO_MAX - RADIO_GENERO_MIN);
}

const proyectar = n => ({ x: n.x * vista.escala + vista.dx, y: n.y * vista.escala + vista.dy });

function dibujar(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Aristas primero, para que los nodos queden encima.
  ctx.lineWidth = 1;
  for (const e of sim.aristas) {
    const a = proyectar(sim.porId.get(e.origen));
    const b = proyectar(sim.porId.get(e.destino));
    const resaltada = hover && (e.origen === hover.id || e.destino === hover.id);
    ctx.strokeStyle = resaltada ? (css('--accent2') || '#a855f7') : (css('--border2') || '#38385a');
    ctx.lineWidth = resaltada ? 2 : Math.min(1 + (e.peso || 0) / 8, 3);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const n of sim.nodos) {
    const p = proyectar(n);
    const r = radioDe(n) * (n.tipo === 'genero' ? Math.min(vista.escala, 1) : 1);
    const esHover = hover && hover.id === n.id;

    if (n.tipo === 'genero') {
      const activo = generoActivo != null && n.id === `g:${generoActivo}`;
      const radio = Math.max(r, 10);

      ctx.fillStyle = activo ? (css('--accent2') || '#a855f7') : (css('--accent') || '#7c3aed');
      ctx.beginPath();
      ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
      ctx.fill();

      if (esHover || activo) {
        ctx.strokeStyle = css('--text') || '#eeeef8';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Cuántas entradas tiene, dentro del círculo: hace explícito lo que ya
      // dice el tamaño y evita tener que pasar el ratón para saberlo.
      if (radio >= 15) {
        ctx.fillStyle    = '#fff';
        ctx.font         = `bold ${Math.round(radio * 0.62)}px system-ui`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.n, p.x, p.y);
      }

      // El nombre va sobre una banda del color del fondo para que no se pierda
      // entre las aristas que pasan por detrás.
      ctx.font = 'bold 12px system-ui';
      const anchoTexto = ctx.measureText(n.nombre).width;
      ctx.fillStyle = css('--surface') || '#111120';
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.roundRect(p.x - anchoTexto / 2 - 5, p.y + radio + 4, anchoTexto + 10, 16, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle    = css('--text') || '#eeeef8';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.nombre, p.x, p.y + radio + 12);
    } else {
      // Azul, para que las series destaquen frente al morado de los géneros.
      // En gris se confundían con las aristas.
      const azul = css('--grafo-serie') || '#38bdf8';
      ctx.fillStyle = azul;
      ctx.beginPath();
      ctx.arc(p.x, p.y, esHover ? r + 3 : r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = esHover ? (css('--text') || '#eeeef8') : (css('--surface') || '#111120');
      ctx.lineWidth = esHover ? 2.5 : 1.5;
      ctx.stroke();
    }
  }

  // Emergente del nodo bajo el cursor, encima de todo lo demás.
  if (hover) {
    const p = proyectar(hover);
    const texto = hover.tipo === 'serie'
      ? hover.nombre
      : `${hover.nombre} · ${hover.n} ${hover.n === 1 ? 'entrada' : 'entradas'}`;

    ctx.font = '12px system-ui';
    const w = ctx.measureText(texto).width + 14;
    const alturaNodo = radioDe(hover) * (hover.tipo === 'genero' ? Math.min(vista.escala, 1) : 1);
    const y = p.y - Math.max(alturaNodo, 10) - 24;

    ctx.fillStyle = css('--s4') || '#2e2e48';
    ctx.beginPath();
    ctx.roundRect(Math.min(Math.max(p.x - w / 2, 2), canvas.width - w - 2), y, w, 21, 5);
    ctx.fill();

    ctx.fillStyle    = css('--text') || '#eeeef8';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, Math.min(Math.max(p.x, w / 2 + 2), canvas.width - w / 2 - 2), y + 11);
  }
}

// Coordenadas del ratón traducidas al espacio de la simulación.
function aEspacioSim(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  return { x: (x - vista.dx) / vista.escala, y: (y - vista.dy) / vista.escala };
}

let eventosInstalados = false;

function instalarEventos(canvas) {
  actualizarLeyenda();
  if (eventosInstalados) return;
  eventosInstalados = true;

  canvas.addEventListener('mousemove', ev => {
    if (!sim) return;
    const p = aEspacioSim(canvas, ev);
    const n = nodoEn(sim, p.x, p.y, x => radioDe(x) + 4);
    if (n !== hover) {
      hover = n;
      canvas.style.cursor = n ? 'pointer' : 'default';
      dibujar(canvas);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (hover) { hover = null; dibujar(canvas); }
  });

  canvas.addEventListener('click', ev => {
    if (!sim) return;
    const p = aEspacioSim(canvas, ev);
    const n = nodoEn(sim, p.x, p.y, x => radioDe(x) + 4);
    if (!n) return;

    if (n.tipo === 'serie') {
      mostrarDetalle(n.serieId);
      return;
    }
    // Pulsar el género desplegado lo repliega.
    const id = Number(n.id.slice(2));
    generoActivo = generoActivo === id ? null : id;
    hover = null;
    construir(canvas);
    actualizarLeyenda();
  });

  document.getElementById('grafoVolver')?.addEventListener('click', () => {
    generoActivo = null;
    hover = null;
    construir(canvas);
    actualizarLeyenda();
  });
}

function actualizarLeyenda() {
  const el = document.getElementById('grafoLeyenda');
  const volver = document.getElementById('grafoVolver');
  if (!el) return;

  if (generoActivo == null) {
    el.innerHTML = `
      <b>Pulsa un género para ver sus series.</b><br>
      <span class="grafo-clave"><i class="grafo-punto grafo-punto--genero"></i>Género</span>
      El número es cuántas entradas tiene, y el círculo crece con él.
      Una línea entre dos géneros significa que comparten series.`;
    if (volver) volver.style.display = 'none';
  } else {
    const g = datos.generos.find(x => x.id === generoActivo);
    el.innerHTML = `
      <b>${escapeHtml(g?.nombre || '')}</b> · ${g?.n || 0} entradas<br>
      <span class="grafo-clave"><i class="grafo-punto grafo-punto--serie"></i>Serie</span>
      Pasa el ratón para ver el título y pulsa para abrir su ficha.
      Las líneas hacia otros géneros son los que también tiene.`;
    if (volver) volver.style.display = '';
  }
}
