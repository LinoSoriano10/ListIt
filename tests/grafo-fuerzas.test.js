import { describe, it, expect } from 'vitest';
import {
  crearSimulacion,
  paso,
  estabilizar,
  nodoEn,
  encuadrar,
} from '../src/js/lib/grafo-fuerzas.js';

// Dos géneros con dos series cada uno, más una serie que comparte los dos.
function grafito() {
  return crearSimulacion({
    nodos: [
      { id: 'g:accion' }, { id: 'g:fantasia' },
      { id: 's:1' }, { id: 's:2' }, { id: 's:3' }, { id: 's:4' }, { id: 's:5' },
    ],
    enlaces: [
      { origen: 's:1', destino: 'g:accion' },
      { origen: 's:2', destino: 'g:accion' },
      { origen: 's:3', destino: 'g:fantasia' },
      { origen: 's:4', destino: 'g:fantasia' },
      { origen: 's:5', destino: 'g:accion' },
      { origen: 's:5', destino: 'g:fantasia' },
    ],
    ancho: 600, alto: 400, semilla: 42,
  });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('crearSimulacion', () => {
  it('coloca los nodos dentro del lienzo y sin superponerse todos', () => {
    const s = grafito();
    expect(s.nodos).toHaveLength(7);
    const posiciones = new Set(s.nodos.map(n => `${Math.round(n.x)},${Math.round(n.y)}`));
    expect(posiciones.size).toBeGreaterThan(1);
  });

  it('es reproducible con la misma semilla', () => {
    const a = crearSimulacion({ nodos: [{ id: 'x' }, { id: 'y' }], enlaces: [], semilla: 7 });
    const b = crearSimulacion({ nodos: [{ id: 'x' }, { id: 'y' }], enlaces: [], semilla: 7 });
    expect(a.nodos.map(n => [n.x, n.y])).toEqual(b.nodos.map(n => [n.x, n.y]));
  });

  it('descarta enlaces que apuntan a nodos inexistentes', () => {
    const s = crearSimulacion({
      nodos: [{ id: 'a' }, { id: 'b' }],
      enlaces: [{ origen: 'a', destino: 'b' }, { origen: 'a', destino: 'fantasma' }],
    });
    expect(s.aristas).toHaveLength(1);
  });

  it('aguanta un grafo vacío', () => {
    const s = crearSimulacion({ nodos: [], enlaces: [] });
    expect(() => paso(s)).not.toThrow();
    expect(s.nodos).toEqual([]);
  });
});

describe('paso y estabilizar', () => {
  it('el grafo se asienta en vez de oscilar indefinidamente', () => {
    const s = grafito();
    const pasos = estabilizar(s, 600);
    expect(pasos).toBeLessThan(600);
    expect(s.energia).toBeLessThan(0.02);
  });

  it('la energía baja con el tiempo', () => {
    const s = grafito();
    for (let i = 0; i < 5; i++) paso(s);
    const pronto = s.energia;
    for (let i = 0; i < 200; i++) paso(s);
    expect(s.energia).toBeLessThan(pronto);
  });

  it('las posiciones siguen siendo números finitos', () => {
    const s = grafito();
    estabilizar(s, 400);
    for (const n of s.nodos) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it('agrupa: las series quedan más cerca de su género que del otro', () => {
    // Es el objetivo del grafo — que los grupos se lean de un vistazo.
    const s = grafito();
    estabilizar(s, 600);
    const accion = s.porId.get('g:accion');
    const fantasia = s.porId.get('g:fantasia');

    expect(dist(s.porId.get('s:1'), accion)).toBeLessThan(dist(s.porId.get('s:1'), fantasia));
    expect(dist(s.porId.get('s:3'), fantasia)).toBeLessThan(dist(s.porId.get('s:3'), accion));
  });

  it('un nodo fijo no se mueve', () => {
    const s = grafito();
    const n = s.porId.get('g:accion');
    n.fijo = true;
    const antes = { x: n.x, y: n.y };
    estabilizar(s, 200);
    expect(n.x).toBeCloseTo(antes.x, 6);
    expect(n.y).toBeCloseTo(antes.y, 6);
  });

  it('dos nodos exactamente superpuestos se separan', () => {
    const s = crearSimulacion({ nodos: [{ id: 'a' }, { id: 'b' }], enlaces: [], ancho: 200, alto: 200 });
    s.nodos[0].x = 100; s.nodos[0].y = 100;
    s.nodos[1].x = 100; s.nodos[1].y = 100;
    estabilizar(s, 200);
    expect(dist(s.nodos[0], s.nodos[1])).toBeGreaterThan(1);
    expect(Number.isFinite(s.nodos[0].x)).toBe(true);
  });
});

describe('nodoEn', () => {
  it('encuentra el nodo bajo el punto', () => {
    const s = grafito();
    const n = s.nodos[0];
    expect(nodoEn(s, n.x + 2, n.y + 2, 12)).toBe(n);
  });

  it('devuelve null si no hay nada cerca', () => {
    const s = grafito();
    expect(nodoEn(s, -9999, -9999, 12)).toBeNull();
  });

  it('admite un radio distinto por nodo', () => {
    const s = grafito();
    const n = s.nodos[0];
    const radioDe = x => (x.id.startsWith('g:') ? 30 : 4);
    expect(nodoEn(s, n.x + 20, n.y, radioDe)).toBe(n);   // es un género, radio grande
  });
});

describe('encuadrar', () => {
  it('devuelve una transformación que mete todo en el lienzo', () => {
    const s = grafito();
    estabilizar(s, 400);
    const { escala, dx, dy } = encuadrar(s, 40);

    expect(escala).toBeGreaterThan(0);
    for (const n of s.nodos) {
      const x = n.x * escala + dx;
      const y = n.y * escala + dy;
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(s.ancho + 1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(s.alto + 1);
    }
  });

  it('no revienta con el grafo vacío', () => {
    const s = crearSimulacion({ nodos: [], enlaces: [] });
    expect(encuadrar(s)).toEqual({ escala: 1, dx: 0, dy: 0, desborda: false });
  });

  it('con escala mínima deja que el grafo se salga del lienzo', () => {
    // Encajar 200 nodos en un lienzo obliga a una escala tan pequeña que el
    // grafo se vuelve una mancha: por muy separada que esté la simulación, el
    // encuadre la comprime igual. Con un mínimo se desborda y se explora
    // arrastrando, que es preferible.
    const nodos = Array.from({ length: 200 }, (_, i) => ({ id: i }));
    const s = crearSimulacion({ nodos, enlaces: [], ancho: 400, alto: 300 });
    estabilizar(s, 200);

    const ajustado = encuadrar(s, 40);
    const conMinimo = encuadrar(s, 40, { escalaMinima: 0.9 });

    expect(ajustado.desborda).toBe(false);
    expect(conMinimo.escala).toBeGreaterThanOrEqual(0.9);
    expect(conMinimo.escala).toBeGreaterThan(ajustado.escala);
    expect(conMinimo.desborda).toBe(true);
  });

  it('la escala mínima no encoge un grafo que ya cabía', () => {
    const s = grafito();
    estabilizar(s, 400);
    const sinMinimo = encuadrar(s, 40);
    const conMinimo = encuadrar(s, 40, { escalaMinima: 0.5 });
    expect(conMinimo.escala).toBe(sinMinimo.escala);
    expect(conMinimo.desborda).toBe(false);
  });
});

describe('muelles y pesos por elemento', () => {
  it('una arista con longitud propia separa más que las demás', () => {
    // Es lo que abre el anillo alrededor del género desplegado: alargarlo todo
    // por igual no serviría, porque el encuadre lo reescala de vuelta.
    const nodos = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
    const s = crearSimulacion({
      nodos,
      enlaces: [
        { origen: 'c', destino: 'a', longitud: 400 },
        { origen: 'c', destino: 'b' },
      ],
      ancho: 900, alto: 900, semilla: 5,
    });
    estabilizar(s, 800);
    const c = s.porId.get('c');
    const dist = id => Math.hypot(s.porId.get(id).x - c.x, s.porId.get(id).y - c.y);
    expect(dist('a')).toBeGreaterThan(dist('b') * 1.5);
  });

  it('un nodo con peso empuja más fuerte a los demás', () => {
    const crear = (peso) => {
      const s = crearSimulacion({
        nodos: [{ id: 'centro', peso }, { id: 'x' }, { id: 'y' }],
        enlaces: [{ origen: 'centro', destino: 'x' }, { origen: 'centro', destino: 'y' }],
        ancho: 900, alto: 900, semilla: 3,
      });
      estabilizar(s, 800);
      const c = s.porId.get('centro');
      return Math.hypot(s.porId.get('x').x - c.x, s.porId.get('x').y - c.y);
    };
    expect(crear(9)).toBeGreaterThan(crear(1));
  });

  it('sin longitud propia se usa la de la configuración', () => {
    const s = crearSimulacion({
      nodos: [{ id: 1 }, { id: 2 }],
      enlaces: [{ origen: 1, destino: 2 }],
      ancho: 600, alto: 600,
    });
    estabilizar(s, 600);
    const d = Math.hypot(s.nodos[0].x - s.nodos[1].x, s.nodos[0].y - s.nodos[1].y);
    // La distancia en reposo por defecto es 150; se admite holgura por el
    // centrado, que tira de ambos hacia el medio.
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(220);
  });
});
