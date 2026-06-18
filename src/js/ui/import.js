import { state } from '../state.js';
import { api } from '../api.js';
import { STATUS_COLOR } from '../lib/colors.js';
import { escapeHtml } from '../lib/escape.js';
import { parsearXML } from '../lib/xml-parser.js';
import { cargarContenido } from './content.js';

const PLANTILLA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Formato de importación ListIt
  Campo obligatorio: <titulo>
  Todos los demás son opcionales.

  tipo:   anime | pelicula | serie
  estado: pendiente | viendo | completado | en_pausa | abandonado
  visto (en entrega): 1 = visto, 0 = no visto
-->
<listit>

  <!-- Ejemplo completo: anime con temporadas -->
  <entrada>
    <titulo>Attack on Titan</titulo>
    <tipo>anime</tipo>
    <estado>completado</estado>
    <anio>2013</anio>
    <descripcion>La humanidad vive encerrada tras enormes murallas que la protegen de los Titanes.</descripcion>
    <imagen>https://cdn.myanimelist.net/images/anime/10/47347.jpg</imagen>
    <episodio_actual>87</episodio_actual>
    <episodios_totales>87</episodios_totales>
    <entregas>
      <entrega>
        <numero>S1</numero>
        <titulo>Temporada 1</titulo>
        <visto>1</visto>
        <episodio_actual>25</episodio_actual>
        <episodios_totales>25</episodios_totales>
      </entrega>
      <entrega>
        <numero>S2</numero>
        <titulo>Temporada 2</titulo>
        <visto>1</visto>
        <episodio_actual>12</episodio_actual>
        <episodios_totales>12</episodios_totales>
      </entrega>
      <entrega>
        <numero>Final Season</numero>
        <titulo>Temporada Final</titulo>
        <visto>0</visto>
        <episodios_totales>28</episodios_totales>
      </entrega>
    </entregas>
  </entrada>

  <!-- Ejemplo: saga de películas -->
  <entrada>
    <titulo>Toy Story</titulo>
    <tipo>pelicula</tipo>
    <estado>viendo</estado>
    <anio>1995</anio>
    <entregas>
      <entrega>
        <numero>1</numero>
        <titulo>Toy Story</titulo>
        <visto>1</visto>
      </entrega>
      <entrega>
        <numero>2</numero>
        <titulo>Toy Story 2</titulo>
        <visto>1</visto>
      </entrega>
      <entrega>
        <numero>3</numero>
        <titulo>Toy Story 3</titulo>
        <visto>0</visto>
      </entrega>
    </entregas>
  </entrada>

  <!-- Ejemplo mínimo: solo título -->
  <entrada>
    <titulo>Breaking Bad</titulo>
  </entrada>

</listit>`;

export function abrirImport() {
  state.xmlParseado = [];
  document.getElementById('importStep1').style.display = '';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'none';
  document.getElementById('importTitle').textContent   = 'Importar desde XML';
  document.getElementById('importFooter').innerHTML    =
    '<button class="btn-secondary" id="btnCancelarImport">Cancelar</button>';
  document.getElementById('btnCancelarImport').onclick = cerrarImport;
  document.getElementById('modalImport').style.display = 'flex';
}

export function cerrarImport() {
  document.getElementById('modalImport').style.display = 'none';
}

function mostrarPrevisualizacion(entradas, fileName) {
  state.xmlParseado = entradas;

  document.getElementById('importStep1').style.display = 'none';
  document.getElementById('importStep2').style.display = '';

  document.getElementById('importFileName').textContent = fileName;
  document.getElementById('importPreviewHeader').textContent =
    `${entradas.length} entrada${entradas.length !== 1 ? 's' : ''} encontrada${entradas.length !== 1 ? 's' : ''}`;

  const lista = document.getElementById('importPreviewList');
  lista.innerHTML = entradas.map(({ contenido, entregas }) => {
    const metaParts = [contenido.tipo || 'sin tipo'];
    if (entregas.length) metaParts.push(`${entregas.length} entregas`);
    return `
      <div class="import-preview-item">
        <span class="sdot" style="background:${STATUS_COLOR[contenido.estado]}"></span>
        <span class="ipi-titulo">${escapeHtml(contenido.titulo)}</span>
        <span class="ipi-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </div>`;
  }).join('');

  document.getElementById('importFooter').innerHTML = `
    <button class="btn-secondary" id="btnCancelarImport2">Cancelar</button>
    <button class="btn-primary"   id="btnConfirmarImport">
      Importar (${entradas.length})
    </button>`;
  document.getElementById('btnCancelarImport2').onclick = cerrarImport;
  document.getElementById('btnConfirmarImport').onclick = ejecutarImport;
}

async function ejecutarImport() {
  document.getElementById('btnConfirmarImport').disabled    = true;
  document.getElementById('btnConfirmarImport').textContent = 'Importando...';

  let ok = 0, errores = 0;
  const fallos = [];

  for (const { contenido, entregas } of state.xmlParseado) {
    try {
      await api.importarEntradaCompleta({
        contenido,
        entregas,
        tipo: contenido.tipo || null,
      });
      ok++;
    } catch (e) {
      errores++;
      fallos.push(contenido.titulo);
      console.error('Import error:', contenido.titulo, e);
    }
  }

  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = '';
  document.getElementById('importTitle').textContent   = 'Resultado de la importación';

  document.getElementById('importResult').innerHTML = `
    <div class="import-result-row import-result-ok">
      <span class="import-result-num">${ok}</span>
      <span>entrada${ok !== 1 ? 's' : ''} importada${ok !== 1 ? 's' : ''} correctamente</span>
    </div>
    ${errores > 0 ? `
    <div class="import-result-row import-result-err">
      <span class="import-result-num">${errores}</span>
      <span>con error: ${fallos.join(', ')}</span>
    </div>` : ''}
  `;

  document.getElementById('importFooter').innerHTML =
    '<button class="btn-primary" id="btnCerrarImportFin">Cerrar</button>';
  document.getElementById('btnCerrarImportFin').onclick = () => {
    cerrarImport();
    cargarContenido();
  };
}

export async function manejarPickXml() {
  const xmlStr = await api.seleccionarXml();
  if (!xmlStr) return;

  try {
    const entradas = parsearXML(xmlStr);
    if (entradas.length === 0) {
      alert('No se encontraron entradas válidas en el archivo.\nAsegúrate de que cada <entrada> tenga al menos un <titulo>.');
      return;
    }
    mostrarPrevisualizacion(entradas, 'archivo.xml');
  } catch (e) {
    alert('Error al leer el XML:\n' + e.message);
  }
}

export async function descargarPlantilla() {
  await api.guardarPlantillaXml(PLANTILLA_XML);
}
