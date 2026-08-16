// Sincronización opcional de la biblioteca con Firestore.
//
// El proyecto de Firebase lo aporta el usuario: ni las claves ni la cuenta
// viven en el repositorio. Todo se guarda cifrado en userData/credenciales.json
// junto al Client ID de MyAnimeList.
//
// Corre en el proceso principal porque el renderer carga módulos ES planos sin
// bundler y no puede importar paquetes de npm; además así no hay que abrir la
// CSP a los dominios de Google.
//
// Autenticación por email/contraseña. Se descartó la anónima porque genera un
// UID distinto en cada dispositivo, que es justo lo contrario de sincronizar
// entre ordenadores, y Google OAuth porque exigiría abrir una ventana de
// navegador que main.js bloquea a propósito.

const os = require('os');
const credenciales = require('./credenciales');

const CLAVE_CONFIG   = 'firebase_config';
const CLAVE_EMAIL    = 'firebase_email';
const CLAVE_PASSWORD = 'firebase_password';

const TIMEOUT_MS = 30000;

class ErrorSync extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorSync';
    this.codigo = codigo;
  }
}

// Traduce los códigos del SDK a los nuestros, para que la UI pueda decir qué
// hacer en lugar de mostrar un "FirebaseError" en crudo.
function traducir(err) {
  const c = String(err?.code || '');
  if (c.includes('auth/invalid-credential') || c.includes('auth/wrong-password') ||
      c.includes('auth/user-not-found') || c.includes('auth/invalid-email')) {
    return new ErrorSync('auth-invalida', 'Email o contraseña incorrectos');
  }
  if (c.includes('auth/user-disabled')) {
    return new ErrorSync('auth-invalida', 'Esa cuenta está deshabilitada en Firebase');
  }
  if (c.includes('auth/network-request-failed') || c === 'unavailable') {
    return new ErrorSync('red', 'Sin conexión con Firebase');
  }
  if (c.includes('auth/api-key-not-valid') || c.includes('auth/invalid-api-key')) {
    return new ErrorSync('config-invalida', 'La apiKey de la configuración no es válida');
  }
  if (c === 'permission-denied') {
    return new ErrorSync('permiso-denegado',
      'Firestore rechazó la operación: revisa las reglas de seguridad del proyecto');
  }
  if (c === 'not-found') {
    return new ErrorSync('no-existe', 'No hay copia en la nube todavía');
  }
  return new ErrorSync('desconocido', err?.message || String(err));
}

function leerConfig() {
  const bruto = credenciales.leer(CLAVE_CONFIG);
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch { return null; }
}

function configurado() {
  return !!(leerConfig() && credenciales.leer(CLAVE_EMAIL) && credenciales.leer(CLAVE_PASSWORD));
}

function estado() {
  const cfg = leerConfig();
  return {
    configurado: configurado(),
    email:       credenciales.leer(CLAVE_EMAIL) || '',
    proyecto:    cfg?.projectId || '',
  };
}

// Una sola instancia de la app de Firebase por proceso; reconfigurar la destruye
// y la vuelve a crear.
let appFb = null;
let claveApp = '';

async function obtenerApp(config) {
  const { initializeApp, deleteApp, getApps } = require('firebase/app');
  const clave = JSON.stringify(config);

  if (appFb && claveApp === clave) return appFb;
  if (appFb) { try { await deleteApp(appFb); } catch { /* ya estaba fuera */ } appFb = null; }

  // Nombre propio para no chocar con una posible app por defecto.
  const nombre = 'listit-sync';
  for (const a of getApps()) {
    if (a.name === nombre) { try { await deleteApp(a); } catch { /* ignorar */ } }
  }
  appFb = initializeApp(config, nombre);
  claveApp = clave;
  return appFb;
}

