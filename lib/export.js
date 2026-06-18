const STATUS_LABEL = {
  viendo: 'Viendo', completado: 'Completado', pendiente: 'Pendiente',
  en_pausa: 'En Pausa', abandonado: 'Abandonado',
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generarXml(filas) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<listit>'];

  for (const { item, entregas } of filas) {
    const tipo = (item.tags && item.tags[0]) || item.tipo || 'anime';
    lines.push('  <entrada>');
    lines.push(`    <titulo>${esc(item.titulo)}</titulo>`);
    lines.push(`    <tipo>${esc(tipo)}</tipo>`);
    if (item.estado)            lines.push(`    <estado>${esc(item.estado)}</estado>`);
    if (item.anio)              lines.push(`    <anio>${item.anio}</anio>`);
    if (item.descripcion)       lines.push(`    <descripcion>${esc(item.descripcion)}</descripcion>`);
    if (item.imagen)            lines.push(`    <imagen>${esc(item.imagen)}</imagen>`);
    if (item.episodio_actual)   lines.push(`    <episodio_actual>${item.episodio_actual}</episodio_actual>`);
    if (item.episodios_totales) lines.push(`    <episodios_totales>${item.episodios_totales}</episodios_totales>`);
    if (item.fecha_inicio)      lines.push(`    <fecha_inicio>${esc(item.fecha_inicio)}</fecha_inicio>`);
    if (item.fecha_fin)         lines.push(`    <fecha_fin>${esc(item.fecha_fin)}</fecha_fin>`);

    if (entregas.length > 0) {
      lines.push('    <entregas>');
      for (const e of entregas) {
        lines.push('      <entrega>');
        lines.push(`        <numero>${esc(e.numero)}</numero>`);
        if (e.titulo)            lines.push(`        <titulo>${esc(e.titulo)}</titulo>`);
        lines.push(`        <visto>${e.visto}</visto>`);
        if (e.episodio_actual)   lines.push(`        <episodio_actual>${e.episodio_actual}</episodio_actual>`);
        if (e.episodios_totales) lines.push(`        <episodios_totales>${e.episodios_totales}</episodios_totales>`);
        lines.push('      </entrega>');
      }
      lines.push('    </entregas>');
    }
    lines.push('  </entrada>');
    lines.push('');
  }

  lines.push('</listit>');
  return lines.join('\n');
}

function generarMarkdown(filas) {
  const grupos = {};
  for (const { item } of filas) {
    const g = STATUS_LABEL[item.estado] || item.estado;
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(item);
  }

  const orden = ['Viendo', 'Completado', 'Pendiente', 'En Pausa', 'Abandonado'];
  const lines = ['# Mi Lista — ListIt', ''];

  for (const grupo of orden) {
    if (!grupos[grupo]?.length) continue;
    lines.push(`## ${grupo}`, '');
    lines.push('| Título | Tipo | Año |');
    lines.push('|--------|------|-----|');
    for (const item of grupos[grupo]) {
      const tipo = (item.tags && item.tags[0]) || item.tipo || '–';
      lines.push(`| ${item.titulo} | ${tipo} | ${item.anio || '–'} |`);
    }
    lines.push('');
  }

  lines.push(`*Exportado desde ListIt — ${new Date().toLocaleDateString('es-ES')}*`);
  return lines.join('\n');
}

module.exports = { generarXml, generarMarkdown };
