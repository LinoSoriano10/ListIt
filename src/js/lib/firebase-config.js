// Lectura del bloque de configuración que la consola de Firebase entrega.
//
// Lo que se copia de ahí no es JSON, sino JavaScript:
//
//   const firebaseConfig = {
//     apiKey: "AIza...",
//     authDomain: "proyecto.firebaseapp.com",
//     ...
//   };
//
// Pedirle al usuario que lo convierta a JSON a mano sería una fuente de errores
// tonta, así que se acepta tal cual. Se extrae con expresiones regulares en vez
// de evaluarlo: es texto pegado de fuera y no hay motivo para ejecutarlo.

const CLAVES = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
  'databaseURL',
];

// Sin estas tres, Firebase no puede ni identificar el proyecto ni autenticar.
const OBLIGATORIAS = ['apiKey', 'projectId', 'appId'];

function soloClavesConocidas(objeto) {
  const salida = {};
  for (const k of CLAVES) {
    const v = objeto[k];
    if (typeof v === 'string' && v.trim()) salida[k] = v.trim();
  }
  return salida;
}

/**
 * Devuelve `{ config, faltan }`. `config` es null si no se reconoció nada.
 */
export function parsearConfigFirebase(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return { config: null, faltan: OBLIGATORIAS };

  let config = null;

  // Caso fácil: ya es JSON válido.
  try {
    const o = JSON.parse(bruto);
    if (o && typeof o === 'object' && !Array.isArray(o)) config = soloClavesConocidas(o);
  } catch {
    /* no era JSON: se intenta como objeto de JavaScript */
  }

  if (!config || Object.keys(config).length === 0) {
    const extraido = {};
    for (const k of CLAVES) {
      // clave: "valor"  /  "clave": 'valor'
      const m = new RegExp(`["']?${k}["']?\\s*:\\s*["\`']([^"\`']+)["\`']`).exec(bruto);
      if (m) extraido[k] = m[1].trim();
    }
    config = Object.keys(extraido).length > 0 ? extraido : null;
  }

  if (!config) return { config: null, faltan: OBLIGATORIAS };

  const faltan = OBLIGATORIAS.filter(k => !config[k]);
  return { config: faltan.length === 0 ? config : null, faltan };
}
