// Almacén local de credenciales (Client ID de MyAnimeList y, más adelante, la
// configuración de sincronización).
//
// Vive en un fichero propio dentro de userData, NO en la base de datos, y es
// deliberado: `exportarBd` (main.js) y `hacerBackupDiario` (lib/backup.js)
// copian el .db entero, así que cualquier credencial guardada en la tabla
// `settings` acabaría dentro de cada backup diario y de cada exportación que el
// usuario comparta. Aquí no ocurre.
//
// Se cifra con safeStorage de Electron, que en Windows delega en DPAPI y ata el
// contenido a la cuenta de usuario del sistema. Si el SO no ofrece cifrado
// (algunos Linux sin keyring), se guarda en claro y se deja constancia en el
// propio fichero para no dar una falsa sensación de seguridad.

const fs   = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const FICHERO = () => path.join(app.getPath('userData'), 'credenciales.json');

function leerFichero() {
  try {
    return JSON.parse(fs.readFileSync(FICHERO(), 'utf8'));
  } catch {
    // No existe, está corrupto o no es JSON: se parte de cero en lugar de
    // reventar el arranque de la app por una credencial ilegible.
    return { cifrado: false, valores: {} };
  }
}

function escribirFichero(datos) {
  fs.writeFileSync(FICHERO(), JSON.stringify(datos, null, 2), { mode: 0o600 });
}

function cifradoDisponible() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

/**
 * Devuelve el valor en claro, o null si no hay nada guardado.
 */
function leer(clave) {
  const datos = leerFichero();
  const guardado = datos.valores?.[clave];
  if (!guardado) return null;

  if (!datos.cifrado) return guardado;

  try {
    return safeStorage.decryptString(Buffer.from(guardado, 'base64'));
  } catch {
    // Cambió la cuenta de Windows, se copió el fichero a otra máquina o el
    // keyring ya no abre: la credencial es irrecuperable, no un error fatal.
    return null;
  }
}

function guardar(clave, valor) {
  const limpio = String(valor ?? '').trim();
  if (!limpio) return borrar(clave);

  const datos = leerFichero();
  const puedeCifrar = cifradoDisponible();

  // Si cambia el modo de cifrado hay que reescribir todo el fichero con el
  // nuevo modo; mezclar valores cifrados y en claro bajo un único flag daría
  // lecturas corruptas.
  if (datos.cifrado !== puedeCifrar) {
    const enClaro = {};
    for (const k of Object.keys(datos.valores || {})) enClaro[k] = leer(k);
    datos.valores = {};
    datos.cifrado = puedeCifrar;
    for (const [k, v] of Object.entries(enClaro)) {
      if (v == null) continue;
      datos.valores[k] = puedeCifrar
        ? safeStorage.encryptString(v).toString('base64')
        : v;
    }
  }

  datos.valores = datos.valores || {};
  datos.valores[clave] = puedeCifrar
    ? safeStorage.encryptString(limpio).toString('base64')
    : limpio;

  escribirFichero(datos);
  return true;
}

function borrar(clave) {
  const datos = leerFichero();
  if (datos.valores) delete datos.valores[clave];
  escribirFichero(datos);
  return true;
}

/**
 * ¿Hay credencial guardada? Se usa para informar al renderer sin exponer nunca
 * el valor: la UI solo necesita saber si está configurada o no.
 */
function existe(clave) {
  return leer(clave) !== null;
}

module.exports = { leer, guardar, borrar, existe, cifradoDisponible };
