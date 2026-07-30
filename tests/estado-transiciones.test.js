import { describe, it, expect } from 'vitest';
import { decidirTransicionPorProgreso } from '../lib/estado-transiciones.js';

describe('decidirTransicionPorProgreso', () => {
  it('pendiente + completo → completado', () => {
    expect(decidirTransicionPorProgreso('pendiente', true)).toEqual({ antes: 'pendiente', ahora: 'completado' });
  });

  it('pendiente + incompleto → viendo', () => {
    expect(decidirTransicionPorProgreso('pendiente', false)).toEqual({ antes: 'pendiente', ahora: 'viendo' });
  });

  it('en_pausa + completo → completado', () => {
    expect(decidirTransicionPorProgreso('en_pausa', true)).toEqual({ antes: 'en_pausa', ahora: 'completado' });
  });

  it('en_pausa + incompleto → viendo', () => {
    expect(decidirTransicionPorProgreso('en_pausa', false)).toEqual({ antes: 'en_pausa', ahora: 'viendo' });
  });

  it('completado + sigue completo → sin cambio', () => {
    expect(decidirTransicionPorProgreso('completado', true)).toBe(null);
  });

  it('completado + deja de estarlo → viendo', () => {
    expect(decidirTransicionPorProgreso('completado', false)).toEqual({ antes: 'completado', ahora: 'viendo' });
  });

  it('viendo + completo → completado', () => {
    expect(decidirTransicionPorProgreso('viendo', true)).toEqual({ antes: 'viendo', ahora: 'completado' });
  });

  it('viendo + incompleto → sin cambio', () => {
    expect(decidirTransicionPorProgreso('viendo', false)).toBe(null);
  });

  it('abandonado + completo → completado (igual que el autocompletado ya existente)', () => {
    expect(decidirTransicionPorProgreso('abandonado', true)).toEqual({ antes: 'abandonado', ahora: 'completado' });
  });

  it('abandonado + incompleto → sin cambio (no se "revive" por tocar un episodio)', () => {
    expect(decidirTransicionPorProgreso('abandonado', false)).toBe(null);
  });
});
