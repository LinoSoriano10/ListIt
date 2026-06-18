import { describe, it, expect } from 'vitest';
import { matchAll } from '../src/js/lib/search.js';

const items = [
  { titulo: 'Attack on Titan', nombres: ['Shingeki no Kyojin', '進撃の巨人'] },
  { titulo: 'Demon Slayer',     nombres: ['Kimetsu no Yaiba'] },
  { titulo: 'Spirited Away',    nombres: ['El viaje de Chihiro'] },
  { titulo: 'Breaking Bad',     nombres: [] },
];

describe('matchAll', () => {
  it('returns all items on empty termino', () => {
    expect(matchAll('', items)).toHaveLength(4);
    expect(matchAll(null, items)).toHaveLength(4);
  });

  it('filters by titulo (case insensitive)', () => {
    expect(matchAll('titan', items)).toHaveLength(1);
    expect(matchAll('TITAN', items)).toHaveLength(1);
  });

  it('filters by nombre alternativo', () => {
    expect(matchAll('kyojin', items)).toHaveLength(1);
    expect(matchAll('chihiro', items)).toHaveLength(1);
  });

  it('multi-word AND match', () => {
    expect(matchAll('attack titan', items)).toHaveLength(1);
    expect(matchAll('attack bad', items)).toHaveLength(0);
  });

  it('returns empty array when no match', () => {
    expect(matchAll('zzznomatch', items)).toHaveLength(0);
  });
});
