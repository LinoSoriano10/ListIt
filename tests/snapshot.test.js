import { describe, it, expect } from 'vitest';
import {
  VERSION,
  TABLAS,
  ORDEN_INSERCION,
  ORDEN_BORRADO,
  construir,
  validar,
  hash,
  comprimir,
  descomprimir,
  cabeEnFirestore,
} from '../lib/snapshot.js';

function biblioteca(extra = {}) {
  return construir({
    contenido: [
      { id: 1, titulo: 'Steins;Gate', tipo: 'anime', estado: 'completado', mal_id: 9253 },
      { id: 2, titulo: 'One Piece',   tipo: 'anime', estado: 'viendo',     mal_id: 21 },
    ],
    tags: [{ id: 1, nombre: 'pelicula' }, { id: 2, nombre: 'favorito' }],
    entregas: [
      { id: 10, contenido_id: 1, numero: 'T1', titulo: '', visto: 1 },
      { id: 11, contenido_id: 2, numero: 'T1', titulo: '', visto: 0 },
    ],
    contenido_tags:    [{ contenido_id: 1, tag_id: 2 }],
    contenido_nombres: [{ id: 5, contenido_id: 1, nombre: 'STEINS;GATE' }],
    actividad:         [{ id: 3, contenido_id: 1, tipo: 'creado', detalle: 'Steins;Gate' }],
    ...extra,
  });
}

describe('estructura', () => {
  it('settings NO se sincroniza', () => {
    // Mezcla preferencias locales con marcas de migración de esta instalación.
    expect(TABLAS).not.toContain('settings');
  });

  it('las tablas padre se insertan antes que quienes las referencian', () => {
    expect(ORDEN_INSERCION.indexOf('contenido')).toBeLessThan(ORDEN_INSERCION.indexOf('entregas'));
    expect(ORDEN_INSERCION.indexOf('contenido')).toBeLessThan(ORDEN_INSERCION.indexOf('contenido_tags'));
    expect(ORDEN_INSERCION.indexOf('tags')).toBeLessThan(ORDEN_INSERCION.indexOf('contenido_tags'));
    expect(ORDEN_INSERCION.indexOf('contenido')).toBeLessThan(ORDEN_INSERCION.indexOf('contenido_nombres'));
  });

  it('el borrado es exactamente el orden inverso', () => {
    expect(ORDEN_BORRADO).toEqual([...ORDEN_INSERCION].reverse());
  });

  it('inserción y borrado cubren todas las tablas', () => {
    expect([...ORDEN_INSERCION].sort()).toEqual([...TABLAS].sort());
  });
});

describe('construir', () => {
  it('rellena todas las tablas aunque falten en la entrada', () => {
    const s = construir({ contenido: [{ id: 1 }] });
    expect(s.version).toBe(VERSION);
    for (const t of TABLAS) expect(Array.isArray(s.tablas[t])).toBe(true);
    expect(s.tablas.entregas).toEqual([]);
  });

  it('incluye fecha de generación y dispositivo', () => {
    const s = construir({}, { dispositivo: 'PC-SALON' });
    expect(s.dispositivo).toBe('PC-SALON');
    expect(Date.parse(s.generado_en)).not.toBeNaN();
  });
});

