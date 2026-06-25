import { describe, it, expect } from 'vitest';
import { calcMarquee } from '../src/js/lib/marquee.js';

describe('calcMarquee', () => {
  it('texto que cabe → null', () => {
    expect(calcMarquee(100, 100)).toBe(null);
    expect(calcMarquee(101, 100)).toBe(null); // margen de 2px
  });

  it('texto que desborda → shift = -exceso, duración proporcional', () => {
    expect(calcMarquee(300, 100)).toEqual({ shift: -200, dur: 4 });
  });

  it('desbordes pequeños usan la duración mínima (0.35s)', () => {
    expect(calcMarquee(110, 100)).toEqual({ shift: -10, dur: 0.35 });
  });
});
