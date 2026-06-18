const ESTADOS_VALIDOS = ['viendo', 'completado', 'pendiente', 'en_pausa', 'abandonado'];

export function parsearXML(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error('El archivo XML tiene errores de formato.');
  }

  const txt = (el, tag, def = '') => el.querySelector(tag)?.textContent?.trim() || def;
  const num = (el, tag)           => parseInt(txt(el, tag, '0')) || 0;

  const entradas = [];
  doc.querySelectorAll('entrada').forEach(el => {
    const titulo = txt(el, 'titulo');
    if (!titulo) return;

    const tipoXml = txt(el, 'tipo', 'anime').trim().toLowerCase() || 'anime';
    let estado    = txt(el, 'estado', 'pendiente');
    if (!ESTADOS_VALIDOS.includes(estado)) estado = 'pendiente';

    const contenido = {
      titulo,
      tipo: tipoXml,
      estado,
      anio:              num(el, 'anio') || null,
      descripcion:       txt(el, 'descripcion'),
      imagen:            txt(el, 'imagen'),
      episodio_actual:   num(el, 'episodio_actual'),
      episodios_totales: num(el, 'episodios_totales'),
      fecha_inicio:      txt(el, 'fecha_inicio'),
      fecha_fin:         txt(el, 'fecha_fin'),
    };

    const entregas = [];
    el.querySelectorAll('entregas > entrega').forEach((ent, i) => {
      entregas.push({
        numero:            txt(ent, 'numero') || String(i + 1),
        titulo:            txt(ent, 'titulo'),
        visto:             txt(ent, 'visto') === '1' ? 1 : 0,
        episodio_actual:   num(ent, 'episodio_actual'),
        episodios_totales: num(ent, 'episodios_totales'),
      });
    });

    entradas.push({ contenido, entregas });
  });

  return entradas;
}