describe('validar', () => {
  it('una biblioteca coherente no da problemas', () => {
    expect(validar(biblioteca())).toEqual([]);
  });

  it('rechaza versión desconocida', () => {
    const s = biblioteca();
    s.version = 99;
    expect(validar(s)[0]).toMatch(/Versión/);
  });

  it('rechaza tablas ausentes o con tipo incorrecto', () => {
    const s = biblioteca();
    delete s.tablas.entregas;
    expect(validar(s).some(f => f.includes('entregas'))).toBe(true);
  });

  it('detecta entregas huérfanas antes de tocar la BD', () => {
    const s = biblioteca();
    s.tablas.entregas.push({ id: 12, contenido_id: 999, numero: 'T1' });
    expect(validar(s).some(f => f.includes('series inexistentes'))).toBe(true);
  });

  it('detecta relaciones de etiqueta rotas', () => {
    const s = biblioteca();
    s.tablas.contenido_tags.push({ contenido_id: 1, tag_id: 999 });
    expect(validar(s).some(f => f.includes('referencias rotas'))).toBe(true);
  });

  it('no exige que la actividad apunte a series existentes', () => {
    // actividad.contenido_id no tiene clave foránea: la app conserva el
    // histórico de entradas ya borradas.
    const s = biblioteca();
    s.tablas.actividad.push({ id: 4, contenido_id: 999, tipo: 'creado' });
    expect(validar(s)).toEqual([]);
  });

  it('rechaza cualquier cosa que no sea un documento', () => {
    expect(validar(null).length).toBeGreaterThan(0);
    expect(validar({}).length).toBeGreaterThan(0);
  });
});

describe('hash', () => {
  it('los mismos datos dan el mismo hash', () => {
    expect(hash(biblioteca())).toBe(hash(biblioteca()));
  });

  it('ignora fecha de generación y dispositivo', () => {
    // Si no los ignorara, cada arranque parecería un cambio y la app subiría
    // sin parar.
    const a = biblioteca();
    const b = biblioteca();
    b.generado_en = '2020-01-01T00:00:00.000Z';
    b.dispositivo = 'OTRO-PC';
    expect(hash(a)).toBe(hash(b));
  });

  it('ignora el orden de las claves dentro de una fila', () => {
    const a = biblioteca();
    const b = biblioteca();
    b.tablas.contenido[0] = { mal_id: 9253, estado: 'completado', tipo: 'anime', titulo: 'Steins;Gate', id: 1 };
    expect(hash(a)).toBe(hash(b));
  });

  it('cambia si cambia un solo dato', () => {
    const a = biblioteca();
    const b = biblioteca();
    b.tablas.entregas[1].visto = 1;
    expect(hash(a)).not.toBe(hash(b));
  });

  it('cambia si se añade o quita una fila', () => {
    const a = biblioteca();
    const b = biblioteca();
    b.tablas.contenido.push({ id: 3, titulo: 'Nuevo' });
    expect(hash(a)).not.toBe(hash(b));
  });
});

describe('compresión', () => {
  it('ida y vuelta conserva los datos', () => {
    const s = biblioteca();
    const vuelta = descomprimir(comprimir(s));
    expect(vuelta).toEqual(s);
    expect(hash(vuelta)).toBe(hash(s));
  });

  it('comprime de verdad en datos realistas', () => {
    // Sinopsis repetitivas: el caso real, donde el texto domina el volcado.
    const grande = construir({
      contenido: Array.from({ length: 300 }, (_, i) => ({
        id: i + 1,
        titulo: `Serie número ${i + 1}`,
        descripcion: 'Una sinopsis larga y repetitiva. '.repeat(30),
      })),
      tags: [], entregas: [], contenido_tags: [], contenido_nombres: [], actividad: [],
    });
    const crudo = Buffer.byteLength(JSON.stringify(grande), 'utf8');
    const gz = comprimir(grande);
    expect(gz.length).toBeLessThan(crudo / 4);
  });
});

describe('cabeEnFirestore', () => {
  it('acepta un documento pequeño', () => {
    const r = cabeEnFirestore(comprimir(biblioteca()));
    expect(r.cabe).toBe(true);
    expect(r.porcentaje).toBeLessThan(5);
  });

  it('rechaza uno que supera el límite útil', () => {
    const r = cabeEnFirestore(Buffer.alloc(1024 * 1024));
    expect(r.cabe).toBe(false);
    expect(r.porcentaje).toBeGreaterThan(100);
  });

  it('reserva margen por debajo del megabyte de Firestore', () => {
    // El documento lleva además hash, fechas y nombre del equipo.
    const r = cabeEnFirestore(Buffer.alloc(1));
    expect(r.limite).toBeLessThan(1048576);
  });
});
