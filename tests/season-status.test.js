import { describe, it, expect } from 'vitest';
import { todasCompletas } from '../lib/season-status.js';

describe('todasCompletas', () => {
  it('sin entregas → false', () => {
    expect(todasCompletas([])).toBe(false);
  });

  it('todas vistas → true', () => {
    expect(todasCompletas([{ visto: 1 }, { visto: 1 }])).toBe(true);
  });

  it('todas con episodios completos → true', () => {
    expect(todasCompletas([
      { visto: 0, episodio_actual: 12, episodios_totales: 12 },
      { visto: 0, episodio_actual: 24, episodios_totales: 24 },
    ])).toBe(true);
  });

  it('una incompleta → false', () => {
    expect(todasCompletas([
      { visto: 1 },
      { visto: 0, episodio_actual: 3, episodios_totales: 12 },
    ])).toBe(false);
  });

  it('mezcla de vista y episodios completos → true', () => {
    expect(todasCompletas([
      { visto: 1 },
      { visto: 0, episodio_actual: 12, episodios_totales: 12 },
    ])).toBe(true);
  });

  it('episodios_totales 0 y no vista → incompleta', () => {
    expect(todasCompletas([{ visto: 0, episodio_actual: 0, episodios_totales: 0 }])).toBe(false);
  });

  it('episodios_totales 0 pero vista → completa', () => {
    expect(todasCompletas([{ visto: 1, episodio_actual: 0, episodios_totales: 0 }])).toBe(true);
  });

  it('episodio_actual supera el total → completa', () => {
    expect(todasCompletas([{ visto: 0, episodio_actual: 13, episodios_totales: 12 }])).toBe(true);
  });
});

// Camino B: las temporadas anunciadas pero aún no emitidas (no_emitido) son
// visibles pero NO cuentan para la completitud.
describe('todasCompletas con temporadas no emitidas', () => {
  const proxima = { visto: 0, episodio_actual: 0, episodios_totales: 0, no_emitido: 1 };

  it('una temporada no emitida NO bloquea el completado', () => {
    expect(todasCompletas([
      { visto: 1 },
      { visto: 0, episodio_actual: 12, episodios_totales: 12 },
      proxima,
    ])).toBe(true);
  });

  it('si SOLO hay temporadas no emitidas → no completa (nada ha salido aún)', () => {
    expect(todasCompletas([proxima])).toBe(false);
    expect(todasCompletas([proxima, { ...proxima }])).toBe(false);
  });

  it('una temporada emitida a medias sigue bloqueando aunque haya una no emitida', () => {
    expect(todasCompletas([
      { visto: 0, episodio_actual: 3, episodios_totales: 12 },
      proxima,
    ])).toBe(false);
  });

  it('la no emitida se ignora aunque llegara marcada vista por error', () => {
    expect(todasCompletas([
      { visto: 0, episodio_actual: 3, episodios_totales: 12 },
      { visto: 1, episodio_actual: 0, episodios_totales: 0, no_emitido: 1 },
    ])).toBe(false);
  });
});
