// Caché de una pasada de actualización contra MyAnimeList.
//
// Existe porque los dos flujos que antes eran botones separados pedían las
// mismas fichas. Peor: `relaciones()` del cliente oficial descarga el detalle
// completo y descarta todo menos `relations`, así que recorrer una franquicia
// de seis temporadas traía seis fichas enteras y las tiraba — y después la
// sincronización masiva volvía a pedir esas mismas seis para guardar sus campos.
//
// Con una sola caché por pasada hay una única vía de descarga: quien necesite
// las relaciones lee el detalle ya cacheado.
//
// Vive solo mientras dura la pasada. No se persiste a propósito: los datos de
// MAL cambian y una caché entre ejecuciones daría fichas viejas justo en el
// botón cuyo trabajo es traer las nuevas.

/**
 * `obtener(clave, fn)` devuelve lo ya descargado o llama a `fn` y lo guarda.
 * Los contadores permiten enseñar cuánto se ahorró.
 */
export function crearCache() {
  const mapa = new Map();
  let aciertos = 0;
  let fallos = 0;

  return {
    async obtener(clave, fn) {
      if (mapa.has(clave)) {
        aciertos++;
        return mapa.get(clave);
      }
      fallos++;
      const valor = await fn();
      // Un fallo de red no se guarda: se reintentaría solo devolviendo null
      // para siempre durante el resto de la pasada.
      if (valor != null) mapa.set(clave, valor);
      return valor;
    },

    poner(clave, valor) {
      if (valor != null) mapa.set(clave, valor);
    },

    tiene(clave) {
      return mapa.has(clave);
    },

    /** Peticiones ahorradas y realizadas, para el resumen. */
    estadisticas() {
      return { aciertos, fallos, guardados: mapa.size };
    },
  };
}

/**
 * ¿Se comprobó esta serie hace poco?
 *
 * Una temporada nueva tarda meses o años en aparecer, así que no tiene sentido
 * recorrer la franquicia entera en cada pasada. Las fichas sí se refrescan
 * siempre: puntuaciones y estados de emisión cambian de semana en semana.
 *
 * Sin fecha previa devuelve false — nunca comprobada, toca mirarla.
 */
export function dentroDeVentana(ultimaISO, ahora, ventanaMs) {
  const ultima = Date.parse(ultimaISO) || 0;
  return (ahora - ultima) <= ventanaMs;
}
