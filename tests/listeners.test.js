import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Guarda contra un fallo que ya se coló una vez.
//
// `addEventListener('click', fn)` llama a `fn` con el evento como PRIMER
// argumento. Si `fn` declara un parámetro que espera otra cosa, recibe un
// MouseEvent sin que nada avise: ni el linter ni los tests de unidad lo ven,
// porque el código es sintácticamente correcto.
//
// Pasó con `abrirSettings(panel)` enganchada directamente al botón de la barra
// lateral: el modal se abría con las cinco pestañas ocultas porque `panel` era
// un evento y no coincidía con ninguna. La forma correcta es envolverla,
// `() => abrirSettings()`, para dejar explícito que no se le pasa nada.

function ficherosJs(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...ficherosJs(ruta));
    else if (entrada.name.endsWith('.js')) salida.push(ruta);
  }
  return salida;
}

const FICHEROS = ficherosJs('src/js');
const FUENTES = new Map(FICHEROS.map(f => [f, readFileSync(f, 'utf8')]));

/** Funciones declaradas con al menos un parámetro, por nombre. */
function funcionesConParametros() {
  const firmas = new Map();
  for (const [fichero, src] of FUENTES) {
    const re = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
    for (const m of src.matchAll(re)) {
      const params = m[2].trim();
      if (params) firmas.set(m[1], { params, fichero });
    }
  }
  return firmas;
}

/** Listeners enganchados directamente a un identificador, sin envolver. */
function listenersDirectos() {
  const encontrados = [];
  for (const [fichero, src] of FUENTES) {
    const re = /addEventListener\(\s*'(\w+)'\s*,\s*(\w+)\s*\)/g;
    for (const m of src.matchAll(re)) {
      encontrados.push({ fichero, evento: m[1], fn: m[2] });
    }
  }
  return encontrados;
}

describe('listeners y firmas de función', () => {
  it('hay ficheros que analizar', () => {
    expect(FICHEROS.length).toBeGreaterThan(10);
  });

  it('ningún listener pasa el evento a una función que espera parámetros', () => {
    const firmas = funcionesConParametros();

    const culpables = listenersDirectos()
      .filter(l => firmas.has(l.fn))
      .map(l => `${l.fichero}: addEventListener('${l.evento}', ${l.fn}) ` +
                `— ${l.fn}(${firmas.get(l.fn).params}) recibiría el evento. ` +
                `Envuélvela: () => ${l.fn}()`);

    expect(culpables).toEqual([]);
  });

  it('detecta el patrón defectuoso si vuelve a aparecer', () => {
    // Comprobación del propio test: sobre un fuente de mentira debe saltar.
    const src = `
      export function abrirAlgo(panel) { return panel; }
      boton.addEventListener('click', abrirAlgo);
    `;
    const firmas = new Map();
    for (const m of src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)) {
      if (m[2].trim()) firmas.set(m[1], m[2].trim());
    }
    const directos = [...src.matchAll(/addEventListener\(\s*'(\w+)'\s*,\s*(\w+)\s*\)/g)];

    expect(firmas.has('abrirAlgo')).toBe(true);
    expect(directos.some(m => firmas.has(m[2]))).toBe(true);
  });

  it('no marca las que sí van envueltas en una flecha', () => {
    const src = `boton.addEventListener('click', () => abrirSettings());`;
    const directos = [...src.matchAll(/addEventListener\(\s*'(\w+)'\s*,\s*(\w+)\s*\)/g)];
    expect(directos).toEqual([]);
  });
});
