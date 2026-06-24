// Fuente única de verdad para el texto de progreso bajo el título en la card.
// Extraído de grid.js (función pura) para poder testearlo sin DOM (Tier 1).
export function calcularProgreso(item) {
  const tieneEntregas = (item.total_entregas || 0) > 0;

  if (tieneEntregas) {
    // Temporada única → contador simple, sin prefijo de temporada (decisión 2).
    if ((item.total_entregas || 0) === 1) {
      const epA = item.primera_ep_actual || 0;
      const epT = item.primera_ep_total  || 0;
      if (epT > 0) return `ep. ${epA}/${epT}`;
      if (epA > 0) return `ep. ${epA}`;
      return '';
    }
    const enCurso = (item.entrega_en_curso_id || 0) > 0;
    if (enCurso && item.entrega_en_curso_numero) {
      const num = item.entrega_en_curso_numero;
      const epA = item.entrega_en_curso_ep_actual || 0;
      const epT = item.entrega_en_curso_ep_total  || 0;
      if (epT > 0) return `${num} · ep. ${epA}/${epT}`;
      if (epA > 0) return `${num} · ep. ${epA}`;
      return num;
    }
    // Todas las temporadas completadas (o sin progreso registrado)
    return `${item.entregas_vistas}/${item.total_entregas} temporadas`;
  }

  return '';
}
