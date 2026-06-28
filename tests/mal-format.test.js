import { describe, it, expect } from 'vitest';
import { formatearFechaMAL, traducirEstadoEmision, extraerCamposMAL, tituloMAL, codigoEmision } from '../src/js/lib/mal-format.js';

describe('formatearFechaMAL', () => {
  it('ISO válida → "Mmm AAAA" (UTC)', () => {
    expect(formatearFechaMAL('2011-04-06T00:00:00+00:00')).toBe('Abr 2011');
    expect(formatearFechaMAL('2013-01-15')).toBe('Ene 2013');
  });
  it('nula/vacía → ""', () => {
    expect(formatearFechaMAL(null)).toBe('');
    expect(formatearFechaMAL('')).toBe('');
    expect(formatearFechaMAL(undefined)).toBe('');
  });
  it('inválida → ""', () => {
    expect(formatearFechaMAL('no es fecha')).toBe('');
  });
});

describe('traducirEstadoEmision', () => {
  it('estados conocidos', () => {
    expect(traducirEstadoEmision('Finished Airing')).toBe('Finalizado');
    expect(traducirEstadoEmision('Currently Airing')).toBe('En emisión');
    expect(traducirEstadoEmision('Not yet aired')).toBe('No emitido aún');
  });
  it('desconocido pasa tal cual', () => {
    expect(traducirEstadoEmision('Whatever')).toBe('Whatever');
  });
  it('vacío → ""', () => {
    expect(traducirEstadoEmision(undefined)).toBe('');
  });
});

describe('extraerCamposMAL', () => {
  it('mapea y formatea una respuesta de Jikan', () => {
    const anime = {
      mal_id: 9253, score: 9.1, rank: 3, duration: '24 min per ep',
      studios: [{ name: 'White Fox' }],
      aired: { from: '2011-04-06T00:00:00+00:00', to: '2011-09-14T00:00:00+00:00' },
      status: 'Finished Airing',
    };
    expect(extraerCamposMAL(anime)).toEqual({
      mal_id: 9253, score_mal: 9.1, mal_rank: 3,
      estudio: 'White Fox', duracion_ep: '24 min per ep',
      fecha_estreno: 'Abr 2011', fecha_fin_emision: 'Sep 2011',
      estado_emision: 'Finalizado',
    });
  });
  it('campos ausentes → null/"" sin romper', () => {
    expect(extraerCamposMAL({})).toEqual({
      mal_id: null, score_mal: null, mal_rank: null,
      estudio: '', duracion_ep: '',
      fecha_estreno: '', fecha_fin_emision: '', estado_emision: '',
    });
  });
});

describe('tituloMAL', () => {
  it('prefiere el título en inglés', () => {
    expect(tituloMAL({ title: 'Shingeki no Kyojin', title_english: 'Attack on Titan' })).toBe('Attack on Titan');
  });
  it('cae al romaji si no hay inglés', () => {
    expect(tituloMAL({ title: 'Mushishi', title_english: null })).toBe('Mushishi');
    expect(tituloMAL({ title: 'Mushishi' })).toBe('Mushishi');
  });
  it('sin títulos → ""', () => {
    expect(tituloMAL({})).toBe('');
  });
});

describe('codigoEmision', () => {
  it('mapea los estados de Jikan a códigos de franquicia', () => {
    expect(codigoEmision('Currently Airing')).toBe('en_emision');
    expect(codigoEmision('Not yet aired')).toBe('proximamente');
    expect(codigoEmision('Finished Airing')).toBe('finalizado');
  });
  it('cualquier otro/indefinido → finalizado', () => {
    expect(codigoEmision('')).toBe('finalizado');
    expect(codigoEmision(undefined)).toBe('finalizado');
  });
});
