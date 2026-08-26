import { describe, it, expect } from 'vitest';
import { recorrerFranquicia, RELACIONES_SEGUIDAS } from '../src/js/lib/mal-franquicia.js';

// Grafo real de "That Time I Got Reincarnated as a Slime", tal y como lo
// devuelve la API oficial de MyAnimeList. Es el caso que destapó el fallo: la
// Movie 2 (59971) cuelga de la temporada 3 como historia paralela, no como
// secuela, así que la cadena lineal no la alcanzaba nunca.
const SLIME = {
  37430: [                                             // Temporada 1 (raíz)
    { relation: 'Side story', entry: [{ mal_id: 38793, type: 'anime' }] },   // OVA
    { relation: 'Sequel',     entry: [{ mal_id: 39551, type: 'anime' }] },
    { relation: 'Summary',    entry: [{ mal_id: 39607, type: 'anime' }] },   // recopilatorio
    { relation: 'Spin-off',   entry: [{ mal_id: 41488, type: 'anime' }] },   // serie aparte
    { relation: 'Summary',    entry: [{ mal_id: 45753, type: 'anime' }] },
    { relation: 'Other',      entry: [{ mal_id: 51309, type: 'anime' }] },
    { relation: 'Character',  entry: [{ mal_id: 55720, type: 'anime' }] },
  ],
  39551: [{ relation: 'Sequel', entry: [{ mal_id: 41487, type: 'anime' }] }],
  41487: [{ relation: 'Sequel', entry: [{ mal_id: 53580, type: 'anime' }] }],
  53580: [                                             // Temporada 3
    { relation: 'Prequel',    entry: [{ mal_id: 41487, type: 'anime' }] },
    { relation: 'Summary',    entry: [{ mal_id: 59493, type: 'anime' }] },
    { relation: 'Sequel',     entry: [{ mal_id: 59970, type: 'anime' }] },
    { relation: 'Side story', entry: [{ mal_id: 59971, type: 'anime' }] },   // ← Movie 2
  ],
  59970: [
    { relation: 'Prequel', entry: [{ mal_id: 53580, type: 'anime' }] },
    { relation: 'Sequel',  entry: [{ mal_id: 63129, type: 'anime' }] },
  ],
  63129: [{ relation: 'Prequel', entry: [{ mal_id: 59970, type: 'anime' }] }],
  59971: [{ relation: 'Parent story', entry: [{ mal_id: 53580, type: 'anime' }] }],
  38793: [{ relation: 'Parent story', entry: [{ mal_id: 37430, type: 'anime' }] }],
};

function fuente(grafo) {
  const pedidos = [];
  const fn = async (id) => { pedidos.push(id); return grafo[id] || []; };
  fn.pedidos = pedidos;
  return fn;
}

describe('recorrerFranquicia — el caso que motivó el arreglo', () => {
  it('encuentra la película que colgaba de lado', async () => {
    const { nodos } = await recorrerFranquicia(37430, fuente(SLIME));
    expect(nodos).toContain(59971);   // Movie 2: Soukai no Namida-hen
  });

  it('encuentra también la OVA', async () => {
    const { nodos } = await recorrerFranquicia(37430, fuente(SLIME));
    expect(nodos).toContain(38793);
  });

  it('sigue trayendo toda la cadena de temporadas', async () => {
    const { nodos } = await recorrerFranquicia(37430, fuente(SLIME));
    for (const id of [37430, 39551, 41487, 53580, 59970, 63129]) {
      expect(nodos).toContain(id);
    }
  });

  it('deja fuera recopilatorios, extras y series derivadas', async () => {
    const { nodos } = await recorrerFranquicia(37430, fuente(SLIME));
    expect(nodos).not.toContain(39607);   // Summary
    expect(nodos).not.toContain(45753);   // Summary
    expect(nodos).not.toContain(59493);   // Summary
    expect(nodos).not.toContain(41488);   // Spin-off: Tensura Nikki
    expect(nodos).not.toContain(51309);   // Other
    expect(nodos).not.toContain(55720);   // Character
  });

  it('no retrocede por Prequel ni Parent story hacia fuera de la franquicia', async () => {
    // Empezando por la temporada 3, hacia atrás no se sube: la raíz de una
    // entrada es su temporada 1 y el recorrido va hacia delante.
    const { nodos } = await recorrerFranquicia(53580, fuente(SLIME));
    expect(nodos).not.toContain(39551);
    expect(nodos).toContain(59971);
    expect(nodos).toContain(59970);
  });
});

