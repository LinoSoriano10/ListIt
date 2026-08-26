import { describe, it, expect } from 'vitest';
import { crearCache, dentroDeVentana } from '../src/js/lib/mal-cache.js';

const SEMANA = 7 * 24 * 60 * 60 * 1000;

describe('crearCache', () => {
  it('descarga la primera vez y reutiliza después', async () => {
    const cache = crearCache();
    let llamadas = 0;
    const traer = async () => { llamadas++; return { id: 9253 }; };

    const a = await cache.obtener(9253, traer);
    const b = await cache.obtener(9253, traer);

    expect(llamadas).toBe(1);
    expect(a).toBe(b);
    expect(cache.estadisticas()).toEqual({ aciertos: 1, fallos: 1, guardados: 1 });
  });

  it('claves distintas no se pisan', async () => {
    const cache = crearCache();
    await cache.obtener(1, async () => 'uno');
    await cache.obtener(2, async () => 'dos');
    expect(await cache.obtener(1, async () => 'otro')).toBe('uno');
    expect(await cache.obtener(2, async () => 'otro')).toBe('dos');
  });

  it('ahorra justo lo que se espera al recorrer una franquicia', async () => {
    // La actualización de la ficha trae el detalle de la raíz; después el
    // recorrido lo necesita otra vez para leer sus relaciones. Sin caché son
    // dos peticiones por serie; con caché, una.
    const cache = crearCache();
    let peticiones = 0;
    const detalle = async () => { peticiones++; return { relations: [] }; };

    await cache.obtener(37430, detalle);   // paso 1: actualizar ficha
    await cache.obtener(37430, detalle);   // paso 2: recorrer franquicia

    expect(peticiones).toBe(1);
    expect(cache.estadisticas().aciertos).toBe(1);
  });

  it('no guarda un fallo de red, para poder reintentar', async () => {
    const cache = crearCache();
    let intentos = 0;
    const inestable = async () => { intentos++; return intentos === 1 ? null : { ok: true }; };

    expect(await cache.obtener(1, inestable)).toBeNull();
    expect(await cache.obtener(1, inestable)).toEqual({ ok: true });
    expect(intentos).toBe(2);
  });

  it('poner() precarga sin pedir nada', async () => {
    const cache = crearCache();
    cache.poner(1, { titulo: 'ya lo tenía' });
    let llamadas = 0;
    const v = await cache.obtener(1, async () => { llamadas++; return null; });
    expect(v.titulo).toBe('ya lo tenía');
    expect(llamadas).toBe(0);
  });

  it('poner() ignora valores nulos', () => {
    const cache = crearCache();
    cache.poner(1, null);
    cache.poner(2, undefined);
    expect(cache.tiene(1)).toBe(false);
    expect(cache.tiene(2)).toBe(false);
  });

  it('tiene() responde sin descargar', async () => {
    const cache = crearCache();
    expect(cache.tiene(1)).toBe(false);
    await cache.obtener(1, async () => 'x');
    expect(cache.tiene(1)).toBe(true);
  });
});

describe('dentroDeVentana', () => {
  const ahora = Date.parse('2026-08-26T12:00:00Z');

  it('comprobada hace poco → se salta', () => {
    expect(dentroDeVentana('2026-08-24T12:00:00Z', ahora, SEMANA)).toBe(true);
  });

  it('comprobada hace más de una semana → toca mirarla', () => {
    expect(dentroDeVentana('2026-08-01T12:00:00Z', ahora, SEMANA)).toBe(false);
  });

  it('nunca comprobada → toca mirarla', () => {
    // Es el comportamiento que ya tenía el bucle: sin fecha previa, se revisa.
    expect(dentroDeVentana(undefined, ahora, SEMANA)).toBe(false);
    expect(dentroDeVentana(null, ahora, SEMANA)).toBe(false);
    expect(dentroDeVentana('', ahora, SEMANA)).toBe(false);
  });

  it('una fecha ilegible se trata como nunca comprobada', () => {
    expect(dentroDeVentana('no es una fecha', ahora, SEMANA)).toBe(false);
  });

  it('justo en el límite todavía cuenta como reciente', () => {
    expect(dentroDeVentana(new Date(ahora - SEMANA).toISOString(), ahora, SEMANA)).toBe(true);
    expect(dentroDeVentana(new Date(ahora - SEMANA - 1).toISOString(), ahora, SEMANA)).toBe(false);
  });
});
