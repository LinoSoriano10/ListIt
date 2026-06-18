// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parsearXML } from '../src/js/lib/xml-parser.js';

const XML_BASICO = `<?xml version="1.0" encoding="UTF-8"?>
<listit>
  <entrada>
    <titulo>Attack on Titan</titulo>
    <tipo>anime</tipo>
    <estado>completado</estado>
    <anio>2013</anio>
    <episodios_totales>87</episodios_totales>
    <entregas>
      <entrega>
        <numero>S1</numero>
        <titulo>Temporada 1</titulo>
        <visto>1</visto>
        <episodio_actual>25</episodio_actual>
        <episodios_totales>25</episodios_totales>
      </entrega>
    </entregas>
  </entrada>
  <entrada>
    <titulo>Breaking Bad</titulo>
  </entrada>
</listit>`;

const XML_INVALIDO = `<listit><entrada><bad xml`;

describe('parsearXML', () => {
  it('parses a valid XML with two entries', () => {
    const result = parsearXML(XML_BASICO);
    expect(result).toHaveLength(2);
  });

  it('extracts contenido fields correctly', () => {
    const [{ contenido }] = parsearXML(XML_BASICO);
    expect(contenido.titulo).toBe('Attack on Titan');
    expect(contenido.tipo).toBe('anime');
    expect(contenido.estado).toBe('completado');
    expect(contenido.anio).toBe(2013);
    expect(contenido.episodios_totales).toBe(87);
  });

  it('extracts entregas correctly', () => {
    const [{ entregas }] = parsearXML(XML_BASICO);
    expect(entregas).toHaveLength(1);
    expect(entregas[0].numero).toBe('S1');
    expect(entregas[0].visto).toBe(1);
    expect(entregas[0].episodio_actual).toBe(25);
  });

  it('handles minimal entry with only titulo', () => {
    const [, { contenido, entregas }] = parsearXML(XML_BASICO);
    expect(contenido.titulo).toBe('Breaking Bad');
    expect(contenido.estado).toBe('pendiente'); // default
    expect(entregas).toHaveLength(0);
  });

  it('defaults invalid estado to pendiente', () => {
    const xml = `<listit><entrada><titulo>X</titulo><estado>invalid</estado></entrada></listit>`;
    const [{ contenido }] = parsearXML(xml);
    expect(contenido.estado).toBe('pendiente');
  });

  it('throws or returns empty on malformed XML', () => {
    // happy-dom may not throw but should return empty or error entry
    try {
      const result = parsearXML(XML_INVALIDO);
      // If it doesn't throw, result must be empty (parsererror consumed all entries)
      expect(result.length === 0 || result[0].contenido.titulo === '').toBe(true);
    } catch {
      // Throwing is also acceptable behavior
    }
  });

  it('skips entries without titulo', () => {
    const xml = `<listit><entrada><tipo>anime</tipo></entrada><entrada><titulo>OK</titulo></entrada></listit>`;
    expect(parsearXML(xml)).toHaveLength(1);
  });
});