describe('recorrerFranquicia — espina de secuelas', () => {
  it('la espina es la cadena de temporadas, sin historias paralelas', async () => {
    const { espina } = await recorrerFranquicia(37430, fuente(SLIME));
    expect(espina).toEqual([37430, 39551, 41487, 53580, 59970, 63129]);
    expect(espina).not.toContain(59971);
    expect(espina).not.toContain(38793);
  });

  it('la última de la espina es la temporada más reciente', async () => {
    // De aquí sale la marca de emisión de la franquicia: tomarla de una
    // película daría un estado equivocado.
    const { espina } = await recorrerFranquicia(37430, fuente(SLIME));
    expect(espina[espina.length - 1]).toBe(63129);
  });

  it('con una sola entrada, la espina es ella misma', async () => {
    const { espina } = await recorrerFranquicia(1, fuente({ 1: [] }));
    expect(espina).toEqual([1]);
  });
});

describe('recorrerFranquicia — robustez', () => {
  it('no pide dos veces el mismo id aunque se llegue por dos caminos', async () => {
    const grafo = {
      1: [{ relation: 'Sequel', entry: [{ mal_id: 2 }] },
          { relation: 'Side story', entry: [{ mal_id: 3 }] }],
      2: [{ relation: 'Side story', entry: [{ mal_id: 3 }] }],   // 3 alcanzable por dos vías
      3: [],
    };
    const f = fuente(grafo);
    await recorrerFranquicia(1, f);
    const repetidos = f.pedidos.filter((x, i) => f.pedidos.indexOf(x) !== i);
    expect(repetidos).toEqual([]);
  });

  it('aguanta ciclos sin colgarse', async () => {
    const grafo = {
      1: [{ relation: 'Sequel', entry: [{ mal_id: 2 }] }],
      2: [{ relation: 'Sequel', entry: [{ mal_id: 1 }] }],
    };
    const { nodos } = await recorrerFranquicia(1, fuente(grafo));
    expect(nodos.sort()).toEqual([1, 2]);
  });

  it('respeta el tope de nodos', async () => {
    const grafo = {};
    for (let i = 1; i <= 100; i++) grafo[i] = [{ relation: 'Sequel', entry: [{ mal_id: i + 1 }] }];
    const { nodos } = await recorrerFranquicia(1, fuente(grafo), { maxNodos: 5 });
    expect(nodos).toHaveLength(5);
  });

  it('una entrada que falla no tumba el recorrido', async () => {
    const grafo = {
      1: [{ relation: 'Sequel', entry: [{ mal_id: 2 }] },
          { relation: 'Side story', entry: [{ mal_id: 3 }] }],
      3: [],
    };
    const fn = async (id) => {
      if (id === 2) throw new Error('MAL no responde');
      return grafo[id] || [];
    };
    const { nodos } = await recorrerFranquicia(1, fn);
    expect(nodos).toContain(3);   // el otro camino sigue
    expect(nodos).toContain(2);   // se alcanzó, aunque no se pudo expandir
  });

  it('se puede cancelar a media pasada', async () => {
    const grafo = {};
    for (let i = 1; i <= 50; i++) grafo[i] = [{ relation: 'Sequel', entry: [{ mal_id: i + 1 }] }];
    let n = 0;
    const { nodos } = await recorrerFranquicia(1, fuente(grafo), { abortado: () => ++n > 3 });
    expect(nodos.length).toBeLessThan(10);
  });

  it('ignora entradas que no son anime', async () => {
    const grafo = { 1: [{ relation: 'Side story', entry: [{ mal_id: 9, type: 'manga' }] }] };
    const { nodos } = await recorrerFranquicia(1, fuente(grafo));
    expect(nodos).toEqual([1]);
  });

  it('compara los nombres de relación sin distinguir mayúsculas', async () => {
    const grafo = { 1: [{ relation: 'SIDE STORY', entry: [{ mal_id: 2 }] }], 2: [] };
    const { nodos } = await recorrerFranquicia(1, fuente(grafo));
    expect(nodos).toContain(2);
  });

  it('la lista blanca es corta a propósito', () => {
    expect(RELACIONES_SEGUIDAS).toEqual(['sequel', 'side story']);
  });
});
