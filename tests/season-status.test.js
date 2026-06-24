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
