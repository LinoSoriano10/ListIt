// Lógica pura de la transición automática de estado al tocar el progreso
// (marcar/desmarcar una temporada o sumar/restar episodios). Extraída para
// poder testearla sin better-sqlite3 (igual que season-status.js). No calcula
// si el contenido está completo -- eso lo hace todasCompletas() sobre las
// entregas -- solo decide el estado resultante dado el estado actual y ese
// booleano. No toca 'abandonado' cuando NO se completa: el usuario lo dejó
// aparte a propósito y tocar un episodio suelto no debe "revivirlo".
function decidirTransicionPorProgreso(estadoActual, completo) {
  if (completo) {
    return estadoActual === 'completado' ? null : { antes: estadoActual, ahora: 'completado' };
  }
  if (estadoActual === 'completado' || estadoActual === 'pendiente' || estadoActual === 'en_pausa') {
    return { antes: estadoActual, ahora: 'viendo' };
  }
  return null;
}

module.exports = { decidirTransicionPorProgreso };
