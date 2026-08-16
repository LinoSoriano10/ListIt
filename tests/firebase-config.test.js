import { describe, it, expect } from 'vitest';
import { parsearConfigFirebase } from '../src/js/lib/firebase-config.js';

// Lo que la consola de Firebase da tal cual al elegir "Web app".
const PEGADO_CONSOLA = `
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyD-ejemplo-1234567890abcdefg",
  authDomain: "listit-demo.firebaseapp.com",
  projectId: "listit-demo",
  storageBucket: "listit-demo.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};

const app = initializeApp(firebaseConfig);
`;

describe('parsearConfigFirebase', () => {
  it('acepta el bloque pegado de la consola tal cual', () => {
    const { config, faltan } = parsearConfigFirebase(PEGADO_CONSOLA);
    expect(faltan).toEqual([]);
    expect(config.apiKey).toBe('AIzaSyD-ejemplo-1234567890abcdefg');
    expect(config.projectId).toBe('listit-demo');
    expect(config.appId).toBe('1:123456789012:web:abc123def456');
    expect(config.authDomain).toBe('listit-demo.firebaseapp.com');
  });

  it('acepta JSON estricto', () => {
    const { config } = parsearConfigFirebase(JSON.stringify({
      apiKey: 'k', projectId: 'p', appId: 'a', authDomain: 'd',
    }));
    expect(config).toEqual({ apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' });
  });

  it('acepta solo el objeto, sin el "const"', () => {
    const { config } = parsearConfigFirebase(`{
      apiKey: 'k1', projectId: 'p1', appId: 'a1'
    }`);
    expect(config.apiKey).toBe('k1');
    expect(config.projectId).toBe('p1');
  });

  it('admite comillas simples, dobles y con espacios raros', () => {
    const { config } = parsearConfigFirebase(`apiKey  :   "k"
      'projectId':'p'
      "appId"  :  'a'`);
    expect(config).toEqual({ apiKey: 'k', projectId: 'p', appId: 'a' });
  });

  it('descarta claves que no son de Firebase', () => {
    const { config } = parsearConfigFirebase(`{
      apiKey: "k", projectId: "p", appId: "a",
      password: "no-deberia-colarse", token: "tampoco"
    }`);
    expect(config).not.toHaveProperty('password');
    expect(config).not.toHaveProperty('token');
    expect(Object.keys(config).sort()).toEqual(['apiKey', 'appId', 'projectId']);
  });

  it('informa de qué campos obligatorios faltan', () => {
    const { config, faltan } = parsearConfigFirebase(`{ apiKey: "k", authDomain: "d" }`);
    expect(config).toBeNull();
    expect(faltan).toEqual(['projectId', 'appId']);
  });

  it('con texto vacío o sin sentido no revienta', () => {
    expect(parsearConfigFirebase('').config).toBeNull();
    expect(parsearConfigFirebase(null).config).toBeNull();
    expect(parsearConfigFirebase('hola qué tal').config).toBeNull();
    expect(parsearConfigFirebase('[1,2,3]').config).toBeNull();
  });

  it('no ejecuta el texto pegado', () => {
    // Si esto se evaluara, lanzaría. Debe limitarse a no reconocer nada.
    const veneno = '{ apiKey: (() => { throw new Error("ejecutado"); })() }';
    expect(() => parsearConfigFirebase(veneno)).not.toThrow();
    expect(parsearConfigFirebase(veneno).config).toBeNull();
  });
});
