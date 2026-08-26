// Tipos de contenido: qué unidad usan, cuánto dura cada una, si cuentan como
// tiempo de visionado y cuáles se muestran en la interfaz.
//
// Hasta ahora el cálculo estaba incrustado en db.js con tres números sueltos
// (110 para película, 45 para serie, 24 para todo lo demás). Eso obligaba a que
// cualquier cosa que no fuera película o serie contase como anime, y por eso un
// manwa con 400 capítulos sumaba 160 horas de visionado que nadie ha visto.
//
// Módulo puro: sin SQLite ni Electron, para poder testear el cálculo y las
// reglas de visibilidad por separado.

// Reproduce exactamente el comportamiento anterior para los tres tipos que ya
// existían, y añade el que faltaba. `unidades_minimas` existe por las películas:
// una película sin episodios apuntados contaba igualmente como una unidad.
const TIPOS_SEMILLA = [
  { clave: 'anime',    nombre: 'Anime',    unidad: 'episodio', minutos_por_unidad: 24,  unidades_minimas: 0, cuenta_tiempo: 1, posicion: 1 },
  { clave: 'serie',    nombre: 'Serie',    unidad: 'episodio', minutos_por_unidad: 45,  unidades_minimas: 0, cuenta_tiempo: 1, posicion: 2 },
  { clave: 'pelicula', nombre: 'Película', unidad: 'episodio', minutos_por_unidad: 110, unidades_minimas: 1, cuenta_tiempo: 1, posicion: 3 },
  { clave: 'manwa',    nombre: 'Manwa',    unidad: 'capitulo', minutos_por_unidad: 0,   unidades_minimas: 0, cuenta_tiempo: 0, posicion: 4 },
];

// Si apareciera un `tipo` que no está en la tabla (dato viejo, importación de
// otra instalación), se trata como antes lo trataba la rama `else` de db.js:
// episodios de 24 minutos que sí cuentan. Así nada cambia por sorpresa.
const TIPO_DESCONOCIDO = {
  clave: '', nombre: '', unidad: 'episodio',
  minutos_por_unidad: 24, unidades_minimas: 0, cuenta_tiempo: 1,
};

/**
 * Unidades consumibles de una entrada: las de sus temporadas si las tiene, y si
 * no el total plano. Es la misma regla que ya aplicaba estadisticasGenerales.
 */
function unidadesDe(item) {
  const porEntregas = Number(item?.ep_entregas) || 0;
  return porEntregas > 0 ? porEntregas : (Number(item?.episodios_totales) || 0);
}

/**
 * Minutos de visionado que aporta una entrada. Cero si su tipo no cuenta.
 */
function minutosDe(item, tipo) {
  const t = tipo || TIPO_DESCONOCIDO;
  if (!t.cuenta_tiempo) return 0;

  const unidades = Math.max(unidadesDe(item), Number(t.unidades_minimas) || 0);
  return unidades * (Number(t.minutos_por_unidad) || 0);
}

/**
 * Suma el tiempo de una lista de entradas y, de paso, cuenta las que quedaron
 * fuera. El dashboard enseña ese número: descartar en silencio convertiría las
 * estadísticas en algo en lo que no se puede confiar.
 */
function resumirTiempo(items, tiposPorClave) {
  let minutos = 0;
  let excluidas = 0;
  const porTipo = {};

  for (const item of items || []) {
    const tipo = tiposPorClave?.[item.tipo] || TIPO_DESCONOCIDO;
    const m = minutosDe(item, tipo);

    if (!tipo.cuenta_tiempo) excluidas++;
    minutos += m;

    const clave = item.tipo || '(sin tipo)';
    porTipo[clave] = (porTipo[clave] || 0) + m;
  }

  return { minutos, excluidas, porTipo };
}

/**
 * ¿Se muestra este tipo? `visible` a 1 o 0 manda; a null decide el uso real.
 * Así un tipo sin entradas desaparece solo y reaparece al crear la primera,
 * sin obligar a configurar nada de antemano.
 */
function esVisible(tipo, conteo) {
  if (tipo?.visible === 1) return true;
  if (tipo?.visible === 0) return false;
  return (Number(conteo) || 0) > 0;
}

/**
 * Tipos que la interfaz debe ofrecer, en orden. `conteos` es {clave: nº}.
 */
function tiposVisibles(tipos, conteos = {}) {
  return (tipos || [])
    .filter(t => esVisible(t, conteos[t.clave]))
    .sort((a, b) => (a.posicion || 0) - (b.posicion || 0));
}

/**
 * Etiqueta de la unidad, para no escribir "episodios" en un manwa.
 */
function nombreUnidad(tipo, plural = true) {
  const u = tipo?.unidad === 'capitulo' ? 'capítulo' : 'episodio';
  return plural ? `${u}s` : u;
}

module.exports = {
  TIPOS_SEMILLA,
  TIPO_DESCONOCIDO,
  unidadesDe,
  minutosDe,
  resumirTiempo,
  esVisible,
  tiposVisibles,
  nombreUnidad,
};
