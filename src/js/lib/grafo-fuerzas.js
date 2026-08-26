// Simulación de fuerzas para el grafo de géneros.
//
// Módulo puro: no toca el DOM ni Canvas, solo mueve puntos. Así se puede testear
// con Vitest, y sobre todo deja el dibujo aislado en grafo-generos.js — pasar a
// una vista 3D más adelante sería añadir un eje z aquí y cambiar la proyección
// allí, sin tocar datos ni interacción.
//
// El modelo es el clásico: los nodos se repelen entre sí, las aristas tiran como
// muelles, una fuerza suave los atrae al centro para que no se escapen, y el
// rozamiento hace que el conjunto acabe quieto en vez de oscilar para siempre.

const POR_DEFECTO = {
  repulsion:   2400,   // fuerza con que se separan dos nodos
  rigidez:     0.012,  // cuánto tira cada arista
  longitud:    90,     // distancia en reposo de una arista
  centrado:    0.006,  // atracción hacia el centro
  rozamiento:  0.86,   // 0 = se para en seco, 1 = no pierde energía nunca
  distanciaMin: 24,    // evita fuerzas enormes cuando dos nodos casi se tocan
};

// Generador reproducible: sin él, cada apertura del grafo daría una disposición
// distinta y los tests no podrían comprobar nada.
function aleatorio(semilla) {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * `nodos`: [{ id, peso? }]  ·  `enlaces`: [{ origen, destino }]
 * Los ids de los enlaces deben existir en los nodos; los que no, se descartan.
 */
export function crearSimulacion({ nodos, enlaces, ancho = 800, alto = 600, semilla = 1, opciones = {} }) {
  const cfg = { ...POR_DEFECTO, ...opciones };
  const rnd = aleatorio(semilla);

  // Disposición inicial en círculo con algo de ruido: partir de posiciones
  // idénticas dejaría la repulsión sin dirección en la que empujar.
  const puntos = nodos.map((n, i) => {
    const ang = (i / Math.max(nodos.length, 1)) * Math.PI * 2;
    const r = Math.min(ancho, alto) * 0.3 * (0.6 + rnd() * 0.4);
    return {
      ...n,
      x: ancho / 2 + Math.cos(ang) * r,
      y: alto / 2 + Math.sin(ang) * r,
      vx: 0,
      vy: 0,
    };
  });

  const porId = new Map(puntos.map(p => [p.id, p]));
  const aristas = (enlaces || []).filter(e => porId.has(e.origen) && porId.has(e.destino));

  return { nodos: puntos, aristas, porId, ancho, alto, cfg, energia: Infinity };
}

/**
 * Avanza un paso. Devuelve la energía cinética total, que sirve para saber
 * cuándo el grafo se ha asentado.
 */
export function paso(sim) {
  const { nodos, aristas, cfg, ancho, alto } = sim;

  for (const n of nodos) { n.fx = 0; n.fy = 0; }

  // Repulsión entre todos los pares. Es O(n²), pero con decenas de nodos —que es
  // lo que se muestra a la vez— resulta imperceptible y evita complicarlo.
  for (let i = 0; i < nodos.length; i++) {
    for (let j = i + 1; j < nodos.length; j++) {
      const a = nodos[i], b = nodos[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d = Math.hypot(dx, dy);
      if (d < cfg.distanciaMin) {
        // Superpuestos: se les da un empujón en una dirección cualquiera pero
        // estable, para que no se queden pegados.
        d = cfg.distanciaMin;
        if (dx === 0 && dy === 0) { dx = (i - j) || 1; dy = 1; }
      }
      const f = cfg.repulsion / (d * d);
      const ux = dx / d, uy = dy / d;
      a.fx += ux * f; a.fy += uy * f;
      b.fx -= ux * f; b.fy -= uy * f;
    }
  }

  // Muelles de las aristas.
  for (const e of aristas) {
    const a = sim.porId.get(e.origen), b = sim.porId.get(e.destino);
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const f = (d - cfg.longitud) * cfg.rigidez;
    const ux = dx / d, uy = dy / d;
    a.fx += ux * f; a.fy += uy * f;
    b.fx -= ux * f; b.fy -= uy * f;
  }

  // Atracción al centro y avance.
  let energia = 0;
  for (const n of nodos) {
    if (n.fijo) { n.vx = 0; n.vy = 0; continue; }
    n.fx += (ancho / 2 - n.x) * cfg.centrado;
    n.fy += (alto / 2 - n.y) * cfg.centrado;

    n.vx = (n.vx + n.fx) * cfg.rozamiento;
    n.vy = (n.vy + n.fy) * cfg.rozamiento;
    n.x += n.vx;
    n.y += n.vy;
    energia += n.vx * n.vx + n.vy * n.vy;
  }

  sim.energia = energia;
  return energia;
}

/**
 * Itera hasta que el grafo se asienta o se agotan los pasos. Se usa para
 * presentarlo ya colocado en vez de animar el caos inicial.
 */
export function estabilizar(sim, maxPasos = 300, umbral = 0.02) {
  for (let i = 0; i < maxPasos; i++) {
    if (paso(sim) < umbral) return i + 1;
  }
  return maxPasos;
}

/**
 * Nodo bajo un punto, o null. El radio puede depender del nodo (los géneros se
 * dibujan más grandes que las series).
 */
export function nodoEn(sim, x, y, radioDe) {
  // De atrás hacia delante: si dos se solapan, gana el que se pinta encima.
  for (let i = sim.nodos.length - 1; i >= 0; i--) {
    const n = sim.nodos[i];
    const r = typeof radioDe === 'function' ? radioDe(n) : (radioDe || 10);
    if (Math.hypot(n.x - x, n.y - y) <= r) return n;
  }
  return null;
}

/**
 * Encaja el grafo en el lienzo dejando un margen, para que no quede pegado a
 * los bordes ni ocupando solo una esquina.
 */
export function encuadrar(sim, margen = 40) {
  if (sim.nodos.length === 0) return { escala: 1, dx: 0, dy: 0 };

  const xs = sim.nodos.map(n => n.x), ys = sim.nodos.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const anchoUtil = sim.ancho - margen * 2;
  const altoUtil  = sim.alto  - margen * 2;
  const escala = Math.min(
    anchoUtil / Math.max(maxX - minX, 1),
    altoUtil  / Math.max(maxY - minY, 1),
    2.5,
  );

  return {
    escala,
    dx: margen - minX * escala + (anchoUtil - (maxX - minX) * escala) / 2,
    dy: margen - minY * escala + (altoUtil - (maxY - minY) * escala) / 2,
  };
}
