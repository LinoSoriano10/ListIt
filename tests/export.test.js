import { describe, it, expect } from 'vitest';
import { generarXml, generarMarkdown } from '../lib/export.js';

const filas = [
  {
    item: {
      titulo: 'Attack on Titan',
      tipo: 'anime',
      estado: 'completado',
      anio: 2013,
      descripcion: 'La humanidad vive encerrada.',
      imagen: 'https://cdn.example.com/aot.jpg',
      episodio_actual: 87,
      episodios_totales: 87,
      fecha_inicio: '',
      fecha_fin: '',
      tags: ['anime'],
    },
    entregas: [
      { numero: 'S1', titulo: 'Temporada 1', visto: 1, episodio_actual: 25, episodios_totales: 25 },
    ],
  },
  {
    item: {
      titulo: 'Breaking Bad',
      tipo: 'serie',
      estado: 'completado',
      anio: 2008,
      descripcion: '',
      imagen: '',
      episodio_actual: 0,
      episodios_totales: 0,
      fecha_inicio: '',
      fecha_fin: '',
      tags: ['serie'],
    },
    entregas: [],
  },
];

describe('generarXml', () => {
  it('generates valid XML with root element', () => {
    const xml = generarXml(filas);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<listit>');
    expect(xml).toContain('</listit>');
  });

  it('includes all entry fields', () => {
    const xml = generarXml(filas);
    expect(xml).toContain('<titulo>Attack on Titan</titulo>');
    expect(xml).toContain('<anio>2013</anio>');
    expect(xml).toContain('<estado>completado</estado>');
    expect(xml).toContain('<episodios_totales>87</episodios_totales>');
  });

  it('includes entrega blocks', () => {
    const xml = generarXml(filas);
    expect(xml).toContain('<entregas>');
    expect(xml).toContain('<numero>S1</numero>');
    expect(xml).toContain('<visto>1</visto>');
  });

  it('escapes special characters', () => {
    const xml = generarXml([{
      item: { titulo: 'A & B <test>', tipo: 'anime', estado: 'pendiente',
              imagen: '', descripcion: '', fecha_inicio: '', fecha_fin: '',
              episodio_actual: 0, episodios_totales: 0, tags: ['anime'] },
      entregas: [],
    }]);
    expect(xml).toContain('A &amp; B &lt;test&gt;');
  });
});

describe('generarMarkdown', () => {
  it('generates markdown with section headers', () => {
    const md = generarMarkdown(filas);
    expect(md).toContain('# Mi Lista');
    expect(md).toContain('## Completado');
  });

  it('includes all titles in a table row', () => {
    const md = generarMarkdown(filas);
    expect(md).toContain('Attack on Titan');
    expect(md).toContain('Breaking Bad');
  });

  it('uses the first tag as tipo', () => {
    const md = generarMarkdown(filas);
    expect(md).toContain('anime');
    expect(md).toContain('serie');
  });
});