async function conectar(configExplicita, emailExplicito, passwordExplicita) {
  const config   = configExplicita || leerConfig();
  const email    = emailExplicito  ?? credenciales.leer(CLAVE_EMAIL);
  const password = passwordExplicita ?? credenciales.leer(CLAVE_PASSWORD);

  if (!config || !email || !password) {
    throw new ErrorSync('sin-configurar', 'La sincronización no está configurada');
  }

  const { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword } = require('firebase/auth');
  const { initializeFirestore, getFirestore } = require('firebase/firestore');

  const fb = await obtenerApp(config);

  // En Node no hay almacenamiento del navegador: la sesión vive solo mientras
  // corre la app y se vuelve a iniciar sesión cuando hace falta.
  let auth;
  try {
    auth = initializeAuth(fb, { persistence: inMemoryPersistence });
  } catch {
    auth = require('firebase/auth').getAuth(fb);
  }

  let db;
  try {
    // Fuerza el transporte por long-polling: el WebChannel del SDK está pensado
    // para el navegador y en el proceso principal puede quedarse colgado.
    db = initializeFirestore(fb, { experimentalForceLongPolling: true });
  } catch {
    db = getFirestore(fb);
  }

  if (!auth.currentUser) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw traducir(err);
    }
  }

  return { auth, db, uid: auth.currentUser.uid };
}

function refDocumento(firestore, uid) {
  const { doc } = require('firebase/firestore');
  return doc(firestore, 'usuarios', uid, 'listit', 'snapshot');
}

function conLimite(promesa, mensaje) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new ErrorSync('red', mensaje)), TIMEOUT_MS)),
  ]);
}

/**
 * Valida configuración y credenciales haciendo un inicio de sesión y una
 * lectura real, y solo entonces las guarda. Más vale fallar aquí que en la
 * primera sincronización.
 */
async function configurar({ config, email, password }) {
  if (!config?.apiKey || !config?.projectId || !config?.appId) {
    throw new ErrorSync('config-invalida',
      'Faltan campos en la configuración: hacen falta apiKey, projectId y appId');
  }

  const { db, uid } = await conLimite(
    conectar(config, email, password),
    'Firebase no respondió al iniciar sesión',
  );

  // Lectura de prueba: verifica de paso que las reglas permiten el acceso.
  const { getDoc } = require('firebase/firestore');
  try {
    await conLimite(getDoc(refDocumento(db, uid)), 'Firestore no respondió a la lectura');
  } catch (err) {
    if (err instanceof ErrorSync) throw err;
    throw traducir(err);
  }

  credenciales.guardar(CLAVE_CONFIG, JSON.stringify(config));
  credenciales.guardar(CLAVE_EMAIL, email);
  credenciales.guardar(CLAVE_PASSWORD, password);
  return { uid, proyecto: config.projectId };
}

function desactivar() {
  credenciales.borrar(CLAVE_CONFIG);
  credenciales.borrar(CLAVE_EMAIL);
  credenciales.borrar(CLAVE_PASSWORD);
  return true;
}

/**
 * Sube la instantánea comprimida. `comprimido` es un Buffer de gzip.
 */
async function subir(comprimido, meta) {
  const { db, uid } = await conLimite(conectar(), 'Firebase no respondió al iniciar sesión');
  const { setDoc, Bytes, serverTimestamp } = require('firebase/firestore');

  try {
    await conLimite(
      setDoc(refDocumento(db, uid), {
        version:     meta.version,
        hash:        meta.hash,
        generado_en: meta.generado_en,
        dispositivo: meta.dispositivo || os.hostname(),
        bytes:       comprimido.length,
        comprimido:  'gzip',
        datos:       Bytes.fromUint8Array(new Uint8Array(comprimido)),
        actualizado: serverTimestamp(),
      }),
      'Firestore no respondió al subir',
    );
  } catch (err) {
    if (err instanceof ErrorSync) throw err;
    throw traducir(err);
  }
  return { uid, bytes: comprimido.length };
}

/**
 * Descarga la instantánea. Devuelve null si aún no hay ninguna.
 */
async function bajar() {
  const { db, uid } = await conLimite(conectar(), 'Firebase no respondió al iniciar sesión');
  const { getDoc } = require('firebase/firestore');

  let snap;
  try {
    snap = await conLimite(getDoc(refDocumento(db, uid)), 'Firestore no respondió al descargar');
  } catch (err) {
    if (err instanceof ErrorSync) throw err;
    throw traducir(err);
  }

  if (!snap.exists()) return null;
  const d = snap.data();
  if (!d?.datos) {
    throw new ErrorSync('corrupto', 'La copia en la nube no contiene datos');
  }

  return {
    version:     d.version,
    hash:        d.hash,
    generado_en: d.generado_en,
    dispositivo: d.dispositivo,
    bytes:       d.bytes,
    datos:       Buffer.from(d.datos.toUint8Array()),
  };
}

module.exports = {
  ErrorSync,
  configurado,
  estado,
  configurar,
  desactivar,
  subir,
  bajar,
};
