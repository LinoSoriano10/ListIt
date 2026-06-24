import { describe, it, expect } from 'vitest';
import { calcularProgreso } from '../src/js/lib/progress.js';

describe('calcularProgreso', () => {
  it('sin entregas → ""', () => {
    expect(calcularProgreso({ total_entregas: 0 })).toBe('');
    expect(calcularProgreso({})).toBe('');
  });

  it('temporada única con total → "ep. A/T" sin prefijo', () => {
    expect(calcularProgreso({ total_entregas: 1, primera_ep_actual: 5, primera_ep_total: 12 }))
      .toBe('ep. 5/12');
  });

  it('temporada única sin total pero con progreso → "ep. A"', () => {
    expect(calcularProgreso({ total_entregas: 1, primera_ep_actual: 5, primera_ep_total: 0 }))
      .toBe('ep. 5');
  });

  it('temporada única sin progreso → ""', () => {
    expect(calcularProgreso({ total_entregas: 1, primera_ep_actual: 0, primera_ep_total: 0 }))
      .toBe('');
  });

  it('multi con temporada en curso → "T · ep. A/T"', () => {
    expect(calcularProgreso({
      total_entregas: 3, entrega_en_curso_id: 7, entrega_en_curso_numero: 'T2',
      entrega_en_curso_ep_actual: 4, entrega_en_curso_ep_total: 24,
    })).toBe('T2 · ep. 4/24');
  });

  it('multi en curso sin total de episodios → "T · ep. A"', () => {
    expect(calcularProgreso({
      total_entregas: 3, entrega_en_curso_id: 7, entrega_en_curso_numero: 'T2',
      entrega_en_curso_ep_actual: 4, entrega_en_curso_ep_total: 0,
    })).toBe('T2 · ep. 4');
  });

  it('multi en curso sin episodios → solo el número', () => {
    expect(calcularProgreso({
      total_entregas: 3, entrega_en_curso_id: 7, entrega_en_curso_numero: 'T2',
      entrega_en_curso_ep_actual: 0, entrega_en_curso_ep_total: 0,
    })).toBe('T2');
  });

  it('multi sin temporada en curso → "vistas/total temporadas"', () => {
    expect(calcularProgreso({ total_entregas: 3, entregas_vistas: 3, entrega_en_curso_id: 0 }))
      .toBe('3/3 temporadas');
  });
});
