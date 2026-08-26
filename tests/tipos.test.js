import { describe, it, expect } from 'vitest';
import {
  TIPOS_SEMILLA,
  unidadesDe,
  minutosDe,
  resumirTiempo,
  esVisible,
  tiposVisibles,
  nombreUnidad,
} from '../lib/tipos.js';

const porClave = Object.fromEntries(TIPOS_SEMILLA.map(t => [t.clave, t]));
const tipo = c => porClave[c];

// Cálculo tal y como estaba incrustado en db.js antes de esta fase. Sirve de
// referencia para comprobar que los tipos que ya existían siguen dando el mismo
// número: cambiarlo sin querer alteraría un dato que el usuario ya conoce.
function minutosAntiguos(c) {
  const eps = c.ep_entregas > 0 ? c.ep_entregas : (c.episodios_totales || 0);
  if (c.tipo === 'pelicula') return (eps > 0 ? eps : 1) * 110;
  if (c.tipo === 'serie')    return eps * 45;
  return eps * 24;
}

describe('unidadesDe', () => {
  it('las temporadas mandan sobre el total plano', () => {
    expect(unidadesDe({ ep_entregas: 24, episodios_totales: 12 })).toBe(24);
  });
  it('sin temporadas usa el total plano', () => {
    expect(unidadesDe({ ep_entregas: 0, episodios_totales: 12 })).toBe(12);
  });
  it('sin nada, cero', () => {
    expect(unidadesDe({})).toBe(0);
    expect(unidadesDe(null)).toBe(0);
  });
});

describe('minutosDe — sin regresión para los tipos que ya existían', () => {
  const casos = [
    { tipo: 'anime',    ep_entregas: 24,  episodios_totales: 0  },
    { tipo: 'anime',    ep_entregas: 0,   episodios_totales: 85 },  // Re:Zero
    { tipo: 'anime',    ep_entregas: 171, episodios_totales: 0  },  // Black Clover
    { tipo: 'serie',    ep_entregas: 10,  episodios_totales: 0  },
    { tipo: 'serie',    ep_entregas: 0,   episodios_totales: 62 },
    { tipo: 'pelicula', ep_entregas: 1,   episodios_totales: 1  },
    { tipo: 'pelicula', ep_entregas: 0,   episodios_totales: 0  },  // sin episodios
    { tipo: 'anime',    ep_entregas: 0,   episodios_totales: 0  },
  ];

  for (const c of casos) {
    it(`${c.tipo} · entregas=${c.ep_entregas} totales=${c.episodios_totales} da lo mismo que antes`, () => {
      expect(minutosDe(c, tipo(c.tipo))).toBe(minutosAntiguos(c));
    });
  }
});

describe('minutosDe — lo que cambia a propósito', () => {
  it('un manwa no aporta tiempo de visionado', () => {
    // El caso que motivó todo: 400 capítulos serían 160 h falsas al ritmo viejo.
    const manwa = { tipo: 'manwa', ep_entregas: 400, episodios_totales: 400 };
    expect(minutosAntiguos(manwa)).toBe(400 * 24);
    expect(minutosDe(manwa, tipo('manwa'))).toBe(0);
  });

  it('una película sin episodios sigue contando como una', () => {
    expect(minutosDe({ tipo: 'pelicula', episodios_totales: 0 }, tipo('pelicula'))).toBe(110);
  });

  it('un tipo desconocido se comporta como antes (24 min y cuenta)', () => {
    const raro = { tipo: 'ova-importada', ep_entregas: 5 };
    expect(minutosDe(raro, undefined)).toBe(5 * 24);
    expect(minutosDe(raro, null)).toBe(minutosAntiguos({ ...raro, tipo: 'x' }));
  });
});

describe('resumirTiempo', () => {
  const biblioteca = [
    { tipo: 'anime',    ep_entregas: 24 },
    { tipo: 'anime',    ep_entregas: 12 },
    { tipo: 'pelicula', ep_entregas: 1  },
    { tipo: 'manwa',    ep_entregas: 300 },
    { tipo: 'manwa',    ep_entregas: 150 },
  ];

  it('suma solo lo que cuenta', () => {
    const r = resumirTiempo(biblioteca, porClave);
    expect(r.minutos).toBe(24 * 24 + 12 * 24 + 110);
  });

  it('informa de cuántas entradas quedaron fuera', () => {
    // El dashboard lo enseña: descartar en silencio haría poco fiables las cifras.
    expect(resumirTiempo(biblioteca, porClave).excluidas).toBe(2);
  });

  it('desglosa por tipo', () => {
    const r = resumirTiempo(biblioteca, porClave);
    expect(r.porTipo.anime).toBe(36 * 24);
    expect(r.porTipo.pelicula).toBe(110);
    expect(r.porTipo.manwa).toBe(0);
  });

  it('con lista vacía no revienta', () => {
    expect(resumirTiempo([], porClave)).toEqual({ minutos: 0, excluidas: 0, porTipo: {} });
    expect(resumirTiempo(null, porClave).minutos).toBe(0);
  });
});

describe('esVisible', () => {
  it('automático: visible solo si tiene entradas', () => {
    expect(esVisible({ visible: null }, 5)).toBe(true);
    expect(esVisible({ visible: null }, 0)).toBe(false);
    expect(esVisible({ visible: null }, undefined)).toBe(false);
  });
  it('forzado a visible manda aunque esté vacío', () => {
    expect(esVisible({ visible: 1 }, 0)).toBe(true);
  });
  it('forzado a oculto manda aunque tenga entradas', () => {
    expect(esVisible({ visible: 0 }, 999)).toBe(false);
  });
});

describe('tiposVisibles', () => {
  it('oculta los tipos sin usar y respeta el orden', () => {
    // Situación real de la biblioteca: 293 anime, 2 películas, 0 series.
    const visibles = tiposVisibles(TIPOS_SEMILLA, { anime: 293, pelicula: 2, manwa: 2, serie: 0 });
    expect(visibles.map(t => t.clave)).toEqual(['anime', 'pelicula', 'manwa']);
  });

  it('un tipo reaparece en cuanto se crea la primera entrada', () => {
    const visibles = tiposVisibles(TIPOS_SEMILLA, { anime: 293, serie: 1 });
    expect(visibles.map(t => t.clave)).toContain('serie');
  });

  it('sin conteos no muestra nada en modo automático', () => {
    expect(tiposVisibles(TIPOS_SEMILLA, {})).toEqual([]);
  });
});

describe('nombreUnidad', () => {
  it('distingue episodios de capítulos', () => {
    expect(nombreUnidad(tipo('anime'))).toBe('episodios');
    expect(nombreUnidad(tipo('manwa'))).toBe('capítulos');
    expect(nombreUnidad(tipo('manwa'), false)).toBe('capítulo');
  });
});
